# fucksponsors - Articoli sponsorizzati e promozionali

This feature is separate from the four ad lists and their differential bundle.
The separate optional native-CSS subscription and optional userscript hide selected,
bounded article cards on supported home, search, related and sidebar listings.
Direct articles and links inside article bodies remain accessible.
The optional harsh policy includes disclosed GDC promotions for events and jobs.
The original subscriptions, bundle history and publisher are unchanged.

Daily discovery and publication are enabled by `config/article-cards-automation.json`
(`enabled: true`). The workflow runs at 05:43 UTC and also supports manual dispatch
on `main`. Classification corrections remain separate reviewed decisions. The
original bundle publisher remains enabled with its existing configuration.

## Data and generation

`article-cards/baseline/` contains the approved release baseline: GDC 1,822,
QuiAntella 9, Colli 32, Firenze 5. Its 1,868 URLs reconcile exactly to 1,823
explicit sponsorship records plus 45 human-approved Hide decisions. Eight
unavailable Colli articles are excluded pending evidence. The original 1,876-URL
transfer remains in Git history; the builder checks the release SHA-256 hashes.
No proposed historic additions or Catrame holdouts have been applied. Historical
paths absent from the baseline cannot be added automatically; this preserves
historical keeps without publishing a private keep list.

`article-cards/state.json` contains additive exact paths discovered after the
baseline. Canonical percent encoding and trailing slashes are preserved. No
article bodies, titles, personal review choices, or private review application
code are stored here. Four compact `article-cards/registries/*.json` files and
`fucksponsors.txt` are generated deterministically. Registries contain
their path-array SHA-256. Producer and userscript both limit exact paths to 4,096
characters, 50,000 entries, and 2,000,000 serialized JSON text units including LF.
Overlength candidates are skipped/count-reported; capacity-limited candidates
stay visible in review. Existing approved entries are never truncated to fit.
Unchanged content produces identical bytes and no commit.

## Native subscription and supported layouts

`sponsored-article-cards.txt` remains a generated compatibility alias, with its
own RAW header and content-derived version. The updater commits both files together.

`fucksponsors.txt` contains standard `##` cosmetic rules, with no
network blocking or procedural duplicates. It stays outside the original bundle.
Its content-derived version changes only when generated content changes.
`tools/article-native-css.mjs` is the active layout/encoding source; the recovered
`article-cards/selectors.json` is an inactive reference. The preserved legacy
ExtendedCss rule is a negative test control and is never emitted.

| Site | Native subscription layouts | Deliberate limits |
| --- | --- | --- |
| GDC | Home flex/slide, search loop, search/article sidebar slides, single-article related cards | Expected title chain and card wrapper required |
| QuiAntella | Home grids, search archives, Jetpack related wrappers | Related shape has synthetic proof; tracked query URLs stay visible |
| Colli | Home UAEL overlays, full-search Elementor cards | No inferred inline/body placements |
| Firenze | Wrapped caption cards, linked hero cards, image-only links inside aside/sidebar | Wrapperless search heading/summary/URL/divider rows stay visible |

Each wrapped card needs an expected title/overlay link. All of its navigation
links must identify one approved exact path; a second article, category link,
query string, unsupported URL spelling, or nested card makes the rule fail open.
Native rules support root-relative URLs and the site's canonical HTTPS origin.
Foreign/directory base URLs disable matching. Protected article-body classes on,
around, or inside a candidate also prevent hiding. The outer Firenze links must
contain one article/image and no descendant navigation links. Styles are
reevaluated by the browser when hrefs, base URLs, classes or the DOM change.

Paths are grouped in batches of 32 to factor repeated layout checks. Each layout keeps its concrete card class as a browser indexing anchor. Each group's
negative guards still require one shared path identity; combining all paths into
one permissive negative guard would incorrectly hide mixed-article wrappers.
The approved 1,868 paths produce 292 native rules, around 5.18 MB. Encoding is tested
through applied full stylesheets, including two different registered paths in one
card. All approved registry entries and explicit personal decisions remain intact.

| Client | Support/evidence |
| --- | --- |
| Modern uBO with browser-native `:has()` | Official parser classifies all generated rules as native; applied Chromium CSS lifecycle tested |
| AdGuard Browser Extension 5.3+ with native `:has()` | Official tsurlfilter 6.0.3 parses and retrieves only native rules for the correct domains; applied Chromium stylesheet tested |
| AdGuard Android/CoreLibs 1.12+ with native `:has()` | Native support documented upstream; Android/device integration remains untested here |
| Older clients that substitute ExtendedCss/procedural `:has()` | Unsupported: do not install this list there; the reproduced href/base staleness can leave reused cards hidden |
| ABP, AdGuard Content Blocker, Safari conversion and other clients | No compatibility claim in this draft |

See [AdGuard's native `:has()` support](https://adguard.com/kb/general/ad-filtering/create-own-filters/#extended-css-has)
and [uBO's native/procedural selection](https://github.com/gorhill/uBlock/wiki/Procedural-cosmetic-filters#subjecthasarg).
The `##` marker does not prevent an older client from substituting a procedural
fallback. This is a modern native-client support boundary, not a universal syntax
gate. No `#?#` counterpart is emitted: pinned ExtendedCss 2.2.1 demonstrably retains
hiding after href-only/base-only changes. This intentional native-only coverage
supersedes the usual procedural dual-client duplication for this optional list.

## Daily discovery and safe publication

`update-article-cards.yml` is scheduled at 05:43 UTC daily, with manual dispatch,
and is gated by the separate configuration flag in both jobs and the runner. GitHub
schedules are best effort. No server, Worker, persistent token or credentials
are required. Only Git transport receives the ephemeral job token.

Discovery is bounded and sequential:

- QA and Colli: at most four public API pages of 100 records, sorted by modified
  time. GMT dates, order, body fields and pagination headers must be present.
  Stop after the seven-day overlap or the reported final page.
- GDC: at most three pages for each of the two recovered sponsored RSS queries.
  Classify article-local `content:encoded`, without fetching linked articles.
  The denied REST API, historic disclosure census and full sitemap crawl are
  excluded. RSS has no reliable modified timestamp.
- Firenze: the first three economy/work archive pages generate review candidates,
  with at most 200 matching links per page.
  No reliable publication/modification API or automatic disclosure vocabulary
  was recovered, so new Firenze candidates remain visible pending review.

The seven-day overlap is a bounded recent window, not an exhaustive backlog or
modified-article guarantee. Longer outages, prolific feeds, reordered feeds,
older changed RSS stories and page-layout changes can leave coverage gaps. A
truncated overlap never contributes additions. Each response is limited to 4 MB
and 15 seconds; transient failures get one retry. Authentication, forbidden,
missing and rate-limited responses are terminal. Redirects are rejected.

Automatic additions require a verified publication timestamp strictly after the
fixed freeze `2026-10-01T23:59:59Z` (October 2, 01:59:59 in Italy). This preserves
the recovered decisions; it does not automatically cover the first two Italian
hours of October 2. The cutoff is exported as `CLASSIFICATION_CUTOFF`.
They also require an approved article-local disclosure form. GDC accepts `CONTENUTO
SPONSORIZZATO`; QA accepts `Informazione promozionale`; Colli accepts `Articolo
ADV`, `Contenuto adv`, and `#adv`. Standalone labels and terminal BR labels are
checked only in supported plain prose/formatting tags. A short standalone PRE
label remains allowed for the recovered legacy structure. Every candidate must
have under 600 normalized following characters through all ancestors to the body
root; unsupported following structures also hold it for review. Vocabulary such
as `INFORMAZIONE PUBBLICITARIA` remains review-only until separately approved.

Ordinary markup before a separate clean disclosure no longer vetoes the body:
links, images/figures, headings, lists and unrelated paragraph attributes are
allowed. The disclosure's own subtree and ancestor chain must still contain only
supported attribute-free prose/formatting. This keeps hidden/style attributes,
`popover`, unknown classes, quotes, code, templates and media/fallback contexts
from supplying evidence. An ordinary link earlier in the same candidate BR
paragraph remains outside this narrow evidence contract. Unsupported following
content also remains review-only, even when its text is short.

A bounded whole-fragment scan still holds document-active content for review:
style/script/link elements, embedded browsing contexts (iframe/object/embed), or
case-insensitive event-handler attributes anywhere in the body. This catches a
preceding stylesheet that hides a later plain label; ignoring only the stylesheet's
text would be insufficient. No script or style is executed to classify an article.

The regression matrix contains 48 invented bodies across GDC, QA and Colli. All
12 plain controls and 30 cases with unrelated ordinary markup classify; six
cases with a class on the disclosure or its ancestor remain review-only. Chromium
confirms all 48 labels are visible in these fixtures. This measures the explicit
policy boundary, not live-site coverage. The approved registry still filters
supported cards regardless of historical body formatting. External page styles
are not fetched or inferred, so fragment evidence is not proof of computed
visibility or semantic sponsorship on every live page. Conflicting records for
a new path remain review-only.

RSS uses pinned `saxes` 6.0.0 for strict, namespace-aware XML validation. It
requires one RSS/channel structure with direct article-local fields, rejects
truncation, duplicate fields, stray channels, DTDs and excessive depth/node count,
and yields between 64 KB input chunks. Publication dates must be exactly the
supported UTC form `Fri, 02 Oct 2026 10:00:00 GMT` or the same form ending in
`+0000`, with a real calendar date and agreeing weekday. Other offsets, names,
locale/slash dates, missing zones and ISO forms are unsupported and fail the
site batch without additions. WordPress publication/modified fields retain their
strict GMT/calendar/order and future-time validation.

Disclosure analysis computes bounded text and following-text summaries in linear
work, with a 50,000-node/128-depth ceiling and a 250 ms cooperative CPU target.
The daily collector uses one reusable worker with a one-second parent timeout
per record; the parent can terminate synchronous parsing on a global abort.
Work-limit, parse-error and worker-failure candidates remain visible for review.
No worker or runtime classification runs in the browsing userscript.

Ambiguous/historical/unverified candidates remain visible. The discovery JSON
report contains a bounded review queue of public exact paths and reasons, never
bodies. It appears in execution logs; it is not committed as a public registry or
connected to the private swipe-review application. Failed sites are reported
explicitly. Complete sites can contribute additions even when another site fails
or has a truncated overlap; those other sites retain their exact last-good state.
The discovery CLI returns the report separately from coherent generated outputs.
After safely reconciling complete sites, the publisher marks partial discovery
with exit status 2 and a job summary. A repeated partial run remains a byte-stable
no-op. This keeps failures visible without indefinitely blocking unrelated sites.

The maximum 17 requests, each with two 15-second attempts and a one-second retry
delay, require at most 527 seconds of request time. Discovery also has a global
540-second abort deadline, including response-body reads; its child process has
a 600-second allowance. The separate 60-minute workflow job allowance leaves room for three discovery
children plus normal verification and transport work; pathological repeated
install/transport stalls can still exhaust it. Git/install/test subprocesses retain their
120-second timeouts. Job scheduling and cancellation remain GitHub-controlled.

Every publisher attempt fetches current main, creates a fresh detached worktree,
rereads the gate/current tools, installs locked dependencies, runs tests, discovers
and verifies coherent outputs, then makes one non-forced push. A concurrent writer
causes a fresh rebuild, up to three attempts. The fourth pass is read-only and can
confirm an uncertain push only when main equals the recorded candidate. It cannot
mistake a failed discovery for success. State, registries and filter text publish
in one Git commit. No deletions are automatic. Any removal requires a separately
reviewed state/baseline revision and cache migration policy.

## Optional userscript

`article-cards.user.js` is dependency-free and optional. It uses per-site local
Set lookups. It never fetches linked articles, runs AI, uploads browsing history,
submits page data, preloads articles, intercepts network/history calls, reads
layout, or registers scroll handlers.

A cached, SHA-256-verified registry is used immediately. With no valid cache,
cards remain visible until the deferred registry fetch succeeds. Refresh waits
ten seconds after load and an idle opportunity; successful checks are cached for
one day and failed attempts throttle for one hour. Storage errors fail open.
Invalid responses and any unapproved removal preserve last-good data. A reviewed
removal requires a client-side `reviewedRemovals` entry with the exact host,
old/new path-array SHA-256 digests and a nonempty review identifier. This supports
large or empty reviewed replacements while a version change or server flag alone
cannot bypass the guard. The frozen Colli 40-path cache has one reviewed local
migration: remove the eight explicitly listed paths, then verify that the result
has the exact approved 32-path digest. Both the original cache and reconstructed
registry must pass normal validation. A wrong host, source/target digest, review
identifier or removal delta cannot authorize migration.

This local reconstruction lets an offline draft installation skip the intermediate
server snapshot: after migrating to the approved 32 paths, it can accept later
additions through the unchanged additive-only guard. Startup adopts the verified
result before scanning cards, with no network request or shared-storage write.
The existing refresh lock handles persistence; its timestamp is due for refresh,
while the normal deferred/idle scheduling and hourly failure throttle remain.
Offline or malformed server responses retain the approved local result. A stale
shared cache cannot remove newer additions already adopted by the active tab.

Only the exact frozen draft cache is supported by this migration. Pins do not
compose, unknown snapshots do not migrate, and additional removals still require
explicit review. Network replacements retain their exact old-to-new pin check;
there is no wildcard destination or automatic chain of removal approvals.
Frozen baseline changes still require separately reviewed code/data
revisions. Only the fixed raw GitHub per-site registry URL is requested, anonymously.
An independent 15-second watchdog aborts stuck requests, and unexpected final
redirect URLs are rejected. [Tampermonkey documents](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest)
that anonymous requests use fetch mode, which can ignore the native timeout.
The userscript aborts progress exceeding 2 MB when the manager supplies progress
events; this is not a hard download-byte bound on managers without those events.
The fallback validates at most 2,000,000 UTF-16 text units after load, alongside
the independent duration watchdog. The updater instead bounds streamed response
bytes. Web Locks serialize same-origin tabs. Losing tabs retry after 20–30 seconds
and first adopt the verified shared cache. Without locks a randomized GM-storage
lease is best effort, not atomic across isolated tabs; duplicate requests remain possible.

Only a supported single-container card is eligible. Its selected title must
have exactly one anchor, and every navigable link inside the card (at most 16)
must resolve to the same article path. Cards with category, author, unrelated or
ambiguous links remain visible, even when their title is sponsored. Nested card
containers and protected body content also keep the outer container visible.
Firenze wrapperless search rows are unsupported in all layouts: headings,
summaries, URL paragraphs and dividers always stay visible, including reordered
or lazily inserted fragments. Wrapped Firenze cards and image-only sidebar
anchors remain supported when their identity is unambiguous.

Mutation callbacks enqueue work. Tree walking is limited to 100 nodes and an
approximately 3 ms cooperative budget per slice. A single browser operation is
not preemptible. The queue caps at 1,024 jobs; overflow coalesces into one bounded
rescan. Ordinary insertions and href changes stay local. Relevant scope-class
changes and additions/removals of QA's `jp-relatedposts` ID rewalk descendants;
unrelated ID changes stay local. Ancestor lookup includes deeply nested edits so
an already hidden card cannot be stranded by a fixed lookup-depth cutoff.
Owned markers restore on recycled cards, clones, body-scope changes, registry
changes and back/forward lifecycle events. Hidden tabs pause DOM work and abort
refresh. Protected body markers exclude a card, its ancestors and descendants.
Href sources invalidate dependent cards, and moved/removed containers retire
ownership cooperatively. Image-only sidebars use one anchor owner for multiple
images. Card URLs use their effective document base; head-base changes restore
old markers and queue a rescan. Registry validation is independent of page base.

## Reproducible validation

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run cards:check
npm run check
node tools/bundle.mjs history-check origin/main
git -c core.whitespace=cr-at-eol diff --check
```

The tests use invented content, synthetic public-API/RSS responses, local bare
Git remotes and JSDOM. The browser test uses locally injected invented markup,
headless Chromium and pinned official `@adguard/extended-css` 2.2.1. It applies a
preserved unsafe legacy rule to demonstrate href/base staleness, then applies the
complete native stylesheet for each site across 13 supported layout shapes.
Computed display is checked through href/base changes, query URLs, mixed links,
nested cards, body protection, class/page-scope changes, reordering and lazy
insertion. Wrapperless Firenze search rows remain visible. A full GDC stylesheet
stress test uses an invented 1,000-card page. The userscript's computed-display
lifecycle and incremental work are also checked, as are hidden classifier fixtures
and the 48-case ordinary-markup disclosure matrix.
The Chromium test is mandatory and fails if no supported browser starts.
Set `CHROME_BIN` to select an installed browser explicitly.

Separate reproducible client checks use the official uBO parser at commit
`01092d95dbc7d91599a5ad017d5b98aba1118659` with native CSS enabled, and official
`@adguard/tsurlfilter` 6.0.3. They validate generated rules as native and retrieve
AdGuard's exact expected per-domain selectors with no generic/ExtendedCss rules.
These checks do not amount to installing a complete browser extension.

There is no live article-body, Android-device, userscript-manager, installed
extension or production workflow verification. The rejected real-body fixtures
were neither retried nor repackaged. New DOM placements have synthetic proof only.
Browser measurements do not establish mobile performance or paint timing. Reduced
layout/client coverage, wrapperless-row exclusion and strict discovery evidence
requirements are documented limits; all 1,868 approved paths and pending decisions
remain intact.
