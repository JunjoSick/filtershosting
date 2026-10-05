import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PUBLIC_FILES, buildPublicFiles, checkPublicFiles } from '../tools/public-files.mjs';
import { BUNDLE, HISTORY, PATCHES, SOURCES, buildBundle, readArtifacts } from '../tools/bundle.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const raw = 'https://raw.githubusercontent.com/JunjoSick/filtershosting/main/';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'public-files-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['sources', BUNDLE, HISTORY, PATCHES]) {
    await cp(path.join(repo, file), path.join(root, file), { recursive: true });
  }
  return root;
}

test('public paths, URL metadata and bundle input order remain compatible', async (t) => {
  const root = await fixture(t);
  assert.deepEqual(Object.keys(PUBLIC_FILES), [
    'fuckquiantella.txt', 'fuckgazzettinodelchianti.txt', 'fuckdaicollifiorentini.txt',
    'fuckfirenzedintorni.txt', 'kebablastazione.txt', 'quiantella-adblocker.user.js', 'article-cards.user.js',
  ]);
  assert.deepEqual(SOURCES, Object.values(PUBLIC_FILES).slice(0, 4));
  assert.equal((await buildPublicFiles(root)).length, 7);
  for (const [output, source] of Object.entries(PUBLIC_FILES)) {
    const content = await readFile(path.join(root, output));
    assert.deepEqual(content, await readFile(path.join(root, source)));
    const text = content.toString();
    if (output.endsWith('.txt')) assert.ok(text.includes(`! RAW: ${raw}${output}`));
    else {
      assert.equal(/^\/\/ @updateURL\s+(.+)$/m.exec(text)?.[1].trim(), `${raw}${output}`);
      assert.equal(/^\/\/ @downloadURL\s+(.+)$/m.exec(text)?.[1].trim(), `${raw}${output}`);
    }
    assert.doesNotMatch(text, /!#include/);
  }
  await checkPublicFiles(root);
});

test('repeated generation preserves bytes, timestamps and all differential artifacts', async (t) => {
  const root = await fixture(t);
  await buildPublicFiles(root);
  await buildBundle(root); // Also supports a source-only PR awaiting publication.
  const before = await readArtifacts(root);
  const times = await Promise.all(Object.keys(PUBLIC_FILES).map(async (file) => (await stat(path.join(root, file))).mtimeMs));
  assert.deepEqual(await buildPublicFiles(root), []);
  assert.equal((await buildBundle(root)).changed, false);
  assert.deepEqual(await readArtifacts(root), before);
  assert.deepEqual(await Promise.all(Object.keys(PUBLIC_FILES).map(async (file) => (await stat(path.join(root, file))).mtimeMs)), times);
});

test('source changes update exact public bytes; stale or manually edited copies fail validation', async (t) => {
  const root = await fixture(t);
  await buildPublicFiles(root);
  const source = PUBLIC_FILES['kebablastazione.txt'];
  const bytes = Buffer.from('! Version: 2.3\r\nyoutube.com##.test-only\r\n');
  await writeFile(path.join(root, source), bytes);
  await assert.rejects(checkPublicFiles(root), /kebablastazione/);
  assert.deepEqual(await buildPublicFiles(root), ['kebablastazione.txt']);
  assert.deepEqual(await readFile(path.join(root, 'kebablastazione.txt')), bytes);
  await writeFile(path.join(root, 'kebablastazione.txt'), 'accidental root-only edit');
  await assert.rejects(checkPublicFiles(root), /differ from sources/);
  await buildPublicFiles(root);
  await checkPublicFiles(root);
});

test('missing sources and non-file outputs fail before changing any public copy', async (t) => {
  const root = await fixture(t);
  await buildPublicFiles(root);
  const output = 'fuckquiantella.txt';
  const before = await readFile(path.join(root, output));
  await writeFile(path.join(root, PUBLIC_FILES[output]), 'new source');
  await rm(path.join(root, PUBLIC_FILES['kebablastazione.txt']));
  await assert.rejects(buildPublicFiles(root), /ENOENT/);
  assert.deepEqual(await readFile(path.join(root, output)), before);
  await writeFile(path.join(root, PUBLIC_FILES['kebablastazione.txt']), 'restored source');
  await rm(path.join(root, 'kebablastazione.txt'));
  await mkdir(path.join(root, 'kebablastazione.txt'));
  await assert.rejects(buildPublicFiles(root), /Expected regular file/);
  assert.deepEqual(await readFile(path.join(root, output)), before);
});

test('unlisted files cannot become public outputs', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'sources/filters/not-a-subscription.txt'), 'not public');
  await buildPublicFiles(root);
  await assert.rejects(readFile(path.join(root, 'not-a-subscription.txt')), /ENOENT/);
});

test('workflow tool/configuration paths and package build/check entry points resolve', async () => {
  const scripts = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8')).scripts;
  assert.match(scripts.build, /node tools\/public-files\.mjs build/);
  assert.match(scripts.check, /node tools\/public-files\.mjs check/);
  const workflowDir = path.join(repo, '.github/workflows');
  for (const name of await readdir(workflowDir)) {
    const workflow = await readFile(path.join(workflowDir, name), 'utf8');
    const refs = [...workflow.matchAll(/node (tools\/[\w.-]+\.mjs)|require\("(\.\/[^"\n]+\.json)"\)/g)];
    for (const match of refs) assert.ok((await stat(path.join(repo, match[1] ?? match[2]))).isFile());
  }
  const workflow = await readFile(path.join(workflowDir, 'publish-bundle.yml'), 'utf8');
  assert.ok(workflow.includes('./config/bundle-automation.json'));
  const runner = await readFile(path.join(repo, 'tools/publish.mjs'), 'utf8');
  assert.ok(runner.includes("'config/bundle-automation.json'"));
  assert.ok(runner.includes("['tools/public-files.mjs', 'build']"));
  assert.ok(runner.includes("['tools/public-files.mjs', 'check']"));
});
