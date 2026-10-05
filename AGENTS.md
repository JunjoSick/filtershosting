# Repository Guidelines

## Scope

This repo hosts JunjoSick's personal ad-block filter lists and optional userscripts. Keep changes focused on making the filters current, subscribable, and safe to update from GitHub raw URLs.

## Repo Layout

Edit standalone filters in `sources/filters/` and userscripts in
`sources/userscripts/`. Root files below are generated compatibility artifacts;
never relocate their raw URLs. Run `npm run build` to copy sources byte for byte
and rebuild the bundle; `npm run check` verifies both. Publisher configuration
lives in `config/`. See `docs/repository-layout.md`.

- `fuckquiantella.txt`: ABP/uBlock Origin filter list for `quiantella.it`.
- `fuckgazzettinodelchianti.txt`: ABP/uBlock Origin and AdGuard filter list for `gazzettinodelchianti.it`.
- `fuckdaicollifiorentini.txt`: ABP/uBlock Origin filter list for `daicollifiorentini.it`.
- `fuckfirenzedintorni.txt`: ABP/uBlock Origin filter list for `firenzedintorni.it`.
- `fuckquotidianilocali.txt`: generated bundle of the four lists above. Read the current publisher state from `config/bundle-automation.json`; this reorganization preserves its value. Do not change it without authorization. When disabled, edit the individual sources, run `npm run build`, and commit all public copies, the bundle, `history/`, and `diffs/` together. See `docs/bundle-maintenance.md`.
- `kebablastazione.txt`: YouTube cleanup filter list, exposed in the README as `youtubesuckssobad`.
- `quiantella-adblocker.user.js`: Tampermonkey/Greasemonkey userscript for dynamic inline QuiAntella real-estate ads.
- `article-cards/`: article-list data and public registries; preserve registry URLs and cache migration pins.
- `fucksponsors.txt` and `sponsored-article-cards.txt`: generated article list and compatibility alias.
- `article-cards.user.js`: generated copy of `sources/userscripts/article-cards.user.js`. Its updater flag is `config/article-cards-automation.json`; read its current state and change it only with authorization.
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
- Firenzedintorni runs a custom CMS (Firenze Web Division / WDE), not WordPress: no Google ads. Ads are sponsor carousels served from `/uploadedfiles/sponsor/`; block that directory network-wide and collapse `.itm_sponsor_carousel` plus the dedicated `.bkg-griginoo` sponsor wrapper with plain CSS. Its homegrown cookiekit banner is `#wdc_banner` (also classed `.cookiebanner`). Beware: its HTML uses single-quoted attributes, so double-quote-only greps miss markup.
- To find fixes other users rely on, shallow-clone `AdguardTeam/AdguardFilters` and grep it for our domains; port missing rules to our lists in cross-client syntax (uBO `##+js(...)` plus AdGuard-native `#%#//scriptlet(...)` where needed). GitHub code-search API needs auth; local grep does not.
- Verify each engine's documented scriptlet signature. `trusted-replace-node-text` takes `(nodeName, pattern, replacement, ...keyValueOptions)` in uBO and `(nodeName, textMatch, pattern, replacement)` in AdGuard. Neither first argument is an article CSS selector; regex patterns need `/.../` delimiters. See the [uBO resource documentation](https://github.com/gorhill/uBlock/wiki/Resources-Library#trusted-replace-node-textjs-) and [AdGuard source](https://github.com/AdguardTeam/Scriptlets/blob/master/src/scriptlets/trusted-replace-node-text.js).
- AdGuard regex args in scriptlets must not have backslashes doubled: `'/^\u00A0{2,}/'` is correct, `'\\u00A0'` matches a literal backslash.
- Both engines can destroy child markup when a matched element's `textContent` is replaced. Restricting a match to leading NBSP does not protect the BR, links or emphasis inside that span. uBO is not inherently text-node-only; `#text` targets text nodes but does not provide article-parent scoping. Preserve Firenze editorial formatting; keep sponsor-gap cleanup in the separate `.bkg-griginoo` rule. See `docs/firenze-formatting-regression.md`.
- Keep every list dual-client: for each uBO procedural rule (`:has`, `:has-text`, `:-abp-contains`), either rely on a documented AdGuard equivalent already present (`#?#:contains` etc.) or add an explicit `#?#` duplicate. uBO ignores `#?#` lines; older AdGuard for Android builds skip uBO-only procedural selectors in plain `##` rules.
- Audit dual coverage by grepping each list for `:has-text|:-abp-contains|##+js|:style(` and confirming an AdGuard counterpart (`#?#`, `#%#//scriptlet`, `#$#`) exists; remember comments can false-positive the grep.
- Bundle updates use the public official `@adguard/diff-builder` package. Keep generated metadata byte-stable when content is unchanged, preserve all published snapshots and completed patches, and run `npm test`, `npm run check`, and `node tools/bundle.mjs history-check origin/main`. CI generates and verifies candidates. The separate publishing workflow is gated by the tracked automation flag; when enabled, it uses only a temporary job token and normal non-forced pushes. Its bounded retries must refetch main and rebuild in fresh worktrees with the current flag, tools and history; never replay a rejected candidate's patches. The hourly catch-up is best effort; retain visible failures and manual recovery. AdGuard Android's manual update may force full downloads and report unchanged lists as updated (upstream issue #6153); differential support does not guarantee a fix for that UI behavior or an immediate full-download fallback after patch failure.
- YouTube layout changes constantly: keep `kebablastazione.txt` `! Expires` short (7 days), and verify selectors against live pages by fetching with a SOCS cookie and grepping `ytInitialData` for renderer names before trusting old attribute-based Shorts rules.
- Add short comments when a rule targets a specific campaign, ad placement, or fallback behavior.
- Preserve ABP/uBlock-compatible syntax unless intentionally using a uBO-specific procedural filter such as `:has`, `:has-text`, or `:-abp-contains`.
- For the userscript, keep it dependency-free, limited to `https://www.quiantella.it/*`, and avoid collecting or sending any page data.

## Checks

- Run `git status --short --branch` before and after edits.
- Run `git -c core.whitespace=cr-at-eol diff --check` before finishing. Preserve source line endings; the generated bundle, snapshots, and patches use LF for exact differential reconstruction.
- Run `rg -n "master|raw.githubusercontent.com/JunjoSick/filtershosting" README.md *.txt *.user.js` after URL-related edits to catch stale branch links.
- For filter changes, manually inspect the target page when possible and confirm the rule does not hide surrounding article content.
- For userscript changes, manually test an affected QuiAntella article with the userscript manager console open and check that only intended ad elements are removed.
