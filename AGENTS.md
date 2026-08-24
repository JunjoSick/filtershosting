# Repository Guidelines

## Scope

This repo hosts JunjoSick's personal ad-block filter lists and one userscript. Keep changes focused on making the filters current, subscribable, and safe to update from GitHub raw URLs.

## Repo Layout

- `fuckquiantella.txt`: ABP/uBlock Origin filter list for `quiantella.it`.
- `fuckgazzettinodelchianti.txt`: ABP/uBlock Origin and AdGuard filter list for `gazzettinodelchianti.it`.
- `fuckdaicollifiorentini.txt`: ABP/uBlock Origin filter list for `daicollifiorentini.it`.
- `fuckfirenzedintorni.txt`: ABP/uBlock Origin filter list for `firenzedintorni.it`.
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
- For Dai Colli Fiorentini's Acconsento.click consent banner (injected at runtime by `acconsento.click/script.js`, obfuscated), the confirmed pattern is:
  - Hide the widget root `###acconsento-click` (stable ID the script itself queries); it wraps backdrop and dialog for all viewport variants.
  - Fallback on substring classes: `[class*="el-acconsento-overlay"]`, `[class*="acconsento-click-overlay"]`, `[class*="acconsento-click-consent-banner"]` — never hardcode positional or Tailwind arbitrary-value classes like `-tl` or `max-w-\[1800px\]`; they differ on mobile.
  - Restore scrolling with both uBO (`##html:style(...)`) and AdGuard (`#$#html { ... }`) body/html overflow rules, since hiding without consenting leaves the scroll lock.
- Firenzedintorni runs a custom CMS (Firenze Web Division / WDE), not WordPress: no Google ads. Ads are sponsor carousels served from `/uploadedfiles/sponsor/`; block that directory network-wide and collapse `.itm_sponsor_carousel` plus `.bkg-griginoo:has(.itm_sponsor_carousel)`. Its homegrown cookiekit banner is `#wdc_banner` (also classed `.cookiebanner`). Beware: its HTML uses single-quoted attributes, so double-quote-only greps miss markup.
- To find fixes other users rely on, shallow-clone `AdguardTeam/AdguardFilters` and grep it for our domains; port missing rules to our lists in cross-client syntax (uBO `##+js(...)` plus AdGuard-native `#%#//scriptlet(...)` where needed). GitHub code-search API needs auth; local grep does not.
- uBO and AdGuard scriptlets with the same name can have incompatible signatures. Confirmed case: `trusted-replace-node-text` — uBO takes `(css-selector, textPattern, flags, replaceThis, withThis)` while AdGuard takes `(nodeName, textMatch, pattern, replacement)` where the first arg is a node name like `span`, never a CSS selector, and regex args must use `/.../` form or they are treated as literal strings. When signatures diverge, ship two rules and comment which client each targets; a wrong-signature rule fails silently.
- AdGuard regex args in scriptlets must not have backslashes doubled: `'/^\u00A0{2,}/'` is correct, `'\\u00A0'` matches a literal backslash.
- AdGuard's `trusted-replace-node-text` rewrites `node.textContent` even when the replacement changes nothing, and setting `textContent` deletes all child elements (`<br>`, links, etc.). Always scope its `textMatch` to exactly the nodes that must change (e.g. match the leading-nbsp pattern itself, not `/./`), or it flattens unrelated siblings. uBO's variant edits text nodes only and is immune.
- Keep every list dual-client: for each uBO procedural rule (`:has`, `:has-text`, `:-abp-contains`), either rely on a documented AdGuard equivalent already present (`#?#:contains` etc.) or add an explicit `#?#` duplicate. uBO ignores `#?#` lines; older AdGuard for Android builds skip uBO-only procedural selectors in plain `##` rules.
- Audit dual coverage by grepping each list for `:has-text|:-abp-contains|##+js|:style(` and confirming an AdGuard counterpart (`#?#`, `#%#//scriptlet`, `#$#`) exists; remember comments can false-positive the grep.
- Possible future project: GitHub Action to generate AdGuard differential-update patches so AdGuard stops reporting "updated" on unchanged custom filters. Patch format is documented in `AdguardTeam/FiltersRegistry`; `AdguardTeam/FiltersDownloader` only consumes diffs (client-side), generation tooling is not public. Would require `! Diff-Path:` headers, a versioned `diffs/` folder, and CI state tracking; AdGuard falls back to full download on patch failure, so mistakes degrade gracefully.
- YouTube layout changes constantly: keep `kebablastazione.txt` `! Expires` short (7 days), and verify selectors against live pages by fetching with a SOCS cookie and grepping `ytInitialData` for renderer names before trusting old attribute-based Shorts rules.
- Add short comments when a rule targets a specific campaign, ad placement, or fallback behavior.
- Preserve ABP/uBlock-compatible syntax unless intentionally using a uBO-specific procedural filter such as `:has`, `:has-text`, or `:-abp-contains`.
- For the userscript, keep it dependency-free, limited to `https://www.quiantella.it/*`, and avoid collecting or sending any page data.

## Checks

- Run `git status --short --branch` before and after edits.
- Run `git -c core.whitespace=cr-at-eol diff --check` before finishing; the `.txt` filter lists currently use CRLF line endings.
- Run `rg -n "master|raw.githubusercontent.com/JunjoSick/filtershosting" README.md *.txt *.user.js` after URL-related edits to catch stale branch links.
- For filter changes, manually inspect the target page when possible and confirm the rule does not hide surrounding article content.
- For userscript changes, manually test an affected QuiAntella article with the userscript manager console open and check that only intended ad elements are removed.
