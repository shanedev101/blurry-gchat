# Releasing

This is the maintainer process for cutting a new version of Shroudly. It
exists so every release goes through a reviewable branch + PR instead of
landing straight on `main`, and so the CI-built zip can be verified against
what's on `main` at any time.

---

## 1. Versioning

Three places must always agree on the version number:

- `package.json` → `version`
- `manifest.json` → `version`
- `popup.html` → the `.fver` footer span (e.g. `<span class="fver">v1.1.0</span>`)

Bump rules (semver):

- **Patch** (`1.1.0` → `1.1.1`): bug fixes only, no new user-facing behavior.
- **Minor** (`1.1.0` → `1.2.0`): new features (this is what a new panel
  section, a new privacy control, etc. counts as).
- **Major**: reserved for breaking changes to stored data that aren't
  backward-compatible (see [studio/STORAGE.md](studio/STORAGE.md) - in
  practice this should stay additive-only and never need a major bump).

## 2. Branch + PR

Never commit release work straight to `main`.

```bash
# from an up-to-date main
git checkout main && git pull origin main
git checkout -b release/X.Y.Z
```

- Do the version bump + any last docs/changelog fixes on this branch.
- Run the full local gate before pushing:
  ```bash
  npm run lint
  npx prettier --check "src/**/*.{ts,css}" "popup.html" "*.json"
  npm test
  npm run build
  ```
- Push and open a PR into `main`:
  ```bash
  git push -u origin release/X.Y.Z
  gh pr create --base main --head release/X.Y.Z --title "Release X.Y.Z: <summary>"
  ```
- Get it reviewed and merged (regular merge, not squash - keep the
  individual commits, they're already meaningful).

## 3. Tag → CI build → Draft Release

Tagging is what triggers the build. `.github/workflows/release.yml` runs on
any `v*` tag push: installs from `package-lock.json`, lints, checks
formatting, builds, packs a zip, and creates a **draft** GitHub Release with
the zip attached.

```bash
git checkout main && git pull origin main
git tag -a vX.Y.Z -m "Shroudly vX.Y.Z - <one-line summary>"
git push origin vX.Y.Z
```

Then:

1. Watch the **Actions** tab - the run should be green.
2. Open **Releases**, review the auto-generated draft, edit the notes if
   needed, and click **Publish**.

> **Do not re-add `package-lock.json` to `.gitignore`.** It was accidentally
> git-ignored for the entire lifetime of the project through `v1.0.0`, which
> meant `actions/setup-node`'s npm cache step had nothing to restore from and
> `release.yml` could never succeed - this went unnoticed because no tag had
> ever been pushed to trigger it. The lockfile must stay committed for CI to
> work at all.

## 4. Chrome Web Store submission

Once the GitHub Release is published:

1. Download the zip from the GitHub Release (or run `npm run pack` locally
   against the same tag - they should be byte-for-byte equivalent).
2. Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
3. Upload the new zip as a new package version.
4. Update the listing copy using [STORE_SUBMISSION.md](STORE_SUBMISSION.md)
   - re-check it against the actual shipped feature set first; see
     [studio/ARCHITECTURE.md → Known drift](studio/ARCHITECTURE.md#8-known-drift-docs-vs-code)
     for the kind of thing to catch.
5. Retake screenshots if the panel UI changed since the last set was
   captured - an outdated screenshot (wrong branding, missing sections) is
   worse than none.
6. Submit for review.

## 5. Historical note

`v1.0.0` was originally hand-built and uploaded without ever running through
CI (the lockfile bug above meant `release.yml` had never executed). The
`v1.0.0` tag was later corrected in place to add the missing lockfile - no
extension code changed, only build tooling - so the tag now has a green CI
run for reference. Every release from `v1.1.0` onward goes through the full
branch → PR → tag → CI flow described here from the start.
