# Business Logic

This document is the behavioral contract: for each feature, _what the user sees_
and _the exact rules the code enforces_. File references point at the
implementation so the rule and the code stay in step.

## 0. Master switch (enable / disable)

A header switch toggles `GCPSettings.enabled` (default `true`). Turning it **off**
requires confirming a modal; turning it **on** is immediate.

- **Panel** ([panel/power.ts](../src/panel/power.ts)): reflects/writes `enabled`
  (read-modify-write so privacy fields are preserved), shows the confirm modal on
  disable, and dims/locks `#panel-sections` while off. Stays in sync via
  `onChanged`.
- **Content script** ([content.ts](../src/content.ts) `applySettings`): when
  `enabled` is false every `gcp-*` privacy class is withheld (no blur/hide), the
  body gets `gcp-disabled`, the indicator shows `SHROUDLY OFF`, and the in-page
  Unflow decoration is torn down via `setInjectionEnabled(false)` (toolbars/badges
  removed, aliased names restored). Saved settings and threads are untouched, so
  re-enabling restores everything.

## 1. The three privacy states (OFF / BLUR / HIDE)

Every privacy control is a 3-state value (`PrivacyMode = 'off' | 'blur' | 'hide'`):

- **OFF** — element is fully visible (no class applied).
- **BLUR** — element gets `filter: blur(--gcp-blur)` and `opacity: --gcp-opacity`.
- **HIDE** — element is removed from view (`visibility: hidden`, or `opacity: 0`
  - `pointer-events: none` for avatars).

The mode is stored per target and turned into a `body.gcp-<target>-<mode>` class
by `applySettings()` in [`content.ts`](../src/content.ts); the CSS in
[`styles.css`](../src/styles.css) defines the visual effect.

### Targets

Two groups, each with Names / Messages / Avatars:

| Group        | Setting field     | What it covers                               | Body class prefix    |
| :----------- | :---------------- | :------------------------------------------- | :------------------- |
| Sidebar list | `namesMode`       | conversation/contact names in the left rail  | `gcp-names-*`        |
| Sidebar list | `previewMode`     | last-message preview text                    | `gcp-preview-*`      |
| Sidebar list | `avatarsMode`     | profile pictures / group icons / initials    | `gcp-avatars-*`      |
| Open chat    | `chatNamesMode`   | sender names in the active conversation      | `gcp-chat-names-*`   |
| Open chat    | `chatMode`        | message body text in the active conversation | `gcp-chat-*`         |
| Open chat    | `chatAvatarsMode` | avatars in the active conversation           | `gcp-chat-avatars-*` |

## 2. Hover Reveal (`hoverReveal`, default ON)

When ON, hovering a sidebar list item temporarily removes the blur from that one
item (CSS `:hover` rules with `blur(0) !important; opacity: 1`). It only affects
**blurred** content, not HIDE.

Important interaction: hover-reveal is **suppressed while Panic Mode is on**. The
content script applies the `gcp-hover-reveal` body class only when
`hoverReveal && !panic`, so panic can never be peeked through via hover.

## 3. Intensity sliders

- **Blur Strength** (`blurIntensity`, 1–14, default 3) → CSS var `--gcp-blur`
  (`<n>px`).
- **Opacity** (`opacity`, 10–90 step 5, default 55) → CSS var `--gcp-opacity`
  (`<n>/100`).

These apply everywhere blur is active. In the side panel the slider label updates
**immediately** on input, but the write to `chrome.storage.local` is **debounced
~150 ms** to avoid flooding storage during a drag (see `saveSlider()` in
[`popup.ts`](../src/popup.ts)). Panic mode uses a fixed heavy blur (18px) that is
independent of `blurIntensity`.

## 4. Screen Share Guard (`autoShareProtect`, default OFF)

Auto-protection driven by the background worker:

1. `background.ts` listens to `chrome.tabCapture.onStatusChanged`.
2. On `active`, it sends `{ type: 'GCP_SCREEN_SHARE', active: true }` to the tab.
3. `content.ts` receives it; **if `autoShareProtect` is on**, it snapshots the
   current modes (`namesMode`, `previewMode`, `avatarsMode`, `chatNamesMode`,
   `chatMode`) into `preShareSnapshot` and forces them all to `blur`.
4. When capture ends (`active: false`), it restores the snapshot exactly.

The snapshot is in-memory and applied via `applySettings()` only — it does **not**
persist to storage, so the user's saved preferences are never overwritten.

**Caveat (documented in code):** `tabCapture` only detects capture initiated by
Chrome extension APIs. It does _not_ fire for OS-level recording (OBS, macOS
screenshot tools) or for `getDisplayMedia`-based meeting screen shares. Panic Mode
is the manual fallback for those cases.

## 5. Panic Mode (`panic`, default OFF)

Instant full-window obfuscation. When on, `body.gcp-panic > *` applies an 18px
blur to every direct child of `<body>` (chosen over `body.gcp-panic *` to avoid
creating a GPU stacking context per element). The floating status indicator is
explicitly excluded so it stays readable.

Triggered by the toggle in the panel **or** the hotkey. While active it
suppresses hover-reveal (see §2).

## 6. Hotkeys (handled in `content.ts`)

Work while the Google Chat page is focused. Modifier is **Cmd (macOS) or Ctrl
(Windows/Linux)** plus **Shift**.

| Shortcut               | Action                                    |
| :--------------------- | :---------------------------------------- |
| `Cmd/Ctrl + Shift + P` | Toggle Panic Mode                         |
| `Cmd/Ctrl + Shift + L` | Cycle Names mode: OFF → BLUR → HIDE → OFF |

A hotkey mutates the in-memory settings and calls `persist()`, which writes
`gcp-settings` and re-applies. The write triggers `onChanged`, which updates the
side panel UI — keeping page and panel in sync.

> Drift: `Cmd/Ctrl+Shift+F` (Focus Mode) is advertised but **not implemented**.
> See [ARCHITECTURE.md → Known drift](ARCHITECTURE.md#known-drift-docs-vs-code).

## 7. Status indicator

A floating `#gcp-indicator` bottom-right on the page, created lazily. It shows the
active privacy summary (e.g. `[*] names:blur · msg:blur`) or `[!] PANIC MODE`,
fades in on change, and auto-hides after ~2 s. It is excluded from panic blur.

## 8. Side-panel sections (collapsible / draggable / persisted)

Implemented in [`src/panel/layout.ts`](../src/panel/layout.ts); state in
`gcp-panel-layout`.

- All original privacy controls are wrapped in **one** section
  (`data-section-id="privacy"`, "Privacy Shield"); a second section
  (`data-section-id="unflow"`, "Thread Manager") is a placeholder.
- **Collapse/expand**: clicking a section header toggles a `collapsed` class and
  persists `collapsed[id]`.
- **Drag-reorder**: HTML5 drag-and-drop on the header reorders sections; the new
  order is read back from the DOM and persisted to `order`.
- **Persistence** is debounced ~150 ms; on init the saved order + collapsed state
  are reapplied so the layout survives reload and reopen.
- Sections present in the DOM but missing from the saved `order` are **appended**,
  so adding a new section later needs no migration.
- Multiple open panels stay in sync via an `onChanged` subscription on the key.

## 9. Section help popovers

Implemented in [`src/panel/help.ts`](../src/panel/help.ts); copy lives in
`popup.html`.

- Each section exposes a small monochrome **info button** (`?` in a circle).
- Clicking it **unfolds** a rounded popover (CSS `transform-origin: top right`
  scale/opacity transition) anchored to the button, showing English usage notes.
- Only one popover is open at a time; opening one closes the others.
- Closes on outside click or `Escape`. The button's click is `stopPropagation`-ed
  so it never also toggles the section's collapse state.

## 10. Persisted settings (defaults)

`GCPSettings` defaults (identical in `popup.ts`, `content.ts`, and
`core/storage.ts` `DEFAULT_SETTINGS` — keep them in sync):

```text
namesMode: 'blur'      previewMode: 'blur'    avatarsMode: 'off'
chatNamesMode: 'off'   chatMode: 'off'        chatAvatarsMode: 'off'
hoverReveal: true      autoShareProtect: false  panic: false
blurIntensity: 3       opacity: 55
```

## 11. Unflow "Thread Manager"

Per-thread organization, persisted in `gcp-threads` (see [STORAGE.md](STORAGE.md)).

**In the page** ([content/inject.ts](../src/content/inject.ts)): each conversation
list item gets a hover toolbar with three crisp text buttons — **PIN / TAG /
ALIAS** (text labels rather than icons, so they read clearly against Google's UI
and match the terminal aesthetic). Active state (pinned / has-tags) lights the
corresponding button green.

The buttons:

- **PIN** = priority/save. The thread shows an amber `PIN` badge, joins the
  panel's **Pinned** group, and floats to the top of the panel's **Recent** list.
- **TAG** / **ALIAS** annotate the thread (see below).

> A "Follow" button existed briefly but was **merged into Pin** — tags already
> cover categorization, so a second on/off bucket was redundant. The
> `ThreadMeta.following` field is kept (deprecated, no UI writes it) only so older
> stored data round-trips unchanged.

Setting an alias inserts a solid green **alias chip before the title** (the title
and its icon are left untouched — overwriting the title element misplaced it on
some item types, e.g. Home threads, and overflowed for long aliases). The chip is
width-capped with an ellipsis, so a long alias never spills. Pin and tags show as
badges rendered as an **absolute overlay** inside the row (a normal-flow element
would add height and be clipped by Google's fixed-height list rows).

**Removing annotations:** click a **tag chip** (in the page badges or the panel)
to delete that tag; click the **alias chip** to reopen the editor prefilled
(clear it + Enter removes the alias). Both also work from the panel chips. Each tag chip is tinted by a deterministic **pastel**
color ([core/tagColor.ts](../src/core/tagColor.ts), shared with the panel) so the
same tag looks identical everywhere and stays easy to read (dark text on a soft
background). CRUD goes through
[features/threads.ts](../src/features/threads.ts), which stamps `updatedAt`,
prunes any entry left with no alias/pin/tags, and — for **every** action
(pin/tag/alias) — snapshots the conversation's real title into
`originalTitle` on first creation, so the panel lists can show a readable name
instead of the raw thread id.

> Thread id resolution ([core/chat.ts](../src/core/chat.ts)) tries, in order:
> `data-thread-id`/`data-room-id`/`data-member-id`; then `data-group-id`
> (+`data-topic-id` for threads, so a thread is distinct from its parent Space
> even though they share the Space name); then a `/room|dm/` href; then a hash of
> the name (`name#<hash>`) as a last resort, logged at `console.debug`.
>
> The DOM tagger ([content.ts](../src/content.ts)) skips icon-font glyphs
> (Material Symbols `<i>` whose ligature text, e.g. "spool", renders as an icon)
> and `aria-hidden` nodes when picking the name element — otherwise the alias
> chip would attach to the thread icon instead of the title.

**In the panel** ([panel/unflow.ts](../src/panel/unflow.ts)): the "Thread Manager"
section lists saved threads grouped into **Pinned / Tagged / Recent** (each sorted
by `updatedAt`, except **Recent floats pinned threads to the top**).
A search box filters by alias, original title, or tag (`#tag` restricts to tags).
Clicking a row sends `GCP_FOCUS_THREAD` to the content script, which scrolls the
conversation into view and activates it; clicking a tag chip removes that tag.

Page and panel stay in sync because both mirror `gcp-threads` via `onChanged`.

## 12. Backup / restore

The "Backup" section exports all three storage keys as a versioned JSON bundle
and imports it back (see [STORAGE.md §8](STORAGE.md#8-backup--restore)). Pure
logic is in [features/backup.ts](../src/features/backup.ts); the panel wiring
(download, file picker, confirm-before-overwrite, status) is in
[panel/backup.ts](../src/panel/backup.ts). Import validates the envelope, skips
missing slices, and normalizes each slice, so a bad or partial file reports an
error instead of corrupting existing data.

A red **CLEAR ALL DATA** button (`resetAll()`) wipes settings, layout, and all
threads back to factory defaults; it is guarded by a confirm modal because it is
destructive and irreversible. The resulting `onChanged` events re-render the
panel and content script automatically.
