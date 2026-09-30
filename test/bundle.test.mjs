import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DiffBuilder } from '@adguard/diff-builder';
import { DiffUpdater } from '@adguard/diff-builder/diff-updater';
import {
  BUNDLE, HISTORY, LOCK, MANIFEST, SOURCES,
  buildBundle, checkBundle, readArtifacts, sourceBody, verifyArtifacts, verifyHistoryExtension,
} from '../tools/bundle.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const START = Date.parse('2026-09-01T12:00:00.000Z');
const DAY = 86400000;
const diffPath = (content) => /^! Diff-Path: (.+)$/m.exec(content)[1];
const rules = (content) => content.split(/\r?\n/).filter((line) => line && !line.startsWith('!') && !line.startsWith('['));

async function fixture(t, { mockClock = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'filter-bundle-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(SOURCES.map((file) => copyFile(path.join(repo, file), path.join(root, file))));
  if (mockClock) t.mock.timers.enable({ apis: ['Date'], now: START });
  return root;
}

async function change(root, text = '||quiantella.it/test-new-campaign$image') {
  await appendFile(path.join(root, SOURCES[0]), `\n${text}\n`);
}

async function serve(t, files, overrides = new Map()) {
  const requests = [];
  const server = createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    requests.push(name);
    const override = overrides.get(name);
    res.statusCode = override?.status ?? (files.has(name) ? 200 : 404);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(override?.body ?? files.get(name) ?? '');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { url: `http://127.0.0.1:${server.address().port}/${BUNDLE}`, requests };
}

test('bootstrap preserves all four rule bodies and leaves individual subscriptions untouched', async (t) => {
  const root = await fixture(t);
  // These must never be discovered by wildcard or fetched by the generator.
  await writeFile(path.join(root, 'kebablastazione.txt'), 'youtube.com##.sentinel\n');
  await writeFile(path.join(root, 'quiantella-adblocker.user.js'), 'alert("userscript sentinel")');
  const original = await Promise.all(SOURCES.map((file) => readFile(path.join(root, file))));
  assert.deepEqual(await buildBundle(root), { changed: true, version: '1.0.0' });
  const files = await readArtifacts(root);
  const content = files.get(BUNDLE);
  const expectedRules = original.flatMap((buffer) => rules(buffer.toString()));
  assert.ok(expectedRules.length > 0);
  assert.deepEqual(rules(content), expectedRules);
  assert.doesNotMatch(content, /youtube\.com|userscript sentinel|!#include/);
  assert.equal((content.match(/^! Version:/gm) ?? []).length, 1);
  for (const [i, file] of SOURCES.entries()) assert.deepEqual(await readFile(path.join(root, file)), original[i]);
  assert.equal(files.get(diffPath(content)), '');
  await checkBundle(root);
  const { url, requests } = await serve(t, files);
  t.mock.timers.tick(3601000);
  assert.equal(await DiffUpdater.applyPatch({ filterUrl: url, filterContent: content }), content);
  assert.deepEqual(requests, [diffPath(content)]);
  assert.equal(await (await fetch(url)).text(), content);
});

test('no-op rebuilds preserve every byte after time passes or source header-only changes', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const before = await readArtifacts(root);
  t.mock.timers.tick(60 * DAY);
  await writeFile(path.join(root, SOURCES[0]), (await readFile(path.join(root, SOURCES[0]), 'utf8')).replace(/^! Version: .+/m, '! Version: 999.0.0').replace(/\r\n/g, '\n'));
  assert.deepEqual(await buildBundle(root), { changed: false, version: '1.0.0' });
  assert.deepEqual(await readArtifacts(root), before);
  await checkBundle(root);
});

test('official updater reconstructs multiple revisions, including rapid successive changes', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const first = await readArtifacts(root);
  await change(root);
  await assert.rejects(checkBundle(root), /stale/);
  await buildBundle(root);
  const second = await readArtifacts(root);
  // Same clock second: revision-specific patch names must still be unique.
  await change(root, 'quiantella.it##.test-new-banner');
  await buildBundle(root);
  const third = await readArtifacts(root);
  verifyHistoryExtension(first, third);
  verifyHistoryExtension(second, third);
  assert.equal(third.get(diffPath(first.get(BUNDLE))), second.get(diffPath(first.get(BUNDLE))));
  await checkBundle(root);
  t.mock.timers.tick(3601000);
  const { url, requests } = await serve(t, third);
  assert.equal(await DiffUpdater.applyPatch({ filterUrl: url, filterContent: first.get(BUNDLE) }), third.get(BUNDLE));
  assert.deepEqual(requests, [diffPath(first.get(BUNDLE)), diffPath(second.get(BUNDLE)), diffPath(third.get(BUNDLE))]);
});

test('history survives long idle periods and keeps newly activated old placeholders', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const first = await readArtifacts(root);
  t.mock.timers.tick(90 * DAY);
  await change(root);
  await buildBundle(root);
  const second = await readArtifacts(root);
  t.mock.timers.tick(60 * DAY);
  await change(root, 'quiantella.it##.later-test-banner');
  await buildBundle(root);
  const third = await readArtifacts(root);
  assert.equal(third.get(diffPath(first.get(BUNDLE))), second.get(diffPath(first.get(BUNDLE))));
  assert.equal(third.get(`${HISTORY}/1.0.0.txt`), first.get(BUNDLE));
  t.mock.timers.tick(3601000);
  const { url } = await serve(t, third);
  assert.equal(await DiffUpdater.applyPatch({ filterUrl: url, filterContent: first.get(BUNDLE) }), third.get(BUNDLE));
});

test('missing/204 patches leave old content intact; complete file remains available for full refresh', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const first = (await readArtifacts(root)).get(BUNDLE);
  await change(root);
  await buildBundle(root);
  const current = await readArtifacts(root);
  t.mock.timers.tick(3601000);
  const overrides = new Map([[diffPath(first), { status: 404, body: '' }]]);
  const { url } = await serve(t, current, overrides);
  assert.equal(await DiffUpdater.applyPatch({ filterUrl: url, filterContent: first }), first);
  overrides.set(diffPath(first), { status: 204, body: '' });
  assert.equal(await DiffUpdater.applyPatch({ filterUrl: url, filterContent: first }), first);
  overrides.set(diffPath(first), { status: 503, body: '' });
  await assert.rejects(DiffUpdater.applyPatch({ filterUrl: url, filterContent: first }));
  // This is an explicit full fetch, not a claim that Android falls back instantly.
  assert.equal(await (await fetch(url)).text(), current.get(BUNDLE));
});

test('corrupt patches are rejected by the official updater and the publication check', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const first = (await readArtifacts(root)).get(BUNDLE);
  await change(root);
  await buildBundle(root);
  const files = await readArtifacts(root);
  const patch = files.get(diffPath(first)).replace(/checksum:[0-9a-f]{40}/, `checksum:${'0'.repeat(40)}`);
  files.set(diffPath(first), patch);
  assert.throws(() => verifyArtifacts(files), /SHA-1/);
  t.mock.timers.tick(3601000);
  const { url } = await serve(t, files);
  await assert.rejects(DiffUpdater.applyPatch({ filterUrl: url, filterContent: first }), /patch|checksum/i);
  assert.equal(await (await fetch(url)).text(), files.get(BUNDLE));
});

test('incomplete or rewritten history fails closed instead of bootstrapping over it', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const before = await readArtifacts(root);
  await rm(path.join(root, diffPath(before.get(BUNDLE))));
  await assert.rejects(buildBundle(root), /Missing patch/);
  await writeFile(path.join(root, diffPath(before.get(BUNDLE))), '');
  await rm(path.join(root, MANIFEST));
  await assert.rejects(buildBundle(root), /Missing bundle manifest/);
  const otherRoot = await fixture(t, { mockClock: false });
  await change(otherRoot);
  await buildBundle(otherRoot);
  assert.throws(() => verifyHistoryExtension(before, new Map()), /Missing current bundle history/);
  assert.throws(() => verifyHistoryExtension(before, new Map([...before].filter(([name]) => !name.endsWith('1.0.0.txt')))), /snapshot/);
  const rewritten = await readArtifacts(otherRoot);
  assert.throws(() => verifyHistoryExtension(before, rewritten), /rewritten/);
});

test('failed or corrupt builder output leaves every published byte untouched', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const before = await readArtifacts(root);
  await change(root);
  await assert.rejects(buildBundle(root, { buildDiff: async () => { throw new Error('simulated failure'); } }), /simulated/);
  assert.deepEqual(await readArtifacts(root), before);
  await assert.rejects(buildBundle(root, { buildDiff: async (options) => {
    await DiffBuilder.buildDiff(options);
    const content = await readFile(options.oldFilterPath, 'utf8');
    await writeFile(path.join(path.dirname(options.newFilterPath), diffPath(content)), 'corrupt\n');
  } }), /directive/);
  assert.deepEqual(await readArtifacts(root), before);
});

test('a concurrent builder and a source edit during generation cannot publish mixed state', async (t) => {
  const root = await fixture(t);
  await buildBundle(root);
  const before = await readArtifacts(root);
  await change(root);
  await assert.rejects(buildBundle(root, { buildDiff: async (options) => {
    await assert.rejects(buildBundle(root), /locked/);
    await DiffBuilder.buildDiff(options);
    await change(root, 'quiantella.it##.changed-while-building');
  } }), /Source files changed/);
  assert.deepEqual(await readArtifacts(root), before);
  await mkdir(path.join(root, LOCK));
  await assert.rejects(buildBundle(root), /locked/);
  await rm(path.join(root, LOCK), { recursive: true });
  await buildBundle(root);
  await checkBundle(root);
});

test('conditional directives stay within each source and includes require explicit review', () => {
  const body = '! Title: source\r\n! Version: 1\r\n\r\n! comment\r\n!#if env_chromium\r\nexample.com##.ad\r\n!#else\r\nexample.com##.other\r\n!#endif\r\n';
  assert.equal(sourceBody(body, 'fixture'), '! comment\n!#if env_chromium\nexample.com##.ad\n!#else\nexample.com##.other\n!#endif\n');
  assert.throws(() => sourceBody('!#if env_chromium\nexample.com##.ad\n', 'fixture'), /unterminated/);
  assert.throws(() => sourceBody('!#include child.txt\n', 'fixture'), /unsupported directive/);
  assert.throws(() => sourceBody('!#endif\n', 'fixture'), /unmatched/);
});
