# Maintaining fuckquotidianilocali

The bundle contains, in order, `fuckquiantella.txt`,
`fuckgazzettinodelchianti.txt`, `fuckdaicollifiorentini.txt`, and
`fuckfirenzedintorni.txt`. The allowlist is explicit in `tools/bundle.mjs`.
YouTube and the userscript are excluded. The original files remain the source
of truth and keep their existing subscription URLs.

## Make an update

Use Node.js 24 (22 or newer is supported) and the Unix `diff` utility:

```sh
npm ci --ignore-scripts --no-audit --no-fund
# Edit the individual source list and bump its Version as usual.
npm run build
npm test
npm run check
node tools/bundle.mjs history-check origin/main
git -c core.whitespace=cr-at-eol diff --check
```

Commit the source change, `fuckquotidianilocali.txt`, `diffs/`, and `history/`
together. Review and merge that commit normally. No workflow writes to a branch,
deploys, needs a PAT, or changes repository settings. CI only verifies committed
outputs and rejects a stale bundle or rewritten published history. A draft PR
does not activate the `/main/` subscription.

The local build uses an exclusive `.bundle-build.lock` directory. A competing
build fails; source or artifact changes during generation also fail before any
outputs are written. After an interrupted process, remove a stale lock only
after checking that no build is running. If a process was killed while writing
outputs, restore the generated files from the last good Git commit and rebuild.
Do not commit a partial build.

Concurrent source PRs must rebuild on the current main branch after rebasing.
Keep the already published `history/`, `diffs/`, and bundle when resolving such
conflicts, then run the builder with the merged sources. CI checks that the base
history remains a prefix of the proposed history. It does not permit a second
PR to replace an already published revision with its own snapshot.

## Stable content and metadata

The generator removes the source files' leading subscription metadata,
normalizes line endings to LF, and concatenates their bodies. It preserves
comments, rule order, duplicated rules and both clients' scriptlet variants.
Balanced `!#if`/`!#else`/`!#endif` directives are preserved within each source;
runtime includes and other directives fail for review instead of being moved
silently into a different context.

If that canonical content is unchanged, the builder returns without writing
any output: version, date, checksum, Diff-Path, snapshots and patches all stay
byte-identical. Source version-only changes and CRLF-to-LF changes are no-ops.
A content change creates the next `1.0.N` bundle version and one new date.
The date records generation, not a guarantee of the later merge time. Versioned
patch names allow two changes in the same second without overwriting an edge.

`@adguard/diff-builder` is pinned to 1.1.7 with an npm lockfile. It is AdGuard's
[official MIT-licensed generator](https://github.com/AdguardTeam/DiffBuilder).
It adds the list's MD5/base64 `Checksum` and `Diff-Path`, plus the patch's SHA-1
checksum. These are different from an HTTP ETag. Because this released version
can log a self-validation failure without throwing, our own validation also
applies every RCS patch and checks the resulting exact snapshot and SHA-1.
The tests additionally use AdGuard's official `DiffUpdater` over local HTTP.

## State, retention and recovery

The current full bundle, every exact historical snapshot, manifest SHA-256
hashes, and all patch edges live in Git. CI caches and temporary artifacts are
not the source of state. The current `Diff-Path` points to an empty placeholder;
the next content change fills that file and creates a new empty placeholder.
A bootstrap file lets the official builder initialize the first revision.
Missing or corrupt published state fails closed rather than resetting history.

Full refresh interval: **30 days** (`Expires`). Differential interval: **one
hour** (encoded as 3600 seconds). The intended minimum history retention is
**35 days after a revision stops being current**, allowing a margin over the
full refresh interval. For this small, infrequently changed bundle we retain
**all snapshots and patches**, which is deliberately more conservative. There
is no scheduled cleanup or timestamp-only build. Each revision costs roughly
one bundle copy plus a small patch; monitor growth before introducing pruning.

The official builder's default seven-day cleanup is unsuitable here. We run it
in a fresh staging directory, with a 35-day setting, then add its two outputs
to the complete retained history. Historical files never enter its pruning
directory. In particular, an old empty placeholder can become an important new
patch after months of inactivity; its old filename date must not cause deletion.
Any future pruning design needs to track actual supersession/publication time
and be reviewed separately. Existing snapshots and completed edges are immutable.

The full file remains available for clients that do not support these patches
and for periodic/forced full refreshes. A missing patch (HTTP 404/204) means
“no patch available” to the official updater; it does **not** itself guarantee
an immediate full download. Corrupt patches must fail checksum validation.
The application controls retry and full-refresh timing. Tests verify retained
chains, missing/empty/error responses, corruption rejection, and explicit full
downloads; they do not emulate every Android scheduling decision.

Publish the bundle and its patches in the same Git commit. GitHub's CDN may
cache individual paths independently; an atomic Git commit cannot guarantee
that every edge location exposes every file simultaneously. Do not rewrite
completed patches to work around caching. A temporarily missing next edge can
be retried by the client while the full subscription remains available.

## Client behavior

AdGuard clients with differential support can use the new metadata. Android's
[integration was tracked for v4.13](https://github.com/AdguardTeam/AdguardForAndroid/issues/5525).
The same complete bundle can be imported into uBlock Origin; this implementation
does not add uBO's separate `Diff-Expires`/`Diff-Name` metadata or promise its
differential protocol. uBO uses its full-list update path. The bundle contains
no runtime `!#include` directives.

The existing trusted Firenze scriptlets still require trusting the new custom
subscription in the client. Network/cosmetic rules do not become DNS filters.
No rule behavior was changed to create the bundle, so device/browser checks
should compare it with the four individual subscriptions using the same trust
and HTTPS-filtering settings.

Differential support is not a fix for Android's manual-update status display.
AdGuard confirmed in [issue #6153](https://github.com/AdguardTeam/AdguardForAndroid/issues/6153#issuecomment-5294003933)
that manual checks force custom-list downloads, whereas automatic updates can
use patches. The misleading “updated” classification was subsequently marked
[fixed for v4.15](https://github.com/AdguardTeam/AdguardForAndroid/issues/6153#issuecomment-5676615721).
Do not infer changed filter content from that message or an advanced timestamp.
