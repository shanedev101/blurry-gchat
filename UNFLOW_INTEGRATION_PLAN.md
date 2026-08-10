# Plan: Tích hợp "Unflow" + Side Panel Sections (collapsible / drag-drop / persisted) vào Shroudly

## Context

**Shroudly** (repo folder `blurry-gchat`) hiện là một Chrome MV3 extension **privacy shield** cho Google Chat:

- Render như **side panel** (`manifest.json` → `side_panel.default_path: popup.html`), luôn hiển thị cạnh Google Chat.
- Side panel ([popup.html](popup.html)) gồm 5 section tĩnh: `// sidebar list`, `// chat content`, `// intensity`, `// danger`, `// hotkeys`. Style terminal/mono, nền đen `#0a0a0a`, accent neon green `#00ff88`.
- State lưu ở `chrome.storage.local` key `gcp-settings` (kiểu [GCPSettings](src/types.ts)), đồng bộ 2 chiều side panel ↔ content script qua `chrome.storage.onChanged`.
- [content.ts](src/content.ts) đã có **MutationObserver (debounce 150ms)**, **DOM tagger** (`[data-gcp-el="name|preview|avatar"]`) và **selector health-check** — hạ tầng quý để tái dùng cho Unflow.
- Build: TypeScript + Vite; content/background bundle IIFE riêng qua [scripts/build.js](scripts/build.js), ép ASCII (nên mọi emoji/ký tự non-ASCII trong UI phải để ở **HTML/CSS**, không hard-code trong JS string).

**Mục tiêu (đã chốt với người dùng):**

1. **Giữ nguyên style UI hiện tại**, nhưng gom **toàn bộ control hiện tại vào 1 section** collapse/expand được; các section có thể **drag-drop đổi thứ tự**; **lưu thứ tự + trạng thái collapse** vào `chrome.storage.local` để bền qua reload/mở lại.
2. Thêm **section mới "Thread Manager" (Unflow)** trong side panel.
3. Triển khai **đầy đủ Unflow MVP** (alias, pin, follow, tags, search, danh sách) — **vừa hiển thị trong side panel, vừa inject icon/alias vào trang Google Chat**.
4. Lưu state bằng `chrome.storage.local` (đồng nhất codebase, KHÔNG dùng localStorage vì content script & side panel cần chia sẻ dữ liệu).

**Điều chỉnh so với spec Unflow gốc:** spec yêu cầu "Vanilla JS / ES Modules / no framework". Ta **adapt sang stack hiện có (TypeScript + Vite + IIFE)** thay vì vanilla JS thuần — giữ tính nhất quán, type-safety, và pipeline build sẵn có. Kiến trúc feature-based vẫn được giữ qua thư mục `src/`.

---

## Storage Model (chrome.storage.local)

Thêm 2 key mới, **không đụng** `gcp-settings`:

```ts
// Key: 'gcp-panel-layout'  — bố cục side panel
interface PanelLayout {
  order: string[]; // vd ['privacy','unflow']
  collapsed: Record<string, boolean>; // { privacy:false, unflow:false }
}

// Key: 'gcp-threads'  — dữ liệu Unflow per-thread
type ThreadStore = Record<string, ThreadMeta>;
interface ThreadMeta {
  threadId: string;
  alias?: string;
  originalTitle?: string; // tiêu đề gốc để khôi phục/đối chiếu
  pinned: boolean;
  following: boolean;
  tags: string[];
  updatedAt: number;
}
```

Mở rộng [src/types.ts](src/types.ts) với `PanelLayout`, `ThreadMeta`, `ThreadStore`, `BackupFile` (xem Phase 10). Mọi đọc/ghi merge-with-default giống pattern hiện tại (`{ ...default, ...result[KEY] }`).

---

## Kiến trúc file (feature-based, TypeScript)

Tái cấu trúc nhẹ — tách `popup.ts` đơn khối thành module, thêm cây Unflow:

```text
src/
  core/
    storage.ts        # get/set typed cho từng key + onChanged subscribe helper
    chat.ts           # getThreadId(item), extract title, điều hướng SPA
  panel/              # logic chạy trong side panel
    layout.ts         # collapse/expand + drag-drop reorder + persist PanelLayout
    privacy.ts        # TOÀN BỘ logic privacy hiện tại (chuyển từ popup.ts)
    unflow.ts         # render section Unflow: lists (Pinned/Following/Tagged/Recent) + search
  features/           # logic dùng chung cả content & panel
    threads.ts        # CRUD ThreadMeta (alias/pin/follow/tags) trên gcp-threads
  content/            # mở rộng content script (giữ file content.ts làm entry)
    inject.ts         # inject toolbar hover (pin/eye/tag/alias) + render alias/badge vào DOM
  content.ts          # entry: privacy DOM (như cũ) + khởi tạo inject.ts
  popup.ts            # entry side panel: init layout + privacy + unflow
  types.ts            # + PanelLayout, ThreadMeta, ThreadStore
  styles.css          # + style toolbar/alias/badge inject (in-page)
```

`popup.html` thêm CSS cho section/collapse/drag + markup section Unflow (mọi emoji ở HTML entity như code hiện tại để qua bước ASCII-escape).

---

## Nguyên tắc Maintainability & Tương thích ngược

Áp dụng xuyên suốt mọi phase để sau này thêm tính năng không phá vỡ cái cũ:

- **Tách UI ↔ logic:** mọi business logic (storage, threads CRUD, backup, chat parsing) là hàm thuần trong `src/core` & `src/features`, không đụng DOM → dễ test & tái dùng cho cả panel lẫn content script. UI (`src/panel/*`, `src/content/inject.ts`) chỉ gọi xuống logic.
- **Storage versioning + migration:** mỗi key có `schemaVersion` (hoặc suy từ `BackupFile.version`). Viết `migrate(raw, fromVersion)` trong `src/core/storage.ts` — load luôn chạy qua migrate rồi merge-with-default. Quy tắc bất biến: **chỉ thêm field, không đổi tên/xóa key cũ**; field mới luôn có default → bản cũ đọc được data mới và ngược lại.
- **Module độc lập, interface rõ:** mỗi feature 1 thư mục, export API hẹp; thêm feature mới = thêm module + test riêng, không sửa module cũ (Open/Closed).
- **Hằng số tập trung:** mọi storage key, selector, default gom vào 1 chỗ (`src/core/storage.ts` / `constants`) để đổi 1 nơi.
- **No breaking change:** giữ nguyên key `gcp-settings` và shape `GCPSettings` hiện có; tính năng mới dùng key mới.
- **Mỗi phase kèm test:** không coi phase "xong" nếu chưa có unit test cho logic mới + cập nhật integration cho flow liên quan (xem Phase 11).

## Chuẩn code & ngôn ngữ (open-source ready)

- **Tất cả trong project bằng tiếng Anh:** code, tên biến/hàm, comment, commit message, JSDoc, log, error message, tên test. (Tài liệu plan này tiếng Việt là ngoại lệ duy nhất cho trao đổi nội bộ.)
- **Comment chuẩn, chất lượng open-source:** mỗi module/file có header mô tả mục đích; mọi hàm public có **JSDoc** (mô tả + `@param`/`@returns`); comment giải thích _tại sao_ (lý do/quyết định/cạm bẫy) chứ không lặp lại _cái gì_ code đã nói. Không để TODO/placeholder/mock trong code giao nộp.
- **Code style nhất quán:** tuân Prettier + ESLint sẵn có; đặt tên rõ nghĩa, hàm nhỏ một nhiệm vụ, không lặp code.
- **Test theo AAA (Arrange–Act–Assert):** mỗi test chia rõ 3 khối (có comment `// Arrange` / `// Act` / `// Assert` khi giúp dễ đọc), tên test mô tả hành vi (`it('returns null when no thread id attributes present')`), mỗi test một assertion-intent.

---

## Phase 0 — Giao tài liệu & nền tảng

- Lưu plan này thành `UNFLOW_INTEGRATION_PLAN.md` ở project root.
- Mở rộng [src/types.ts](src/types.ts) (các interface ở trên).
- Tạo [src/core/storage.ts](src/core/storage.ts): hàm typed `getLayout/setLayout`, `getThreads/setThreads`, `onKeyChanged(key, cb)` — gói lại pattern `chrome.storage.local` đang lặp ở popup.ts/content.ts.

## Phase 1 — Khung Side Panel: section collapse + drag-drop + persist ⭐ (yêu cầu lõi)

**popup.html:**

- Bọc **toàn bộ 5 section hiện tại** vào **1 section duy nhất** `<div class="panel-section" data-section-id="privacy">` với header riêng (`.psec-head` chứa drag-handle `⠿`, tiêu đề "Privacy Shield", chevron collapse) và body `.psec-body` chứa nguyên các `// sidebar list / chat content / intensity / danger / hotkeys` (giữ làm sub-label bên trong).
- Thêm section thứ 2 `data-section-id="unflow"` (markup ở Phase 8, Phase này chỉ cần placeholder).
- CSS mới (cùng tông neon): `.panel-section`, `.psec-head` (cursor drag), `.psec-body`, trạng thái `.collapsed` (ẩn body + xoay chevron), `.dragging`/`.drag-over` (viền green-glow).

**src/panel/layout.ts:**

- Đọc `gcp-panel-layout`; nếu trống dùng default `order=['privacy','unflow']`, `collapsed` all false.
- **Reorder DOM** theo `order` khi init.
- **Collapse/expand:** click `.psec-head` → toggle `.collapsed`, ghi `collapsed[id]`.
- **Drag-drop:** HTML5 DnD trên `.psec-head` (`draggable`, `dragstart/dragover/drop`); sau khi thả, đọc lại thứ tự DOM → ghi `order`. Debounce ghi ~150ms như slider.
- Subscribe `onChanged` để đồng bộ nếu mở nhiều panel.

✅ Checkpoint: build, load extension, collapse/expand + kéo đổi chỗ 2 section, reload trình duyệt → thứ tự & trạng thái giữ nguyên. (Privacy controls vẫn hoạt động vì DOM con không đổi.)

## Phase 2 — Tách privacy logic

- Chuyển toàn bộ logic trong [src/popup.ts](src/popup.ts) sang `src/panel/privacy.ts` (không đổi hành vi). `popup.ts` chỉ `initLayout(); initPrivacy(); initUnflow();`.
- ✅ Checkpoint: privacy hoạt động y hệt trước.

## Phase 3 — Core Google Chat: threadId + điều hướng

**src/core/chat.ts** — `getThreadId(item: HTMLElement): string | null` theo thứ tự ưu tiên (resilient):

1. `data-thread-id` / `data-room-id` / `data-member-id` (đã có trong `ITEM_SELECTORS`).
2. `href`/anchor chứa `/room/…`, `/dm/…`.
3. Fallback: hash ổn định từ text tên (chấp nhận rủi ro trùng tên — log cảnh báo).

- Helper lấy tiêu đề gốc từ `[data-gcp-el="name"]` (tái dùng tagger sẵn có).
- ✅ Checkpoint: log threadId cho mỗi list item, xác nhận ổn định khi điều hướng SPA.

## Phase 4 — features/threads.ts (CRUD)

- API: `getThread(id)`, `setAlias(id, alias)`, `togglePin(id)`, `toggleFollow(id)`, `addTag/removeTag(id, tag)` — đọc/ghi `gcp-threads`, set `updatedAt`. Dọn entry rỗng (no alias/pin/follow/tags).
- ✅ Checkpoint: test qua console.

## Phase 5 — Inject vào trang Google Chat (content/inject.ts)

- Mở rộng MutationObserver/tagger sẵn có trong [content.ts](src/content.ts): với mỗi list item, gọi `inject.ts` để (a) hiện **hover toolbar** nhỏ (pin / eye-follow / tag / edit-alias) ở góc phải item; (b) áp **alias** (thay text hiển thị của `[data-gcp-el="name"]`, giữ original); (c) hiện **badge** pin/tags.
- Reuse `dataset.gcpDone` guard để tránh inject trùng; dọn listener đúng cách (tránh memory leak).
- Style toolbar/alias/badge thêm vào [src/styles.css](src/styles.css) — subtle, native-feeling, neon nhẹ.
- Subscribe `onChanged('gcp-threads')` → re-render badge/alias khi đổi từ side panel.
- ✅ Checkpoint: hover thread thấy toolbar; pin/follow/alias phản ánh ngay trên trang.

## Phase 6–7 — Alias / Pin / Follow / Tags (nối UI ↔ store)

- Alias: click edit → modal/inline input (component nhỏ trong `inject.ts` & panel) → `setAlias`.
- Pin & Follow: toggle qua toolbar icon.
- Tags: thêm/xóa tag (chip), tag list editable.
- ✅ Checkpoint: mỗi thao tác bền qua reload, đồng bộ panel ↔ page.

## Phase 8 — Section "Thread Manager" trong side panel (src/panel/unflow.ts)

- Render trong section `data-section-id="unflow"` các nhóm: **📌 Pinned**, **👀 Following**, **🏷 Tagged**, **🕒 Recent** (sort theo `updatedAt`). Mỗi mục hiện alias (fallback originalTitle) + tag chips; click → focus/điều hướng tới thread (gửi message tới content script bằng `chrome.tabs.sendMessage`).
- Style đồng bộ `.seg-row`/`.row-*` hiện có.
- ✅ Checkpoint: dữ liệu khớp giữa page và panel.

## Phase 9 — Search

- **src/panel/unflow.ts:** ô search lọc realtime theo **alias + tags** trên toàn bộ `gcp-threads`.
- ✅ Checkpoint: gõ → lọc tức thời.

## Phase 10 — Backup / Restore (Export & Import JSON)

Mục tiêu: mang toàn bộ cấu hình + dữ liệu sang máy/browser khác.

**UI:** thêm 1 section nhỏ trong side panel `data-section-id="backup"` (label `// backup`, đồng tông neon) với 2 nút: **EXPORT** và **IMPORT** + dòng status nhỏ (giống `.fstatus`).

**src/features/backup.ts** — logic thuần, tách khỏi UI:

- `exportAll()`: đọc cả 3 key (`gcp-settings`, `gcp-panel-layout`, `gcp-threads`) qua `src/core/storage.ts`, gói thành object có version (shape `BackupFile`): `{ app:'shroudly', version:1, exportedAt, data:{ settings?, layout?, threads? } }`. → `JSON.stringify` → tải file qua `Blob` + `URL.createObjectURL` + thẻ `<a download>`, tên `shroudly-backup-YYYYMMDD.json`.
- `importAll(json)`: dùng `<input type="file" accept="application/json">` → đọc text → `JSON.parse` → **validate** (`app === 'shroudly'`, `version` hỗ trợ, từng phần đúng shape) → merge-with-default rồi `set` lại 3 key. Phần thiếu thì bỏ qua, không ghi đè bằng rỗng.
- Import xong: ghi storage → `onChanged` tự lan ra → privacy/layout/unflow re-render, content script áp lại (không cần reload thủ công).

**Lưu ý:**

- Validate kỹ + try/catch, báo lỗi rõ trên status ("invalid file" / "imported ✓"). Không crash khi file sai.
- Hỏi xác nhận trước khi import (ghi đè dữ liệu hiện tại) — confirm đơn giản.
- Giữ ASCII trong JS: text/emoji nút để ở `popup.html`.
- ✅ Checkpoint: export → đổi tên/pin vài thread, đổi thứ tự section → import lại file cũ → state khôi phục đúng; thử import file rác → báo lỗi, không hỏng dữ liệu.

## Phase 11 — Testing (Unit + Integration + Coverage)

Mục tiêu: phủ test mọi function logic, kiểm flow toàn app, để mỗi lần update sau này chạy lại test là biết có vỡ gì không (regression-safe).

**Setup:**

- Thêm **Vitest** (tích hợp Vite sẵn có) + `@vitest/coverage-v8` + `jsdom` (môi trường DOM) + `@types/chrome` (đã có).
- Mock `chrome.storage.local` bằng một in-memory fake (`tests/helpers/chromeMock.ts`): `get/set/onChanged` đúng hành vi (gồm bắn `onChanged`). Cài qua `globalThis.chrome` trong `tests/setup.ts`.
- Config `vitest.config.ts`: `environment:'jsdom'`, `setupFiles`, `coverage` (provider v8, reporter text+html, **thresholds** lines/functions/branches ~80–90%, include `src/core`, `src/features`, `src/panel`, `src/content`).
- Test đặt cạnh module: `*.test.ts` (vd `src/features/threads.test.ts`) hoặc thư mục `tests/`.

**Unit test (phủ hết function — đặc biệt logic thuần):**

- `core/storage.ts`: get/set merge-with-default, `migrate()`, `onKeyChanged` bắn đúng key.
- `core/chat.ts`: `getThreadId` cả 3 tầng fallback (data-attr / href / hash), edge case null/trùng tên.
- `features/threads.ts`: setAlias/togglePin/toggleFollow/add+removeTag, `updatedAt`, dọn entry rỗng.
- `features/backup.ts`: `exportAll` ra đúng shape `BackupFile`; `importAll` validate (app/version/shape), reject file rác, merge không ghi đè bằng rỗng, **roundtrip export→import bằng nhau**.
- `panel/layout.ts`: tính `order` sau reorder, toggle `collapsed`, đọc/ghi `PanelLayout`.

**Integration test (flow toàn app, dùng jsdom + chrome mock):**

- **Privacy flow:** init panel → click seg/toggle → `gcp-settings` cập nhật → content `applySettings()` set đúng body class + CSS var.
- **Section flow:** collapse + reorder → `gcp-panel-layout` lưu → init lại từ storage → DOM khôi phục đúng thứ tự/trạng thái.
- **Unflow flow:** dựng DOM giả giống Google Chat list → pin/alias/tag qua inject → `gcp-threads` cập nhật → panel render đúng nhóm Pinned/Tagged + search lọc đúng.
- **Backup flow:** tạo state → export → clear storage → import → state khôi phục y hệt.
- **Backward-compat:** nạp data "phiên bản cũ" (thiếu field mới / `BackupFile.version` cũ) → `migrate`+default xử lý, không mất dữ liệu, không throw.

**Scripts (package.json):** `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:cov": "vitest run --coverage"`. Khuyến nghị chạy `npm test` trong CI/pre-push để mỗi update verify lại toàn bộ.

- ✅ Checkpoint: `npm run test:cov` xanh, coverage đạt threshold; mọi flow ở trên pass.

---

## Rủi ro & giảm thiểu (Google Chat DOM)

- **Google đổi class names:** đã có cơ chế `[data-gcp-el]` tagger + health-check trong [content.ts](src/content.ts) — mở rộng health-check cho selector mới của Unflow; ưu tiên `role`/`data-*` ổn định hơn class.
- **threadId không ổn định:** chiến lược 3 tầng ở Phase 3, fallback hash + cảnh báo console.
- **MutationObserver dày đặc:** giữ debounce 150ms, guard `gcpDone`, tránh inject lặp & leak.
- **ASCII-escape build:** giữ emoji ở HTML/CSS, không ở JS literal.

## Files chính sẽ tạo/sửa

- Tạo: `src/core/storage.ts`, `src/core/chat.ts`, `src/panel/layout.ts`, `src/panel/privacy.ts`, `src/panel/unflow.ts`, `src/features/threads.ts`, `src/features/backup.ts`, `src/content/inject.ts`, `UNFLOW_INTEGRATION_PLAN.md`.
- Test: `vitest.config.ts`, `tests/setup.ts`, `tests/helpers/chromeMock.ts`, các `*.test.ts` cạnh module.
- Sửa: [popup.html](popup.html) (wrap section + markup Unflow + CSS), [src/popup.ts](src/popup.ts) (thành entry mỏng), [src/content.ts](src/content.ts) (gọi inject), [src/styles.css](src/styles.css) (style inject), [src/types.ts](src/types.ts), [package.json](package.json) (devDeps vitest/jsdom/coverage + scripts test).
- Không cần đổi `manifest.json` (permissions `storage` đã đủ; vẫn chỉ `chat.google.com`).

## Verification (end-to-end)

1. `npm run build` → load `dist/` qua `chrome://extensions` (Load unpacked).
2. Mở `chat.google.com`, mở side panel.
3. **Sections:** collapse/expand, kéo đổi thứ tự "Privacy" ↔ "Thread Manager"; reload tab + đóng/mở lại Chrome → thứ tự & collapse giữ nguyên.
4. **Privacy:** xác nhận blur/hide/intensity/panic/hotkeys vẫn hoạt động như cũ.
5. **Unflow:** hover thread → pin/follow/alias/tag; kiểm tra alias hiển thị inline, badge đúng; mục xuất hiện đúng nhóm trong panel; search lọc theo alias/tag; tất cả bền qua reload.
6. **Backup:** Export → đổi tên/pin vài thread + đổi thứ tự section → Import lại file → state khôi phục đúng; import file rác → báo lỗi, dữ liệu không hỏng. Test cross-browser: export ở máy A, import ở máy B.
7. Console: health-check pass, không lỗi/leak; đồng bộ 2 chiều panel ↔ page.
8. **Tự động:** `npm run test:cov` xanh + đạt coverage threshold; `npm run lint`; `npm run build` không lỗi. Chạy lại bộ này mỗi lần update tính năng để bắt regression.
