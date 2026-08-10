# Architecture

## 1. What this extension is

A **Manifest V3** Chrome extension that acts as a _privacy shield_ for Google
Chat. It blurs or hides sensitive UI (conversation names, message previews,
avatars) so they cannot be read over your shoulder, in a screen share, or in a
recording. It runs **only** on `https://chat.google.com/*` and stores everything
**locally** — there are no network calls and no telemetry.

## 2. Runtime components

The extension has four cooperating runtime surfaces, plus a shared style sheet.

```text
                       chrome.storage.local  (single source of truth)
                       gcp-settings | gcp-panel-layout | gcp-threads
                                  ^                       ^
              writes/reads + onChanged sync (two-way)     |
                                  |                        |
        +-------------------------+--------+      +--------+--------------------+
        |  SIDE PANEL (popup.html)         |      |  CONTENT SCRIPT (content.js)|
        |  built from src/popup.ts         |      |  built from src/content.ts  |
        |  - initLayout()  (sections)      |      |  - DOM tagger + observer    |
        |  - initHelp()    (help popovers) |      |  - applySettings() -> body  |
        |  - privacy controls (inline)     |      |    classes + CSS vars       |
        +----------------------------------+      |  - health check             |
                                  ^               |  - hotkeys                  |
            opens panel           |               |  - screen-share handler     |
                                  |               +-----------+-----------------+
        +-------------------------+--------+                  | toggles body classes
        |  BACKGROUND (background.js)      |                  v
        |  built from src/background.ts    |        +---------------------------+
        |  - openPanelOnActionClick        |  msg   |  styles.css (in-page CSS) |
        |  - tabCapture status -> content  |------->|  body.gcp-* { blur/hide } |
        +----------------------------------+        +---------------------------+
```

### 2.1 Side panel — [`src/popup.ts`](../src/popup.ts) → `dist/popup.js`

The control surface, declared via `manifest.side_panel.default_path` and opened
on action-click. It is a thin entry point that composes the feature modules:

```ts
initPower(); // master on/off switch + confirm  (src/panel/power.ts)
initLayout(); // collapsible / draggable sections (src/panel/layout.ts)
initPrivacy(); // privacy controls               (src/panel/privacy.ts)
initUnflow(); // Thread Manager lists + search    (src/panel/unflow.ts)
initBackup(); // export / import JSON             (src/panel/backup.ts)
initHelp(); // per-section help popovers          (src/panel/help.ts)
```

Each module reads/writes its own storage key and subscribes to `onChanged` for
cross-context sync; `popup.ts` itself contains no business logic.

### 2.2 Content script — [`src/content.ts`](../src/content.ts) → `dist/content.js`

Injected into the Google Chat page. Responsibilities:

- **DOM tagger**: walks sidebar list items and stamps `[data-gcp-el="name|preview|avatar"]`
  so the CSS has _stable_ fallback hooks when Google renames its own classes.
- **MutationObserver** (debounced to once / 150 ms): re-tags items as Google's
  SPA mutates the DOM, with a `dataset.gcpDone` guard to avoid re-processing.
- **`applySettings()`**: the core mechanism — sets CSS variables
  (`--gcp-blur`, `--gcp-opacity`) and toggles `body.gcp-*` classes; the visual
  effect itself is pure CSS in `styles.css`.
- **Selector health check** (5 s after load): warns in the console if Google's
  primary selectors stop matching, before/falling back to `[data-gcp-el]`.
- **Hotkeys** and the **screen-share** message handler (see BUSINESS_LOGIC).

### 2.3 Background service worker — [`src/background.ts`](../src/background.ts) → `dist/background.js`

- Enables open-on-action-click for the side panel.
- Listens to `chrome.tabCapture.onStatusChanged` and forwards a
  `GCP_SCREEN_SHARE` message to the tab's content script. (Caveat: `tabCapture`
  only fires for capture started via Chrome extension APIs — it does **not**
  detect OS-level recording or `getDisplayMedia` meeting shares.)

### 2.4 In-page styles — [`src/styles.css`](../src/styles.css)

Declared in `manifest.content_scripts[].css`. Contains the actual blur/hide
rules, each keyed off a `body.gcp-*` class and written against **both** Google's
current class (e.g. `.Vb5pDe`) **and** the extension's `[data-gcp-el]` fallback.
The confirmed Google selectors are documented at the top of that file.

## 3. The "CSS-class as state" pattern

The central design idea: **the content script never blurs elements directly**.
It only flips `body` classes and CSS variables; `styles.css` decides what those
classes mean. Benefits:

- Visual behavior is declarative and editable without touching TypeScript.
- Hover-reveal, panic, and intensity are all just additional selectors/variables.
- Resilient to Google's DOM churn via the `[data-gcp-el]` fallback selectors.

`body` classes currently in use: `gcp-names-blur/hide`, `gcp-preview-blur/hide`,
`gcp-avatars-blur/hide`, `gcp-chat-names-blur/hide`, `gcp-chat-blur/hide`,
`gcp-chat-avatars-blur/hide`, `gcp-hover-reveal`, `gcp-panic`.

## 4. Source layout

Each module has a co-located `*.test.ts` (omitted below for brevity).

```text
src/
  core/               # pure, DOM-free logic shared by panel + content script
    storage.ts        # typed chrome.storage.local access + migration + onChanged helper
    chat.ts           # getThreadId (3-tier) + title/href/hash helpers
  features/           # pure data features (no DOM)
    threads.ts        # ThreadMeta CRUD (alias/pin/tags) + pruning
    backup.ts         # export / serialize / validate / import bundle logic
  panel/              # logic that runs inside the side panel
    power.ts          # master on/off switch + confirm modal
    layout.ts         # collapse/expand + drag-reorder + persist PanelLayout
    privacy.ts        # 3-state privacy controls (extracted from popup.ts)
    unflow.ts         # Thread Manager groups + search + navigate
    backup.ts         # EXPORT/IMPORT buttons -> features/backup
    help.ts           # per-section help popovers
  content/
    inject.ts         # in-page toolbar / alias / badges + focus-thread handler
  content.ts          # content-script entry (tagger, observer, applySettings, hotkeys, initInject)
  popup.ts            # side-panel entry: composes the panel modules (no logic)
  background.ts       # service worker
  types.ts            # shared persisted shapes (single source of truth)
  styles.css          # in-page blur/hide CSS + Unflow decoration glyphs
tests/
  setup.ts            # installs the chrome mock before each test
  helpers/chromeMock.ts
  backward-compat.test.ts  # legacy/partial data normalization
popup.html            # side-panel markup + all panel CSS (emoji as HTML entities)
manifest.json
scripts/build.js      # custom build orchestration (see below)
vite.config.ts        # builds popup.html only
vitest.config.ts      # jsdom + coverage thresholds
studio/               # this documentation
```

The modular `core/` + `panel/` tree is the target architecture: **pure logic is
separated from DOM/UI** so it is unit-testable and reusable by both the panel and
the content script. New features should follow the same shape (a module + a test
beside it).

## 5. Build pipeline — [`scripts/build.js`](../scripts/build.js)

`npm run build` = `tsc && node scripts/build.js`.

1. **`tsc`** type-checks all of `src/**/*.ts` (test files are excluded via
   `tsconfig.exclude`). `noEmit` is set — `tsc` is a gate, not the emitter.
2. **Vite (`vite.config.ts`)** bundles `popup.html` → `dist/popup.js` and copies
   `manifest.json`, `icons/*`, and `src/styles.css` into `dist/`.
3. **Vite (lib mode)** bundles `content.ts` and `background.ts` as self-contained
   **IIFE** files. IIFE is mandatory: Chrome content scripts cannot use ES module
   imports when injected into arbitrary pages.
4. **ASCII escape**: every output JS file is rewritten so any byte > 127 becomes
   a `\uXXXX` escape. This avoids Chrome Web Store rejections from stray
   non-ASCII bytes in JS.

### The ASCII rule (do not break it)

Because step 4 escapes JS but not HTML/CSS, **all emoji and non-ASCII glyphs must
live in `popup.html` or CSS as HTML entities** (e.g. `&#x283F;`, `&#x25BE;`),
never as JavaScript string literals. The help-popover copy follows this rule:
text is authored in `popup.html`; `help.ts` only toggles classes.

The loadable artifact is the **`dist/`** directory (Load unpacked → select
`dist/`), never the repo root.

## 6. State & data flow

`chrome.storage.local` is the single source of truth. Three keys, all accessed
through [`src/core/storage.ts`](../src/core/storage.ts):

| Key                | Shape         | Owner(s)                                        | Sync                        |
| :----------------- | :------------ | :---------------------------------------------- | :-------------------------- |
| `gcp-settings`     | `GCPSettings` | panel (write), content (read+write via hotkeys) | two-way via `onChanged`     |
| `gcp-panel-layout` | `PanelLayout` | panel only                                      | across multiple open panels |
| `gcp-threads`      | `ThreadStore` | panel + content (future Unflow)                 | two-way                     |

Two-way sync example (privacy): the panel writes `gcp-settings` →
`onChanged` fires → the content script re-reads and calls `applySettings()`.
Conversely, a hotkey in the page mutates `gcp-settings` → the panel re-reads and
updates its controls. See [STORAGE.md](STORAGE.md) for the full contract.

## 7. Conventions

- **Language**: everything in code is English — identifiers, comments, JSDoc,
  logs, error messages, test names. (The `UNFLOW_INTEGRATION_PLAN.md` is the only
  intentionally Vietnamese file.)
- **Docs**: every module has a header comment; every exported function has JSDoc
  with `@param`/`@returns`. Comments explain _why_, not _what_.
- **Separation**: pure logic in `core/`/`features/`; DOM/UI in `panel/`/content.
- **Backward compatibility**: only ever _add_ optional fields to persisted
  shapes; never rename/remove. New fields always have defaults. (See STORAGE.md.)
- **Tests**: Vitest + jsdom, AAA structure (Arrange–Act–Assert), behavior-named
  `it(...)`. A `chrome.storage.local` fake lives in `tests/helpers/chromeMock.ts`.
  Coverage thresholds (80%) are enforced for `core/`, `features/`, `panel/`,
  `content/` in `vitest.config.ts`.
- **Style**: Prettier + ESLint configs in the repo; run `npm run format` and
  `npm run lint`.

## 8. Known drift (docs vs. code)

As of 2026-08-11 there is no known drift: `README.md` and `STORE_SUBMISSION.md`
were audited against the shipped code and corrected.

For reference, previously fixed drift:

- `README.md` / `STORE_SUBMISSION.md` advertised **Focus Mode**
  (`Cmd/Ctrl+Shift+F`) and **Auto-Collapse Sidebar** — neither was ever
  implemented (no `F` hotkey, no related body class or `content.ts` logic).
  Both were removed from the copy; the docs now also list the real,
  previously-undocumented features (Master Switch, Thread Manager, Backup &
  Restore, collapsible/draggable sections) and permission justifications for
  `sidePanel` and the `chat.google.com` host permission.
- `popup.html` footer showed `v1.0.0` while `manifest.json` / `package.json`
  were at `1.0.1` — synced to `1.0.1`.
- `README.md` had a stray Vietnamese fragment (`phims tắt`) — fixed to
  "keyboard shortcuts".

Implemented hotkeys today: `Cmd/Ctrl+Shift+P` (toggle panic) and
`Cmd/Ctrl+Shift+L` (cycle names OFF→BLUR→HIDE), both handled in `content.ts`.

If you add a user-facing feature, update `README.md` and `STORE_SUBMISSION.md`
in the same change so this section doesn't need to be reopened.
