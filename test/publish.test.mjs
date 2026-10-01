import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUNDLE, HISTORY, PATCHES, SOURCES, buildBundle, readArtifacts, verifyHistoryExtension } from '../tools/bundle.mjs';
import { reconcile, runCommand } from '../tools/publish.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'bundle-reconcile-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed');
  const remote = path.join(root, 'remote.git');
  const runner = path.join(root, 'runner');
  await mkdir(seed);
  for (const file of [...SOURCES, BUNDLE, HISTORY, PATCHES, 'tools', '.gitignore', 'package.json', 'package-lock.json']) {
    await cp(path.join(repo, file), path.join(seed, file), { recursive: true });
  }
  await writeFile(path.join(seed, 'bundle-automation.json'), '{"enabled":true}\n');
  // The real publisher invokes npm test from each fresh checkout. The fixture
  // suite is small to avoid recursively running this orchestration suite.
  await mkdir(path.join(seed, 'test'));
  await writeFile(path.join(seed, 'test/fixture.test.mjs'), `import assert from 'node:assert/strict';
assert.equal(process.env.GH_TOKEN, undefined);
assert.equal(process.env.GITHUB_TOKEN, undefined);
`);
  // CI/publishing runs tests before building source-only changes. Establish
  // this fixture's initial published baseline without assuming the caller's
  // bundle is already current (and without touching the caller's artifacts).
  await buildBundle(seed);
  git(seed, 'init', '-b', 'main');
  git(seed, 'config', 'user.name', 'Bundle test');
  git(seed, 'config', 'user.email', 'bundle-test@example.invalid');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'Initial published fixture');
  git(root, 'init', '--bare', '-b', 'main', remote);
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'HEAD:refs/heads/main');
  git(root, 'clone', remote, runner);
  const before = await readArtifacts(seed);
  const head = () => git(remote, 'rev-parse', 'refs/heads/main');
  const sync = () => { git(seed, 'fetch', 'origin', 'main'); git(seed, 'reset', '--hard', 'FETCH_HEAD'); };
  async function change(file, content, { append = false } = {}) {
    sync();
    await (append ? appendFile : writeFile)(path.join(seed, file), content);
    git(seed, 'add', file);
    git(seed, 'commit', '-m', `Concurrent edit to ${file}`);
    git(seed, 'push', 'origin', 'HEAD:refs/heads/main');
    return head();
  }
  const source = (marker) => change(SOURCES[0], `\nquiantella.it##.${marker}\n`, { append: true });
  const calls = [];
  const waits = [];
  function run(command, args, options) {
    calls.push({ command, args, cwd: options.cwd });
    if (command === 'npm' && args[0] === 'ci') {
      // Only registry I/O is replaced: every checkout gets the pinned package
      // installed for the outer test run. Git, builder, tests, commit and push
      // commands execute unchanged against the real local bare remote.
      cpSync(path.join(repo, 'node_modules'), path.join(options.cwd, 'node_modules'), { recursive: true });
      assert.equal(options.env.GH_TOKEN, undefined);
      assert.equal(options.env.GITHUB_TOKEN, undefined);
      return '';
    }
    return runCommand(command, args, options);
  }
  const options = { run, wait: async (ms) => { waits.push(ms); }, log: () => {},
    env: { ...process.env, GH_TOKEN: 'test-temporary-token', GITHUB_TOKEN: 'test-temporary-token' } };
  const publish = (override = {}) => reconcile(runner, { ...options, ...override });
  async function verify() {
    sync();
    cpSync(path.join(repo, 'node_modules'), path.join(seed, 'node_modules'), { recursive: true });
    runCommand('node', ['tools/bundle.mjs', 'check'], { cwd: seed });
    verifyHistoryExtension(before, await readArtifacts(seed));
    assert.equal(git(runner, 'status', '--porcelain'), '');
    assert.equal(git(runner, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
  }
  return { root, seed, remote, runner, head, sync, change, source, calls, waits, run, publish, verify };
}

function isPush(command, args) { return command === 'git' && args.includes('push'); }
function isFetch(command, args) { return command === 'git' && args.includes('fetch'); }
const builds = (f) => f.calls.filter(({ command, args }) => command === 'node' && args[1] === 'build');

test('reconciliation fetches latest main, commits coherent artifacts, then stays byte-stable', async (t) => {
  const f = await fixture(t);
  const staleRunner = git(f.runner, 'rev-parse', 'HEAD');
  const sourceHead = await f.source('fresh-source');
  assert.notEqual(sourceHead, staleRunner);
  const result = await f.publish();
  assert.equal(result.status, 'published');
  assert.equal(git(f.remote, 'rev-parse', 'main^'), sourceHead);
  const names = git(f.remote, 'diff', '--name-only', 'main^', 'main').split('\n');
  assert.ok(names.includes(BUNDLE));
  assert.ok(names.includes(`${HISTORY}/manifest.json`));
  assert.ok(names.some((name) => name.startsWith(`${PATCHES}/`)));
  assert.ok(names.every((name) => name === BUNDLE || name.startsWith(`${HISTORY}/`) || name.startsWith(`${PATCHES}/`)));
  const published = f.head();
  assert.equal((await f.publish()).status, 'current');
  assert.equal(f.head(), published);
  assert.equal(git(f.remote, 'show', `main:${SOURCES[0]}`), git(f.remote, 'show', `${sourceHead}:${SOURCES[0]}`));
  assert.ok(f.calls.filter(({ args }) => args.includes('push')).every(({ args }) => !args.some((arg) => /force|rebase/.test(arg))));
  await f.verify();
});

test('actual rejected push triggers a fresh rebuild including another writer, with no second event', async (t) => {
  const f = await fixture(t);
  await f.source('first-change');
  let pushes = 0;
  let competingHead;
  // The command adapter is synchronous, as are real child processes. Prepare
  // the competing commit first, then expose it exactly at the push boundary.
  f.sync();
  await appendFile(path.join(f.seed, SOURCES[1]), '\ngazzettinodelchianti.it##.during-build\n');
  git(f.seed, 'add', SOURCES[1]);
  git(f.seed, 'commit', '-m', 'Competing source change');
  competingHead = git(f.seed, 'rev-parse', 'HEAD');
  const result = await f.publish({ run(command, args, options) {
    if (isPush(command, args) && ++pushes === 1) git(f.seed, 'push', 'origin', 'HEAD:refs/heads/main');
    return f.run(command, args, options);
  } });
  assert.equal(result.attempt, 2);
  assert.equal(pushes, 2);
  assert.equal(git(f.remote, 'rev-parse', 'main^'), competingHead);
  const body = git(f.remote, 'show', `main:${BUNDLE}`);
  assert.match(body, /first-change/);
  assert.match(body, /during-build/);
  assert.equal(builds(f).length, 2);
  assert.notEqual(builds(f)[0].cwd, builds(f)[1].cwd);
  assert.deepEqual(f.waits, [5000]);
  await f.verify();
});

test('another publisher winning the race keeps its history; rejected candidate is discarded', async (t) => {
  const f = await fixture(t);
  await f.source('shared-change');
  f.sync();
  cpSync(path.join(repo, 'node_modules'), path.join(f.seed, 'node_modules'), { recursive: true });
  runCommand('node', ['tools/bundle.mjs', 'build'], { cwd: f.seed });
  runCommand('node', ['tools/automation.mjs', 'commit'], { cwd: f.seed });
  const winner = git(f.seed, 'rev-parse', 'HEAD');
  const winnerArtifacts = await readArtifacts(f.seed);
  let pushes = 0;
  const result = await f.publish({ run(command, args, options) {
    if (isPush(command, args) && ++pushes === 1) git(f.seed, 'push', 'origin', 'HEAD:refs/heads/main');
    return f.run(command, args, options);
  } });
  assert.equal(result.status, 'current');
  assert.equal(result.attempt, 2);
  assert.equal(f.head(), winner);
  await f.verify();
  assert.deepEqual(await readArtifacts(f.seed), winnerArtifacts);
});

test('transient fetch and install failures are bounded and rebuilt from scratch', async (t) => {
  const f = await fixture(t);
  await f.source('after-transient-errors');
  let fetches = 0;
  let installs = 0;
  const result = await f.publish({ run(command, args, options) {
    if (isFetch(command, args) && ++fetches === 1) throw new Error('transient fetch outage');
    if (command === 'npm' && args[0] === 'ci' && ++installs === 1) throw new Error('transient npm outage');
    return f.run(command, args, options);
  } });
  assert.equal(result.attempt, 3);
  assert.equal(result.status, 'published');
  assert.deepEqual(f.waits, [5000, 10000]);
  await f.verify();
});

test('lost response after an accepted final push is verified without a duplicate version', async (t) => {
  const f = await fixture(t);
  await f.source('accepted-but-disconnected');
  let pushes = 0;
  const result = await f.publish({ run(command, args, options) {
    if (isPush(command, args)) {
      pushes += 1;
      if (pushes < 3) throw new Error('transport unavailable before push');
      f.run(command, args, options);
      throw new Error('server accepted push; response lost');
    }
    return f.run(command, args, options);
  } });
  assert.equal(pushes, 3);
  assert.equal(result.attempt, 4);
  assert.equal(result.status, 'current');
  assert.equal(builds(f).length, 3); // the last pass is strictly verification
  assert.equal(git(f.remote, 'rev-list', '--count', 'main'), '3');
  await f.verify();
});

test('disabled latest main stops a stale enabled checkout and a retry after conflict', async (t) => {
  const f = await fixture(t);
  await f.source('not-published');
  await f.change('bundle-automation.json', '{"enabled":false}\n');
  const disabledHead = f.head();
  assert.equal((await f.publish()).status, 'disabled');
  assert.equal(f.head(), disabledHead);
  assert.equal(builds(f).length, 0);
  await f.change('bundle-automation.json', '{"enabled":true}\n');
  f.sync();
  await writeFile(path.join(f.seed, 'bundle-automation.json'), '{"enabled":false}\n');
  git(f.seed, 'add', 'bundle-automation.json');
  git(f.seed, 'commit', '-m', 'Disable while a publisher builds');
  const result = await f.publish({ run(command, args, options) {
    if (isPush(command, args)) git(f.seed, 'push', 'origin', 'HEAD:refs/heads/main');
    return f.run(command, args, options);
  } });
  assert.equal(result.status, 'disabled');
  assert.equal(result.attempt, 2);
  assert.doesNotMatch(git(f.remote, 'show', `main:${BUNDLE}`), /not-published/);
});

test('fresh rebuild loads updated tools from main after a conflict', async (t) => {
  const f = await fixture(t);
  await f.source('latest-tools');
  f.sync();
  await appendFile(path.join(f.seed, 'tools/bundle.mjs'), '\nif (process.argv[2] === "build") console.log("CURRENT_BUILDER_USED");\n');
  git(f.seed, 'add', 'tools/bundle.mjs');
  git(f.seed, 'commit', '-m', 'Update builder while old one runs');
  let pushes = 0;
  const outputs = [];
  const result = await f.publish({ run(command, args, options) {
    if (isPush(command, args) && ++pushes === 1) git(f.seed, 'push', 'origin', 'HEAD:refs/heads/main');
    const output = f.run(command, args, options);
    if (command === 'node' && args[1] === 'build') outputs.push(output);
    return output;
  } });
  assert.equal(result.attempt, 2);
  assert.doesNotMatch(outputs[0], /CURRENT_BUILDER_USED/);
  assert.match(outputs[1], /CURRENT_BUILDER_USED/);
  await f.verify();
});

test('source write during a no-op is detected by the post-check fetch', async (t) => {
  const f = await fixture(t);
  await appendFile(path.join(f.seed, SOURCES[0]), '\nquiantella.it##.after-noop\n');
  git(f.seed, 'add', SOURCES[0]);
  git(f.seed, 'commit', '-m', 'Source write without another workflow event');
  let fetches = 0;
  const result = await f.publish({ run(command, args, options) {
    if (isFetch(command, args) && ++fetches === 2) git(f.seed, 'push', 'origin', 'HEAD:refs/heads/main');
    return f.run(command, args, options);
  } });
  assert.equal(result.attempt, 2);
  assert.equal(result.status, 'published');
  await f.verify();
});

test('a source write immediately after a successful push is reconciled within the same invocation', async (t) => {
  const f = await fixture(t);
  await f.source('first-published-revision');
  let pushes = 0;
  let accepted;
  const result = await f.publish({ run(command, args, options) {
    const output = f.run(command, args, options);
    if (isPush(command, args) && ++pushes === 1) {
      accepted = f.head();
      f.sync();
      // Simulates a different GITHUB_TOKEN workflow: no extra event is sent.
      execFileSync('node', ['-e', 'require("fs").appendFileSync(process.argv[1], "\\nquiantella.it##.after-accepted-push\\n")', SOURCES[0]], { cwd: f.seed });
      git(f.seed, 'add', SOURCES[0]);
      git(f.seed, 'commit', '-m', 'Source changed just after publication');
      git(f.seed, 'push', 'origin', 'HEAD:refs/heads/main');
    }
    return output;
  } });
  assert.equal(result.attempt, 2);
  assert.equal(pushes, 2);
  assert.equal(git(f.remote, 'rev-parse', 'main^^'), accepted);
  assert.match(git(f.remote, 'show', `main:${BUNDLE}`), /after-accepted-push/);
  await f.verify();
  runCommand('node', ['tools/bundle.mjs', 'history-check', accepted], { cwd: f.seed });
});

test('worktree setup failure retries from a new fetch without stale output', async (t) => {
  const f = await fixture(t);
  await f.source('after-checkout-error');
  let creates = 0;
  const result = await f.publish({ run(command, args, options) {
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'add' && ++creates === 1) {
      throw new Error('transient checkout failure');
    }
    return f.run(command, args, options);
  } });
  assert.equal(result.attempt, 2);
  assert.equal(builds(f).length, 1);
  await f.verify();
});

test('a cleanup failure cannot mask the original error or skip fresh-state retries', async (t) => {
  const f = await fixture(t);
  await f.source('after-cleanup-error');
  let installs = 0;
  let removes = 0;
  const warnings = [];
  const result = await f.publish({ log: (message) => warnings.push(message), run(command, args, options) {
    if (command === 'npm' && args[0] === 'ci' && ++installs === 1) throw new Error('temporary install failure');
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'remove' && ++removes === 1) {
      throw new Error('temporary worktree cleanup failure');
    }
    return f.run(command, args, options);
  } });
  assert.equal(result.attempt, 2);
  assert.ok(warnings.some((message) => /Attempt 1 failed: temporary install/.test(message)));
  assert.ok(warnings.some((message) => /Cleanup warning: temporary worktree/.test(message)));
  assert.equal(builds(f).length, 1);
  await f.verify();
});

test('a later timer invocation reconciles after the last failed run without any new push event', async (t) => {
  const f = await fixture(t);
  await f.source('scheduled-catch-up');
  const sourceHead = f.head();
  let pushes = 0;
  await assert.rejects(f.publish({ run(command, args, options) {
    if (isPush(command, args)) { pushes += 1; throw new Error('temporary push outage'); }
    return f.run(command, args, options);
  } }), /failed after 3 attempts/);
  assert.equal(pushes, 3);
  assert.equal(f.head(), sourceHead);
  assert.equal(builds(f).length, 3);
  // This is the timer's same entry point, not a hand-written build+push or
  // a new source event. Remote source/head are unchanged between invocations.
  assert.equal((await f.publish()).status, 'published');
  await f.verify();
  const recovered = f.head();
  assert.equal((await f.publish()).status, 'current');
  assert.equal(f.head(), recovered);
});

test('periodic invocation picks up event-suppressed writes after a successful run', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.publish()).status, 'current');
  await f.source('another-github-token-workflow');
  // No push-event dispatcher is used. Scheduled/manual entry runs reconcile.
  assert.equal((await f.publish()).status, 'published');
  await f.verify();
});

test('corrupt history fails closed through all retries and cannot be published', async (t) => {
  const f = await fixture(t);
  await f.source('must-not-publish-corruption');
  await f.change(`${HISTORY}/manifest.json`, '{}\n');
  const corruptHead = f.head();
  await assert.rejects(f.publish(), /failed after 3 attempts/);
  assert.equal(f.head(), corruptHead);
  assert.equal(f.calls.filter(({ command, args }) => isPush(command, args)).length, 0);
});
