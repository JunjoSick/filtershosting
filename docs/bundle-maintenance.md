# Maintaining fuckquotidianilocali

The bundle contains, in order, `fuckquiantella.txt`,
`fuckgazzettinodelchianti.txt`, `fuckdaicollifiorentini.txt`, and
`fuckfirenzedintorni.txt`. The allowlist is explicit in `tools/bundle.mjs`.
YouTube and the userscript are excluded. The original files remain the source
of truth and keep their existing subscription URLs.

## Make an update

The draft includes automatic generation and an **inactive automatic publisher**.
`bundle-automation.json` contains `"enabled": false`; no job with write
permissions runs while that flag is false. CI generates a candidate on every
PR, but in this disabled mode it requires the generated outputs to be committed
before merging. The manual procedure below remains available as a fallback.

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

With automation disabled, commit the source change, `fuckquotidianilocali.txt`,
`diffs/`, and `history/` together. Review and merge that commit normally.
No workflow currently writes to a branch or changes repository settings.
A draft PR does not activate the `/main/` subscription.

## Proposed automatic publishing (disabled)

After explicit approval to activate publishing, change the single tracked flag
in `bundle-automation.json` to `true` in a reviewed commit on `main`. No PAT,
GitHub App, secret, repository variable, branch-rule exemption, or repository
permission setting is required or configured by this proposal.

With the flag enabled:

1. A source-only PR triggers read-only CI: generate the candidate bundle, run
   tests, verify checksums/history, and reject changes outside generated paths.
   Committing generated files manually is no longer required.
2. Pushes to `main`, a manual `workflow_dispatch`, and an hourly catch-up at
   minute 17 UTC use the same publisher. Its write job runs only when the flag
   read from `main` is true. Source changes can reach the individual lists
   before the bundle; each bundle revision, snapshot, manifest and patch chain
   is committed together.
3. The publisher makes at most three publication attempts, with 5- and
   10-second backoffs. **Every attempt fetches current main, creates a new
   detached worktree, rereads the flag, installs its locked dependencies, and
   executes that checkout's tests, builder and validators.** It never rebases
   or reuses a rejected candidate or its patches. A normal non-forced push
   rejects a competing main change. The next attempt starts with the winner's
   published history, including a completed patch, if another publisher won.
4. No content change means no commit or push. A post-attempt fetch also detects
   a main change during a no-op or just after a successful push. After the three
   attempts, one final **read-only** check of freshly fetched main can confirm
   that a last push succeeded despite a lost response. This pass only validates
   committed content; it cannot create a fourth candidate or push.
5. The publisher uses one concurrency group and `cancel-in-progress: false`.
   GitHub may replace a pending run with a newer one; each run reconciles the
   whole latest state, so it does not need every intermediate push event.
   Hourly catch-up retries after a missed/failed final run, and after source
   changes made by other `GITHUB_TOKEN` workflows, whose pushes do not trigger
   another push workflow. A successful run only certifies the main SHA in its
   summary: a change after its final fetch waits for a later invocation.

Only the gated publishing job requests `contents: write` on GitHub's temporary
`GITHUB_TOKEN`. Checkout does not persist credentials. The runner passes it via
`GH_TOKEN` only to Git fetch/push commands and strips both token variables from
npm, tests and generator subprocesses. The credential helper is specified per
command; no persistent credentials or authentication settings are created.
GitHub documents the push-event suppression in its
[GITHUB_TOKEN documentation](https://docs.github.com/en/actions/concepts/security/github_token).
The publisher validates its own generated commit before pushing it.

Catch-up is **best effort, not a guaranteed hourly deadline**. GitHub schedules
run from the default branch, can be delayed or dropped under load, and are
automatically disabled in public repositories after 60 days without repository
activity. Minute 17 avoids the documented start-of-hour traffic peak but cannot
eliminate scheduling failures. See GitHub's
[schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
and [concurrency semantics](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
No external monitoring service is installed by this proposal.

Failed reconciliation exits nonzero and records recovery guidance in the job
summary. The Actions run and step logs show the attempt, fetched SHA and error;
normal GitHub Actions failure notifications depend on the user's notification
settings. Each subprocess has a two-minute timeout, and the write job has a
15-minute overall timeout. A runner crash or timeout may prevent its summary
from being written; the failed/cancelled run remains visible in Actions.

For recovery, inspect **Actions → Publish filter bundle (opt-in)**, correct the
reported network, dependency, validation or permission failure, then select
**Run workflow** on `main`. The same fresh-state reconciliation runs; do not
push a failed candidate by hand. Check whether GitHub disabled the schedule
before relying on future timers. If Actions is unavailable, use the manual
build procedure above from current main and commit all generated files
atomically. A failed job cannot guarantee recovery until some later invocation
actually runs successfully.

Existing repository or organization policies may deny the token write access,
and branch protection may reject direct bot pushes. In that case the job fails
without changing those policies or creating stronger credentials. The choices
would be retaining manual publication or separately approving a different
publication route. No real publishing-token push has been tested while this
proposal is disabled. Deterministic tests run the actual retry orchestrator
against local bare Git remotes, including real push rejection, lost responses,
fresh flag/tool changes, no-op races and a later timer-style invocation after
all attempts fail. Tests replace registry installation with the already pinned
local dependencies and use a small fixture test suite to avoid recursion;
they do not exercise GitHub's scheduler, token policy or raw CDN. Do not enable the flag simply to test permissions without approval.

To pause an activated publisher, set the same flag back to `false`. A run that
already checked out older main will fail its fast-forward push against that
newer disabling commit and stop when its next attempt reads the disabled flag.
A job already granted temporary write permission may still finish that read,
but cannot publish over the disabling commit. Future write jobs are skipped.

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

The Firenze section preserves publisher article text and inline markup. Its
sponsor-wrapper collapse remains separate from article formatting; see
[firenze-formatting-regression.md](firenze-formatting-regression.md).
Network/cosmetic rules do not become DNS filters. Device/browser checks should
compare the bundle with the four individual subscriptions using the same
client and HTTPS-filtering settings.

Differential support is not a fix for Android's manual-update status display.
AdGuard confirmed in [issue #6153](https://github.com/AdguardTeam/AdguardForAndroid/issues/6153#issuecomment-5294003933)
that manual checks force custom-list downloads, whereas automatic updates can
use patches. The misleading “updated” classification was subsequently marked
[completed for v4.15](https://github.com/AdguardTeam/AdguardForAndroid/issues/6153#issuecomment-5676615721).
On 2026-09-30, the official release history still lists stable 4.14.2; 4.15
Nightly 1 is listed for 2026-09-21. The issue closure does not establish which
published nightly build includes the fix, and there is no stable 4.15 release
listed yet. Do not infer changed filter content from that message or an
advanced timestamp.
