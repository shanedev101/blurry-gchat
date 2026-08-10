# 🤝 Contributing to Shroudly

We'd love for you to contribute to this extension and make it even better for the community! Here is a guide on how you can get started.

---

## 🧭 Workflow Guidelines

### 1. Set Up Your Environment

Follow the instructions in the [README.md](README.md#🛠️-local-developer-setup) to clone the repository, install dependencies, and run the project in development mode.

### 2. Choose or Create an Issue

- Check existing issues or pull requests to see if someone else is already working on similar features or fixes.
- If you find a bug or want to propose a feature, feel free to open a new issue describing it in detail.

### 3. Branching & Commits

- Branch away from `main` using descriptive names:
  - Bug fixes: `fix/issue-description`
  - Features: `feat/feature-name`
  - Documentation: `docs/changes-summary`
- Keep commit messages concise, clear, and written in English (e.g. `feat: add support for thread avatars`).

---

## 🎨 Coding Standards & Rules

To ensure a smooth, secure, and performant extension, please adhere to these conventions:

- **TypeScript Safety**: Use exact TypeScript typings. Avoid using `any` type casts wherever possible.
- **Linting & Formatting**: Run `npm run lint` and `npm run format` to ensure code matches our style guidelines. Code that fails these checks will be automatically rejected by the CI/CD pipeline.
- **Chrome APIs Guarding**: Always check for `chrome.runtime.lastError` when reading/writing from Chrome Storage, and verify parameters before communicating across message channels.
- **CSS-First Obfuscation**: Real-time DOM obfuscation must be handled by applying CSS classes to the `<body>` (using `document.body.classList.toggle`) and defining rules in `styles.css`. This prevents layout shifts and guarantees that content is hidden _before_ layout paints, avoiding flash of un-obfuscated content.
- **Safe DOM Queries**: Google Chat frequently updates its HTML class names. If you need to target a new element, always try to use stable semantic HTML elements, ARIA attributes (e.g. `[role="listitem"]`), or JS variables (e.g. `[jsname="..."]`) instead of raw, generated class selectors.
- **Performance**: The MutationObserver in `content.ts` is triggered frequently. Keep matching functions lightweight and avoid nested DOM traversals.

---

## 🚀 Submitting a Pull Request

1. Push your branch to your forked repository.
2. Open a Pull Request pointing towards `main`.
3. Provide a clear description of:
   - What changes were made.
   - The rationale/motivation behind the edits.
   - How you manually verified that the changes function correctly on `chat.google.com`.
4. Our maintainers will review your PR and coordinate with you to merge it.

Thank you for contributing! Your help keeps our privacy tools stable and secure!

---

## 🚢 Cutting a Release

If you're a maintainer preparing a new version, see [RELEASING.md](RELEASING.md)
for the full branch → PR → tag → CI flow.
