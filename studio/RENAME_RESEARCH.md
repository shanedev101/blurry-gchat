# Rename Research & Proposals

> **DECISION (chosen):** the extension is renamed to **Shroudly**, listing line
> **"Shroudly - Blur & hide for Google Chat"**. The branding has been applied in
> the codebase (manifest, package, UI, docs); internal identifiers (`gcp-*`
> storage keys, body classes, `GCP_SCREEN_SHARE`, the icon) were intentionally
> left unchanged. Remaining manual steps before publishing are in
> [§1 Process checklist](#process-checklist) (bump version, update the store
> listing, re-submit). Store-listing copy should use **"Google Chat™"** for
> trademark safety even though the in-product strings omit the ™.

**Question:** The extension was originally published as **"Blurry GChat"**. Can we
rename it without losing the listing, and what name is safe under Chrome Web Store
policy (especially Google trademarks)?

**Short answer:** Yes, you can rename a published extension — the install base,
reviews, and item ID are preserved. But the **current name is a trademark risk**
("GChat" is a colloquial Google mark), so a rename is also advisable, not just
possible. Recommended direction: adopt a **distinct, ownable brand** and refer to
Google Chat only with the nominative pattern _"for Google Chat™"_.

---

## 1. Can a published extension be renamed?

Yes. There are two independent "names", both editable:

1. **`manifest.json` `name`** — the name Chrome shows for the installed extension
   (toolbar tooltip, `chrome://extensions`, side panel). Change it by editing the
   manifest, **incrementing `version`**, repackaging, and uploading a new version.
2. **Store listing "Product name"** — shown on the Chrome Web Store page. Edited
   in the Developer Dashboard listing.

Keep these two consistent. After you publish the update, existing users keep the
extension and simply see the new name on next update.

### What does NOT change

- The **item ID** stays the same. The ID is derived from the publisher key tied
  to the item, not from the name — so a rename does **not** create a new listing,
  does **not** reset reviews/ratings, and does **not** require users to reinstall.
- The public store **URL slug** may reflect the old name but the ID segment keeps
  the listing stable.

### Process checklist

- [ ] Update `manifest.json` `name` (and `description` if needed).
- [ ] Bump `manifest.json` `version` (e.g. `1.0.1` → `1.1.0`) and `package.json`.
- [ ] `npm run pack` to produce the new zip.
- [ ] Upload the new version in the Developer Dashboard.
- [ ] Update the listing **Product name**, screenshots, and promo assets.
- [ ] Re-submit for review (a name/branding change is reviewed).

> Reviews for name changes are usually quick, but **a new name still passes
> through policy review** — so the name must comply (next section).

---

## 2. Trademark / branding rules that constrain the name

From the Chrome Web Store Branding Guidelines and Program Policies
(Impersonation & Intellectual Property):

- **Do not use Google trademarks — or confusingly similar marks — as the name**
  of your extension or company without written permission from Google.
- If your extension works with a Google product, reference it **only** with
  _"for"_, _"for use with"_, or _"compatible with"_, and include the **™** symbol
  on the Google trademark — e.g. _"… for Google Chat™"_.
- **Do not use a Google logo (or a modified version)** as your extension's logo.
- Don't imply endorsement, affiliation, or that the extension is an official
  Google product.

### Assessment of the current name "Blurry GChat"

- **"GChat"** is a well-known colloquial name for Google Chat / Google Talk. Using
  it _as part of the product name_ is reasonably read as a **confusingly similar
  Google mark** → **policy risk** (takedown / rejection on review, or a trademark
  complaint).
- Safer construction: an **own brand** + the nominative descriptor
  _"for Google Chat™"_ (which is the explicitly permitted pattern), instead of
  baking a Google mark into the brand itself.
- The current **icon** (green hexagon + "eye-off" glyph) is original and does not
  use a Google logo — that part is fine to keep.

---

## 3. Naming principles for the new name

1. **Ownable & distinct** — a coined or evocative word you can brand and (later)
   trademark; not generic, not a Google mark.
2. **On-theme** — privacy / blur / shielding / anti shoulder-surfing.
3. **Short** — one or two words; easy to say and search.
4. **Compliant** — no "Google", "GChat", "Gmail", "Meet", etc. in the brand
   token. Mention Google Chat only as _"for Google Chat™"_ in the subtitle/listing.
5. **Available** — check Chrome Web Store search, a basic trademark search
   (e.g. USPTO TESS), and domain/handle availability before committing.

---

## 4. Name proposals

Format suggestion for the listing: **`<Brand>` — `Privacy for Google Chat™`**
(brand in `manifest.name`; the "for Google Chat™" part in the short description /
store subtitle).

### Recommended shortlist

| Brand        | Why it fits                                                                 | Listing line                                 |
| :----------- | :-------------------------------------------------------------------------- | :------------------------------------------- |
| **Veilo**    | "veil" = to obscure; coined, brandable, soft and ownable.                   | `Veilo — Privacy shield for Google Chat™`    |
| **Obscura**  | Latin for "darkened" (camera obscura); premium, memorable, clearly privacy. | `Obscura — Privacy for Google Chat™`         |
| **Shroudly** | "shroud" = cover/hide; the "-ly" reads like a modern app brand.             | `Shroudly — Blur & hide for Google Chat™`    |
| **Hushwall** | "hush" + "wall" = a quiet barrier over your screen.                         | `Hushwall — Screen privacy for Google Chat™` |

### Also-good alternatives

- **Blurly** — keeps the "blur" equity of the old name, drops "GChat". `Blurly — Privacy for Google Chat™`
- **Peekproof** — benefit-driven (anti shoulder-surfing). `Peekproof — Privacy for Google Chat™`
- **Curtain** — plain-English metaphor for covering the screen. `Curtain — Privacy for Google Chat™`
- **Maskr** — "mask" + modern dropped-vowel style. `Maskr — Blur & hide for Google Chat™`

### Top recommendation

**Veilo** (or **Obscura** if you prefer a more premium tone). Both are distinct,
on-theme, trademark-safe as brand tokens, and pair cleanly with the permitted
_"for Google Chat™"_ descriptor. **Blurly** is the lowest-risk choice if you want
to preserve continuity with the current "Blurr-" identity while dropping the
"GChat" trademark exposure.

> Decision needed from the owner: pick a brand, then verify availability (store
> search + trademark + domain/social handle) before the rename ships.

---

## 5. Engineering notes for the rename (do NOT break users)

- **Do not rename storage keys.** The `gcp-settings`, `gcp-panel-layout`,
  `gcp-threads` keys and the `gcp-*` body classes are internal; renaming them
  would wipe existing users' saved settings. A product rename is **branding only**
  — keep the `gcp-` prefix as-is.
- The `BackupFile.app` discriminator is now `'shroudly'`. This was safe to change
  outright because the backup feature had not shipped, so no `'blurry-gchat'`
  bundles exist to stay compatible with. (If backups had been live, we would have
  kept accepting the old value on import per the
  [storage backward-compat rule](STORAGE.md#3-the-backward-compatibility-contract-the-golden-rule).)
- `package.json` `name` is now `shroudly` (so `npm run pack` emits
  `shroudly-v<version>.zip`). The repo **folder** is still `blurry-gchat` — left
  as-is to avoid breaking absolute paths; rename it separately if desired.
- Keep the existing original **icon**; it is compliant and gives brand continuity.

## Sources

- [Update your Chrome Web Store item — Chrome for Developers](https://developer.chrome.com/docs/webstore/update)
- [Branding Guidelines — Chrome for Developers](https://developer.chrome.com/docs/webstore/branding)
- [Impersonation & Intellectual Property — Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)
- [Changing the name of an extension (chromium-extensions group)](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/wEjjL9LeeAo)
