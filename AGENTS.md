# Repository Guidelines

## Scope

This repo hosts JunjoSick's personal ad-block filter lists and one userscript. Keep changes focused on making the filters current, subscribable, and safe to update from GitHub raw URLs.

## Repo Layout

- `fuckquiantella.txt`: ABP/uBlock Origin filter list for `quiantella.it`.
- `fuckgazzettinodelchianti.txt`: ABP/uBlock Origin and AdGuard filter list for `gazzettinodelchianti.it`.
- `fuckdaicollifiorentini.txt`: ABP/uBlock Origin filter list for `daicollifiorentini.it`.
- `kebablastazione.txt`: YouTube cleanup filter list, exposed in the README as `youtubesuckssobad`.
- `quiantella-adblocker.user.js`: Tampermonkey/Greasemonkey userscript for dynamic inline QuiAntella real-estate ads.
- `README.md`: public subscription/install links.

## Maintenance Rules

- The active branch is `main`; raw GitHub URLs should use `/main/`, not `/master/`.
- When changing a filter list, bump its `! Version:` header and keep `! RAW:` aligned with the real raw URL.
- When changing the userscript behavior, bump `@version` and keep `@updateURL` and `@downloadURL` aligned with the real raw URL.
- Prefer narrow, site-specific filters over broad selectors that could hide editorial content.
- Prefer durable ad identifiers such as exact linked domains, image URLs, widget IDs/classes, or stable ad container attributes.
- For AdGuard for Android compatibility, prefer network image rules plus plain CSS attribute selectors. When text matching or parent selection is needed, add AdGuard ExtendedCss rules with `#?#` and keep uBO alternatives only when they add useful cross-client coverage.
- For lazy-loaded QuiAntella WordPress banner ads, the confirmed Android-safe pattern is:
  - `||www.quiantella.it/wp-content/uploads/YYYY/MM/ad-file*.ext$image`
  - `quiantella.it##img[data-src*="/ad-file"]`
  - `quiantella.it#?#figure:has(img.wp-image-XXXXX)`
- For Gazzettino del Chianti Newspaper-theme ads, prefer exact first-party banner image rules, plain CSS for `.td-a-rec`, `.td-g-rec`, `ins.adsbygoogle`, and AdGuard ExtendedCss only when collapsing Popup Maker or sponsor-carousel parents.
- Add short comments when a rule targets a specific campaign, ad placement, or fallback behavior.
- Preserve ABP/uBlock-compatible syntax unless intentionally using a uBO-specific procedural filter such as `:has`, `:has-text`, or `:-abp-contains`.
- For the userscript, keep it dependency-free, limited to `https://www.quiantella.it/*`, and avoid collecting or sending any page data.

## Checks

- Run `git status --short --branch` before and after edits.
- Run `git -c core.whitespace=cr-at-eol diff --check` before finishing; the `.txt` filter lists currently use CRLF line endings.
- Run `rg -n "master|raw.githubusercontent.com/JunjoSick/filtershosting" README.md *.txt *.user.js` after URL-related edits to catch stale branch links.
- For filter changes, manually inspect the target page when possible and confirm the rule does not hide surrounding article content.
- For userscript changes, manually test an affected QuiAntella article with the userscript manager console open and check that only intended ad elements are removed.
