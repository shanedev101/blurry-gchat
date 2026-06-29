# Storage & Persistence

All persistence uses **`chrome.storage.local`** (never `localStorage`, because
the content script and the side panel must share the same data). Every read and
write goes through [`src/core/storage.ts`](../src/core/storage.ts), which is the
single place that knows the key names, the defaults, and the migration rules.

## 1. Keys

Defined once in `STORAGE_KEYS` (`core/storage.ts`):

| Constant                | Key string         | Shape         | Introduced           |
| :---------------------- | :----------------- | :------------ | :------------------- |
| `STORAGE_KEYS.settings` | `gcp-settings`     | `GCPSettings` | original             |
| `STORAGE_KEYS.layout`   | `gcp-panel-layout` | `PanelLayout` | sections feature     |
| `STORAGE_KEYS.threads`  | `gcp-threads`      | `ThreadStore` | Unflow (types ready) |

The shapes themselves are declared in [`src/types.ts`](../src/types.ts), which is
the single source of truth for persisted data.

## 2. Shapes

```ts
interface GCPSettings {
  enabled; // master on/off switch (default true)
  namesMode;
  previewMode;
  avatarsMode; // sidebar list (PrivacyMode)
  chatNamesMode;
  chatMode;
  chatAvatarsMode; // open chat (PrivacyMode)
  hoverReveal;
  autoShareProtect;
  panic; // booleans
  blurIntensity;
  opacity; // numbers
}

interface PanelLayout {
  order: string[]; // section ids, top-to-bottom
  collapsed: Record<string, boolean>; // section id -> collapsed?
}

interface ThreadMeta {
  threadId: string;
  alias?;
  originalTitle?;
  pinned: boolean;
  following: boolean; // deprecated (Follow merged into Pin); kept for data compat
  tags: string[];
  updatedAt: number;
}
type ThreadStore = Record<string, ThreadMeta>;

interface BackupFile {
  // export/import bundle (Unflow phase 10)
  app: 'shroudly';
  version: number;
  exportedAt: number;
  data: { settings?; layout?; threads? };
}
```

## 3. The backward-compatibility contract (the golden rule)

> **Only ever ADD optional fields. Never rename or remove an existing field.
> Every new field must have a default.**

This is what lets an older build read data written by a newer build (it ignores
unknown fields) and a newer build read data written by an older build (missing
fields fall back to defaults). Concretely:

- `gcp-settings` only grows by **additive** fields with a default (e.g. `enabled`
  was added with default `true`); existing fields are never renamed or removed.
  Larger features use **new keys** instead.
- `PanelLayout.order` tolerates unknown section ids, and `layout.ts` appends DOM
  sections missing from `order` — so introducing a section needs no migration.

## 4. Read path: migrate → merge-with-default

Every typed getter runs the raw stored value through a **normalizer**
(`migrate*`) before returning it. A normalizer takes _whatever is on disk_
(possibly from an older build, partially written, or corrupted) and returns a
valid, fully-defaulted object — repairing or dropping bad data instead of letting
callers crash.

| Getter          | Normalizer                             | Behavior                                                                                  |
| :-------------- | :------------------------------------- | :---------------------------------------------------------------------------------------- |
| `getSettings()` | `migrateSettings`                      | `{ ...DEFAULT_SETTINGS, ...raw }`                                                         |
| `getLayout()`   | `migrateLayout`                        | coerces `order` to `string[]`, `collapsed` to `Record<string,boolean>`; keeps unknown ids |
| `getThreads()`  | `migrateThreads` → `migrateThreadMeta` | per-entry repair; drops entries with no salvageable id; filters non-string tags           |

`SCHEMA_VERSION` (currently `1`) is exported for when a _structural_ change ever
needs a real migration step. Additive optional fields never require bumping it,
because merge-with-default already covers them.

## 5. Write path

Typed setters (`setSettings`, `setLayout`, `setThreads`) wrap
`chrome.storage.local.set` as promises. In the thread store, empty entries (no
alias/pin/tags) are pruned on write by
[`features/threads.ts`](../src/features/threads.ts) to keep the store compact.

## 6. Change subscription

`onKeyChanged(key, cb)` wraps `chrome.storage.onChanged`, filtering to the
`local` area and a single key, and returns an **unsubscribe** function. This is
the backbone of two-way sync:

- The content script subscribes to `gcp-settings` and re-applies on change.
- The side panel subscribes to `gcp-settings` (sync controls) and
  `gcp-panel-layout` (sync layout across multiple open panels).

## 7. Testing storage

`tests/helpers/chromeMock.ts` is a faithful in-memory fake of
`chrome.storage.local` that **diffs writes and fires `onChanged`** with
`{ oldValue, newValue }` and area `'local'`, exactly like the real API.
`tests/setup.ts` installs a fresh mock on `globalThis.chrome` before each test so
storage state never leaks between tests. See
[`src/core/storage.test.ts`](../src/core/storage.test.ts) for migration, roundtrip,
and subscription coverage.

## 8. Backup / restore

Implemented in [`features/backup.ts`](../src/features/backup.ts). `BackupFile` is
the export bundle shape: `exportAll()` reads all three keys into a versioned
object; `serializeBackup()` pretty-prints it for download. On import,
`parseBackup()` validates `app === 'shroudly'` + a supported `version` + object
shape (throwing a user-facing message on failure), then `importAll()` runs each
present slice through its normalizer and writes it back — skipping absent slices
so a partial bundle never overwrites data with empty. After the writes,
`onChanged` propagates to the panel and content script automatically. The panel
wiring ([`panel/backup.ts`](../src/panel/backup.ts)) confirms before overwriting
and reports `imported`/`exported`/error status. `resetAll()` is the destructive
counterpart: it writes `DEFAULT_SETTINGS`, the default layout, and an empty
thread store (the "CLEAR ALL DATA" button, guarded by a confirm modal).
