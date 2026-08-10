# Studio — Engineering Documentation

This folder is the maintainer's handbook for the extension (**Shroudly**, renamed
from the original "Blurry GChat"). It explains how the extension is built and why,
so future changes can be made safely without re-reverse-engineering the codebase.

> Scope note: these documents describe the codebase as it actually exists today.
> Where the user-facing docs (`README.md`, `STORE_SUBMISSION.md`) advertise
> features that are not in the shipped code, that drift is called out explicitly
> (see [ARCHITECTURE.md → Known drift](ARCHITECTURE.md#known-drift-docs-vs-code)).

## Index

| Document                                 | What it covers                                                                                            |
| :--------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | Component map, runtime topology, build pipeline, data flow, conventions, known drift.                     |
| [BUSINESS_LOGIC.md](BUSINESS_LOGIC.md)   | Every user-facing feature and the exact rules behind it.                                                  |
| [STORAGE.md](STORAGE.md)                 | Persistence model: keys, shapes, migration, and the backward-compatibility contract.                      |
| [RENAME_RESEARCH.md](RENAME_RESEARCH.md) | Can we rename the published extension? Chrome Web Store / trademark findings and concrete name proposals. |

## TL;DR for a new contributor

- It is a **Manifest V3** Chrome extension that runs only on `https://chat.google.com/*`.
- The UI is a **side panel** (`popup.html`), not a popup window.
- Privacy is applied by toggling **`body` CSS classes** on the Google Chat page;
  the heavy lifting is plain CSS in [`src/styles.css`](../src/styles.css).
- State lives in **`chrome.storage.local`** and syncs both ways between the side
  panel and the content script via `chrome.storage.onChanged`.
- The build emits **pure-ASCII JS**, so all emoji/glyphs live in HTML/CSS, never
  in JavaScript string literals.
- Logic is being refactored into testable modules under
  [`src/core`](../src/core) and [`src/panel`](../src/panel), each with Vitest
  tests beside it.
