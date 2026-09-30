import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUNDLE, HISTORY, PATCHES, checkBundle, checkHistoryAgainstGit } from './bundle.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

export async function automationEnabled(root) {
  const config = JSON.parse(await readFile(path.join(root, 'bundle-automation.json'), 'utf8'));
  if (typeof config.enabled !== 'boolean') throw new Error('bundle-automation.json enabled must be a boolean');
  return config.enabled;
}

export function generatedChanges(root) {
  const tracked = git(root, 'diff', 'HEAD', '--name-only', '-z');
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z');
  const files = [...new Set(`${tracked}${untracked}`.split('\0').filter(Boolean))];
  for (const file of files) {
    if (file !== BUNDLE && !file.startsWith(`${HISTORY}/`) && !file.startsWith(`${PATCHES}/`)) {
      throw new Error(`Refusing unexpected build output: ${file}`);
    }
  }
  return files;
}

export async function checkCiOutputs(root) {
  const files = generatedChanges(root);
  if (!(await automationEnabled(root)) && files.length) {
    throw new Error('Automatic publishing is disabled; commit the generated bundle/history/patches before merging');
  }
  return files;
}

// Prepare one local commit. Network publication is a separate, guarded workflow
// step using the job token and an ordinary fast-forward-only Git push.
export async function preparePublicationCommit(root) {
  if (!(await automationEnabled(root))) throw new Error('Automatic publishing is disabled');
  await checkBundle(root);
  await checkHistoryAgainstGit(root, 'HEAD');
  const files = generatedChanges(root);
  if (!files.length) return false;
  git(root, 'add', '--', BUNDLE, HISTORY, PATCHES);
  git(root, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', 'Update fuckquotidianilocali bundle');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'enabled') console.log(await automationEnabled(process.cwd()));
    else if (process.argv[2] === 'check-ci') {
      const files = await checkCiOutputs(process.cwd());
      console.log(`Verified ${files.length} generated changes; no unrelated files were modified`);
    } else if (process.argv[2] === 'commit') console.log(await preparePublicationCommit(process.cwd()));
    else throw new Error('Usage: node tools/automation.mjs enabled|check-ci|commit');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
