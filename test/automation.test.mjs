import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFile, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, buildPublicFiles } from '../tools/public-files.mjs';
import { BUNDLE, HISTORY, PATCHES, SOURCES, buildBundle as buildBundleOnly } from '../tools/bundle.mjs';
import { automationEnabled, checkCiOutputs, generatedChanges, preparePublicationCommit } from '../tools/automation.mjs';

async function buildBundle(root) { await buildPublicFiles(root); return buildBundleOnly(root); }

const repo = fileURLToPath(new URL('../', import.meta.url));
function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
async function fixture(t, enabled) {
  const root = await mkdtemp(path.join(tmpdir(), 'bundle-automation-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'sources/filters'), { recursive: true });
  await Promise.all(SOURCES.map((file) => copyFile(path.join(repo, file), path.join(root, file))));
  await mkdir(path.join(root, 'config'));
  await cp(path.join(repo, 'sources'), path.join(root, 'sources'), { recursive: true });
  await writeFile(path.join(root, 'config/bundle-automation.json'), JSON.stringify({ enabled }));
  await copyFile(path.join(repo, '.gitignore'), path.join(root, '.gitignore'));
  await buildBundle(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Bundle test');
  git(root, 'config', 'user.email', 'bundle-test@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Initial published state');
  return root;
}
async function commitSourceChange(root) {
  await appendFile(path.join(root, SOURCES[0]), '\nquiantella.it##.automatic-build-test\n');
  git(root, 'add', SOURCES[0]);
  git(root, 'commit', '-m', 'Change source without manually generating bundle');
}

test('disabled publishing refuses commits and rejects ambiguous configuration', async (t) => {
  const root = await fixture(t, false);
  assert.equal(await automationEnabled(root), false);
  await assert.rejects(preparePublicationCommit(root), /disabled/);
  await writeFile(path.join(root, 'config/bundle-automation.json'), '{"enabled":"false"}');
  await assert.rejects(automationEnabled(root), /boolean/);
});

test('manual mode still requires committed outputs; enabled mode accepts an automatically generated candidate', async (t) => {
  const root = await fixture(t, false);
  await commitSourceChange(root);
  await buildBundle(root);
  await assert.rejects(checkCiOutputs(root), /commit the generated/);
  await writeFile(path.join(root, 'config/bundle-automation.json'), '{"enabled":true}');
  git(root, 'add', 'config/bundle-automation.json');
  git(root, 'commit', '-m', 'Enable automation in this local test only');
  assert.ok((await checkCiOutputs(root)).includes(BUNDLE));
});

test('automatic publication prepares only generated files and creates no no-op commit', async (t) => {
  const root = await fixture(t, true);
  await commitSourceChange(root);
  const sourceHead = git(root, 'rev-parse', 'HEAD');
  await buildBundle(root);
  assert.equal(await preparePublicationCommit(root), true);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), sourceHead);
  const names = git(root, 'diff', '--name-only', 'HEAD^', 'HEAD').split('\n');
  assert.ok(names.includes(BUNDLE));
  assert.ok(names.every((name) => Object.hasOwn(PUBLIC_FILES, name) || name === BUNDLE || name.startsWith(`${HISTORY}/`) || name.startsWith(`${PATCHES}/`)));
  assert.equal(git(root, 'status', '--porcelain'), '');
  const publishedHead = git(root, 'rev-parse', 'HEAD');
  await buildBundle(root);
  assert.equal(await preparePublicationCommit(root), false);
  assert.equal(git(root, 'rev-parse', 'HEAD'), publishedHead);
  await writeFile(path.join(root, 'unexpected.txt'), 'do not commit');
  assert.throws(() => generatedChanges(root), /unexpected/);
});

test('ordinary publication push rejects a concurrent main change without overwriting it', async (t) => {
  const root = await fixture(t, true);
  await commitSourceChange(root);
  const remote = await mkdtemp(path.join(tmpdir(), 'bundle-remote-test-'));
  const competitor = await mkdtemp(path.join(tmpdir(), 'bundle-writer-test-'));
  t.after(() => rm(remote, { recursive: true, force: true }));
  t.after(() => rm(competitor, { recursive: true, force: true }));
  git(remote, 'init', '--bare', '-b', 'main');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', 'origin', 'HEAD:refs/heads/main');
  git(competitor, 'clone', remote, '.');
  git(competitor, 'config', 'user.name', 'Other test writer');
  git(competitor, 'config', 'user.email', 'other-test@example.invalid');
  await buildBundle(root);
  await preparePublicationCommit(root);
  await writeFile(path.join(competitor, 'README.md'), 'Concurrent unrelated main change\n');
  git(competitor, 'add', 'README.md');
  git(competitor, 'commit', '-m', 'Concurrent change');
  git(competitor, 'push', 'origin', 'HEAD:refs/heads/main');
  const competingHead = git(competitor, 'rev-parse', 'HEAD');
  const rejected = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /rejected/);
  assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), competingHead);
  // A fresh queued run starts from the latest main and can publish safely.
  await buildBundle(competitor);
  assert.equal(await preparePublicationCommit(competitor), true);
  git(competitor, 'push', 'origin', 'HEAD:refs/heads/main');
  assert.equal(git(remote, 'show', 'main:README.md'), 'Concurrent unrelated main change');
  assert.match(await readFile(path.join(competitor, BUNDLE), 'utf8'), /automatic-build-test/);
});
