# Repository layout and stable URLs

| Path | Purpose |
| --- | --- |
| `sources/filters/` | Editable standalone newspaper and YouTube lists |
| `sources/userscripts/` | Editable QuiAntella and article-card userscripts |
| `article-cards/` | Article-list inputs and public registries; registry paths stay fixed |
| `config/` | Publisher configuration; moving a flag does not change its value |
| `tools/` | Generation, validation and publication scripts |
| `test/` | Automated regression and update-client tests |
| `docs/` | Maintainer documentation |
| Root `*.txt` and `*.user.js` | Public subscription/install artifacts at their original URLs |
| `history/` and `diffs/` | Published snapshots and differential update chains; paths stay fixed |

Edit files under `sources/`, then run `npm run build`. The explicit mapping in
`tools/public-files.mjs` copies the seven standalone sources byte for byte to their
existing root paths. The bundle reads its four inputs from `sources/filters/`
and preserves the original section labels and order. It does not include YouTube
or the userscript. `npm run check` verifies both copies and bundle history.

The root files are real, complete files. Existing raw subscriptions, `! RAW:`,
userscript `@updateURL` and `@downloadURL`, and relative `Diff-Path` values do not
change. Clients need no redirect, symlink support, runtime include, or reinstall.
The initial move changes no filter rules, versions or published artifact bytes.
The article registry paths, userscript cache migration pins, `fucksponsors.txt`
and its compatibility alias `sponsored-article-cards.txt` are preserved. Article
list generation remains `npm run cards:build` / `npm run cards:check`; its updater
flag is in `config/article-cards-automation.json` and stays disabled.

Run from the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run check
node tools/bundle.mjs history-check origin/main
git -c core.whitespace=cr-at-eol diff --check
```

With `config/bundle-automation.json` enabled, source-only changes are generated
and validated in CI. The existing publisher regenerates the public copies and
bundle from fresh main on every attempt and commits them together. Individual
subscriptions therefore update when the publisher completes, just like the
bundle. If disabled, commit all generated files with the source change. A manual
build is always available. Configuration values and workflow permissions are
unchanged by this move.

Do not edit the generated root copies as sources: a later build replaces them.
No-op generation writes nothing, preserving metadata and modification times.
Published snapshots and completed patches remain immutable. Private review
exports and classification corpora do not belong in this repository.
