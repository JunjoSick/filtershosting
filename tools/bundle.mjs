import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DiffBuilder } from '@adguard/diff-builder';

export const SOURCES = Object.freeze([
  'fuckquiantella.txt',
  'fuckgazzettinodelchianti.txt',
  'fuckdaicollifiorentini.txt',
  'fuckfirenzedintorni.txt',
]);
export const BUNDLE = 'fuckquotidianilocali.txt';
export const HISTORY = 'history/fuckquotidianilocali';
export const PATCHES = 'diffs/fuckquotidianilocali';
export const MANIFEST = `${HISTORY}/manifest.json`;
export const LOCK = '.bundle-build.lock';
const RAW = 'https://raw.githubusercontent.com/JunjoSick/filtershosting/main';
const MIN_RETENTION_SECONDS = 35 * 24 * 60 * 60;
const METADATA = /^! (?:Title|Description|Author|Version|Expires|Homepage|Licen[cs]e|RAW|Checksum|TimeUpdated|Last modified|Diff-Path|Diff-Expires|Diff-Name):/;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(content, algorithm = 'sha256', encoding = 'hex') {
  return createHash(algorithm).update(content).digest(encoding);
}

function tag(content, name) {
  const matches = [...content.matchAll(new RegExp(`^! ${name}: (.+)$`, 'gm'))];
  ensure(matches.length === 1, `Expected exactly one ${name} tag`);
  return matches[0][1];
}

function withoutTransportTags(content) {
  return content.replace(/^! (?:Checksum|Diff-Path):.*\n/gm, '');
}

// Remove only a source's leading subscription metadata. Preserve the rule body,
// comments, order and client-specific alternatives; do not sort or deduplicate.
export function sourceBody(content, filename) {
  ensure(!content.includes('\0'), `${filename}: NUL in filter`);
  const lines = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (/^\[Adblock(?: Plus)?[^\]]*\]$/.test(lines[0])) lines.shift();
  while (METADATA.test(lines[0])) lines.shift();
  while (lines[0] === '') lines.shift();
  const body = `${lines.join('\n').replace(/\n+$/, '')}\n`;
  ensure(body.trim(), `${filename}: empty filter`);
  const branches = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('!#')) continue;
    if (line.startsWith('!#if ')) branches.push(false);
    else if (line === '!#else') {
      ensure(branches.length && !branches.at(-1), `${filename}: unmatched !#else`);
      branches[branches.length - 1] = true;
    } else if (line === '!#endif') {
      ensure(branches.length, `${filename}: unmatched !#endif`);
      branches.pop();
    } else {
      throw new Error(`${filename}: review unsupported directive before bundling: ${line}`);
    }
  }
  ensure(branches.length === 0, `${filename}: unterminated !#if`);
  return body;
}

async function readSources(root) {
  return new Map(await Promise.all(SOURCES.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])));
}

function payload(sources) {
  return SOURCES.map((file) => `! ---- ${file} ----\n${sourceBody(sources.get(file), file)}`).join('\n');
}

function render(body, version, created) {
  return `[Adblock Plus 2.0]\n! Title: fuckquotidianilocali\n! Description: QuiAntella, Gazzettino del Chianti, Dai Colli Fiorentini, Firenze e Dintorni\n! Author: JunjoSick\n! Version: ${version}\n! TimeUpdated: ${created}\n! Expires: 30 days\n! Homepage: https://github.com/JunjoSick/filtershosting\n! Licence: https://github.com/JunjoSick/filtershosting/blob/main/LICENSE\n! RAW: ${RAW}/${BUNDLE}\n\n${body}`;
}

async function readOptional(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function readArtifacts(root) {
  const files = new Map();
  const bundle = await readOptional(path.join(root, BUNDLE));
  if (bundle !== null) files.set(BUNDLE, bundle);
  async function walk(relative) {
    let entries;
    try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else {
        ensure(entry.isFile(), `Expected regular generated file: ${file}`);
        files.set(file, await readFile(path.join(root, file), 'utf8'));
      }
    }
  }
  await walk(HISTORY);
  await walk(PATCHES);
  return files;
}

// Independently validate the official builder's output, including its checksum.
// v1.1.7 can log a self-validation failure without rejecting its promise.
export function applyCheckedPatch(oldContent, patch) {
  ensure(patch.endsWith('\n') && !patch.includes('\r'), 'Patch must use LF and end with a newline');
  const lines = patch.slice(0, -1).split('\n');
  const directive = /^diff checksum:([0-9a-f]{40}) lines:(\d+)$/.exec(lines.shift());
  ensure(directive && Number(directive[2]) === lines.length, 'Invalid patch directive or line count');
  const output = oldContent.slice(0, -1).split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const operation = /^([ad])(\d+) ([1-9]\d*)$/.exec(lines[i]);
    ensure(operation, 'Invalid RCS operation');
    const [, type, position, size] = operation;
    const count = Number(size);
    const index = Number(position) + offset - (type === 'd' ? 1 : 0);
    ensure(index >= 0 && index <= output.length, 'RCS position out of range');
    if (type === 'd') {
      ensure(index + count <= output.length, 'RCS deletion out of range');
      output.splice(index, count);
      offset -= count;
    } else {
      ensure(i + count < lines.length, 'Truncated RCS addition');
      output.splice(index, 0, ...lines.slice(i + 1, i + 1 + count));
      i += count;
      offset += count;
    }
  }
  const result = `${output.join('\n')}\n`;
  ensure(hash(result, 'sha1') === directive[1], 'Patch SHA-1 mismatch');
  return result;
}

function checkSnapshot(content, entry, index) {
  ensure(typeof content === 'string' && content.endsWith('\n') && !content.includes('\r'), 'Missing or invalid snapshot');
  ensure(entry.version === `1.0.${index}`, 'Nonsequential snapshot versions');
  ensure(new Date(entry.created).toISOString() === entry.created, 'Invalid snapshot date');
  ensure(hash(content) === entry.sha256, 'Snapshot SHA-256 mismatch');
  ensure(tag(content, 'Version') === entry.version && tag(content, 'TimeUpdated') === entry.created, 'Snapshot metadata mismatch');
  ensure(tag(content, 'RAW') === `${RAW}/${BUNDLE}` && tag(content, 'Expires') === '30 days', 'Invalid subscription metadata');
  const checksumContent = content.replace(/^! Checksum:.*\n/m, '').replace(/\n+/g, '\n');
  ensure(tag(content, 'Checksum') === hash(checksumContent, 'md5', 'base64').replace(/=+$/, ''), 'Filter MD5 checksum mismatch');
  const diffPath = tag(content, 'Diff-Path');
  ensure(new RegExp(`^${PATCHES}/fq_${index}-s-[0-9]+-3600\\.patch$`).test(diffPath), 'Unexpected Diff-Path');
  return diffPath;
}

export function verifyArtifacts(files) {
  if (files.size === 0) return null;
  ensure(files.has(MANIFEST), 'Missing bundle manifest; restore the published history before building');
  const manifest = JSON.parse(files.get(MANIFEST));
  ensure(manifest.format === 1 && Array.isArray(manifest.revisions) && manifest.revisions.length, 'Invalid bundle manifest');
  const expectedFiles = new Set([BUNDLE, MANIFEST]);
  let previous;
  let previousPatch;
  for (const [index, entry] of manifest.revisions.entries()) {
    const snapshotPath = `${HISTORY}/${entry.version}.txt`;
    const content = files.get(snapshotPath);
    const patchPath = checkSnapshot(content, entry, index);
    expectedFiles.add(snapshotPath);
    expectedFiles.add(patchPath);
    ensure(files.has(patchPath), `Missing patch: ${patchPath}`);
    if (previous !== undefined) {
      ensure(applyCheckedPatch(previous, files.get(previousPatch)) === content, 'Patch does not reconstruct the next snapshot');
    }
    previous = content;
    previousPatch = patchPath;
  }
  ensure(files.get(previousPatch) === '', 'Current revision must have an empty next-patch placeholder');
  ensure(files.get(BUNDLE) === previous, 'Bundle differs from its current snapshot');
  ensure(files.size === expectedFiles.size && [...files.keys()].every((file) => expectedFiles.has(file)), 'Unexpected generated files');
  return manifest;
}

function sameFiles(left, right) {
  return left.size === right.size && [...left].every(([file, content]) => right.get(file) === content);
}

export function verifyHistoryExtension(before, after) {
  const base = verifyArtifacts(before);
  const current = verifyArtifacts(after);
  ensure(current, 'Missing current bundle history');
  if (!base) return;
  ensure(JSON.stringify(current.revisions.slice(0, base.revisions.length)) === JSON.stringify(base.revisions), 'Published revision history was rewritten; rebuild on the current base');
  const activePatch = tag(before.get(BUNDLE), 'Diff-Path');
  for (const [file, content] of before) {
    if ([BUNDLE, MANIFEST, activePatch].includes(file)) continue;
    ensure(after.get(file) === content, `Published snapshot or patch was changed: ${file}`);
  }
}

export async function checkHistoryAgainstGit(root, ref) {
  const commit = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', commit], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const before = new Map(names.filter((file) => file === BUNDLE || file.startsWith(`${HISTORY}/`) || file.startsWith(`${PATCHES}/`)).map((file) => [
    file, execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, encoding: 'utf8' }),
  ]));
  verifyHistoryExtension(before, await readArtifacts(root));
}

export async function checkBundle(root) {
  const files = await readArtifacts(root);
  const manifest = verifyArtifacts(files);
  ensure(manifest, 'Bundle not built; run npm run build');
  const latest = manifest.revisions.at(-1);
  const expected = render(payload(await readSources(root)), latest.version, latest.created);
  ensure(withoutTransportTags(files.get(BUNDLE)) === expected, 'Bundle is stale; run npm run build and commit all generated files');
  return manifest;
}

export async function buildBundle(root, { buildDiff = DiffBuilder.buildDiff } = {}) {
  const lockPath = path.join(root, LOCK);
  try { await mkdir(lockPath); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Bundle build already locked; if no build is running, remove .bundle-build.lock and retry');
    throw error;
  }
  let stage;
  try {
    const sources = await readSources(root);
    const body = payload(sources);
    const before = await readArtifacts(root);
    const manifest = verifyArtifacts(before) ?? { format: 1, revisions: [] };
    const latest = manifest.revisions.at(-1);
    if (latest && withoutTransportTags(before.get(BUNDLE)) === render(body, latest.version, latest.created)) {
      return { changed: false, version: latest.version };
    }
    const revision = manifest.revisions.length;
    const version = `1.0.${revision}`;
    const created = new Date().toISOString();
    ensure(!latest || created >= latest.created, 'Clock predates the current bundle; refusing an older release');
    stage = await mkdtemp(path.join(root, '.bundle-stage-'));
    const newFilterPath = path.join(stage, BUNDLE);
    const oldFilterPath = path.join(stage, 'previous.txt');
    // Supplying a real bootstrap file makes the official builder create the
    // first Diff-Path and empty placeholder (a missing old file is skipped).
    await writeFile(oldFilterPath, before.get(BUNDLE) ?? '! Bootstrap\n');
    const candidate = render(body, version, created).replace('[Adblock Plus 2.0]\n', '[Adblock Plus 2.0]\n! Checksum: pending\n');
    await writeFile(newFilterPath, candidate);
    await buildDiff({
      oldFilterPath,
      newFilterPath,
      patchesPath: path.join(stage, PATCHES),
      name: `fq_${revision}`,
      time: 3600,
      resolution: 's',
      checksum: true,
      deleteOlderThanSec: MIN_RETENTION_SECONDS,
    });
    const content = await readFile(newFilterPath, 'utf8');
    ensure(withoutTransportTags(content) === render(body, version, created), 'Builder changed the filter payload');
    const after = new Map(before);
    after.set(BUNDLE, content);
    after.set(`${HISTORY}/${version}.txt`, content);
    const newPatch = tag(content, 'Diff-Path');
    // Read only the two outputs. Published history never enters the builder's
    // pruning directory: even an old placeholder becomes a fresh edge on change.
    const patchPaths = latest ? [tag(before.get(BUNDLE), 'Diff-Path'), newPatch] : [newPatch];
    for (const file of patchPaths) {
      ensure(file.startsWith(`${PATCHES}/`) && !file.includes('..'), 'Unsafe patch path');
      after.set(file, await readFile(path.join(stage, file), 'utf8'));
    }
    manifest.revisions.push({ version, created, sha256: hash(content) });
    after.set(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    verifyArtifacts(after);
    ensure(sameFiles(sources, await readSources(root)), 'Source files changed during build; retry');
    ensure(sameFiles(before, await readArtifacts(root)), 'Published artifacts changed during build; retry');
    // No output is touched until the entire candidate chain passes validation.
    // Commit bundle, snapshots, manifest and patches together in one Git commit.
    const changedFiles = [...after].filter(([file, value]) => before.get(file) !== value);
    try {
      for (const [file, value] of changedFiles) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await writeFile(path.join(root, file), value);
      }
    } catch (error) {
      for (const [file] of changedFiles) {
        if (before.has(file)) await writeFile(path.join(root, file), before.get(file));
        else await rm(path.join(root, file), { force: true });
      }
      throw error;
    }
    return { changed: true, version };
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
    await rm(lockPath, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const command = process.argv[2];
  try {
    if (command === 'build') {
      const result = await buildBundle(process.cwd());
      console.log(`${result.changed ? 'Built' : 'Unchanged'} ${BUNDLE} ${result.version}`);
    } else if (command === 'check') {
      const result = await checkBundle(process.cwd());
      console.log(`Verified ${result.revisions.length} bundle revision(s) and their patch chain`);
    } else if (command === 'history-check' && process.argv[3]) {
      await checkHistoryAgainstGit(process.cwd(), process.argv[3]);
      console.log('Verified published history against the Git base');
    } else throw new Error('Usage: node tools/bundle.mjs build|check|history-check <base-ref>');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
