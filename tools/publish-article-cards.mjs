// This runner has no npm dependencies: each attempt installs and executes the
// builder from a new checkout of main, never from a failed candidate's tree.
import { execFileSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export function runCommand(command, args, options) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000, maxBuffer: 8 * 1024 * 1024, ...options }).trim();
}

export async function reconcile(root, {
  maxAttempts = 3,
  run = runCommand,
  wait = setTimeout,
  log = console.log,
  env = process.env,
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error('Expected one to three publication attempts');
  }
  // Only Git transport receives the temporary credential. npm, tests and the
  // generator get neither token; nothing is persisted in Git configuration.
  const { GH_TOKEN, GITHUB_TOKEN, ...localEnv } = env;
  const local = (cwd, command, args) => run(command, args, { cwd, env: localEnv });
  const git = (cwd, ...args) => local(cwd, 'git', args);
  const transport = (cwd, ...args) => run('git', [
    '-c', 'credential.helper=',
    ...(GH_TOKEN ? ['-c', 'credential.helper=!gh auth git-credential'] : []),
    ...args,
  ], { cwd, env: { ...localEnv, GIT_TERMINAL_PROMPT: '0', ...(GH_TOKEN ? { GH_TOKEN } : {}) } });
  const freshHead = () => {
    transport(root, 'fetch', '--no-tags', 'origin', 'refs/heads/main');
    return git(root, 'rev-parse', 'FETCH_HEAD');
  };
  let lastError;
  let lastCandidate;
  let lastReport;
  // The extra pass is read-only verification, not a fourth push. It resolves a
  // final push whose server accepted the commit but whose response was lost.
  for (let attempt = 1; attempt <= maxAttempts + 1; attempt += 1) {
    const verifyOnly = attempt > maxAttempts;
    if (!verifyOnly) { lastCandidate = undefined; lastReport = undefined; }
    let temporary;
    let checkout;
    let attached = false;
    try {
      const base = freshHead();
      temporary = await mkdtemp(path.join(tmpdir(), 'article-cards-publish-'));
      checkout = path.join(temporary, 'checkout');
      git(root, 'worktree', 'add', '--detach', checkout, base);
      attached = true;
      const config = JSON.parse(await readFile(path.join(checkout, 'article-cards-automation.json'), 'utf8'));
      if (typeof config.enabled !== 'boolean') throw new Error('Automation flag must be a boolean');
      if (!config.enabled) return { status: 'disabled', head: base, attempt };
      log(`${verifyOnly ? 'Final verification' : `Attempt ${attempt}/${maxAttempts}`} from main ${base}`);
      local(checkout, 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
      if (verifyOnly) {
        // check validates the committed bundle against the fresh sources and
        // all retained history. It creates no candidate or patch.
        if (!lastCandidate || base !== lastCandidate) throw new Error('Cannot confirm previous discovery candidate on main');
        local(checkout, 'node', ['tools/article-cards.mjs', 'check']);
      } else {
        local(checkout, 'npm', ['test']);
        const reportFile = path.join(temporary, 'discovery-report.json');
        // Read the budget from THIS fresh checkout, not the stale runner.
        const budget = Number(local(checkout, 'node', ['--input-type=module', '-e', "import {DISCOVERY_PROCESS_MS} from './tools/article-cards.mjs'; console.log(DISCOVERY_PROCESS_MS)"]));
        if (!Number.isInteger(budget) || budget < 540_000 || budget > 660_000) throw new Error('Invalid discovery process budget');
        const output = run('node', ['tools/article-cards.mjs', 'discover', '--report', reportFile], { cwd: checkout, env: localEnv, timeout: budget });
        if (output) log(output);
        lastReport = JSON.parse(await readFile(reportFile, 'utf8'));
        if (Object.keys(lastReport).sort().join() !== 'colli,firenze,gdc,quiantella' || Object.values(lastReport).some(r => !['complete', 'failed', 'bounded-gap'].includes(r?.status))) throw new Error('Invalid discovery report');
        local(checkout, 'node', ['tools/article-cards.mjs', 'check']);
        local(checkout, 'node', ['tools/article-cards-commit.mjs']);
      }
      const candidate = git(checkout, 'rev-parse', 'HEAD');
      lastCandidate = candidate;
      const changed = candidate !== base;
      if (changed) {
        // A normal push is the compare-and-swap. No force, rebase or patch
        // replay: rejection (or uncertain success) discards this worktree.
        transport(checkout, 'push', 'origin', 'HEAD:refs/heads/main');
      }
      // Also catch another writer during a no-op or just after our push. A
      // later change still needs a subsequent event or the periodic catch-up.
      if (freshHead() !== candidate) throw new Error('main advanced during reconciliation');
      return { status: changed ? 'published' : 'current', head: candidate, attempt,
        partial: Object.values(lastReport || {}).some(r => r.status !== 'complete'), report: lastReport };
    } catch (error) {
      lastError = error;
      log(`${verifyOnly ? 'Final verification' : `Attempt ${attempt}`} failed: ${error.message}`);
    } finally {
      // Cleanup must not replace the publication result or abort its retries.
      // Only remove our own random directory/worktree, never reset the caller.
      if (attached) {
        try { git(root, 'worktree', 'remove', '--force', checkout); attached = false; }
        catch (error) { log(`Cleanup warning: ${error.message}`); }
      }
      if (temporary) {
        try { await rm(temporary, { recursive: true, force: true }); }
        catch (error) { log(`Cleanup warning: ${error.message}`); }
      }
      if (attached) {
        // Removing the directory may unblock Git's worktree deregistration.
        // If it still fails, leave isolated residue on the ephemeral runner;
        // subsequent attempts always get a different path and fresh main.
        try { git(root, 'worktree', 'remove', '--force', checkout); }
        catch (error) { log(`Isolated worktree cleanup warning: ${error.message}`); }
      }
    }
    if (attempt < maxAttempts) await wait(attempt * 5000);
  }
  throw new Error(`Article-card reconciliation failed after ${maxAttempts} attempts and a final read-only check; inspect the job and rerun workflow_dispatch after fixing the cause. ${lastError.message}`, { cause: lastError });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await reconcile(process.cwd());
    const message = `Article-card publisher: ${result.status}; main ${result.head}; pass ${result.attempt}; partial discovery: ${!!result.partial}.`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
    if (result.partial) {
      const failures = Object.entries(result.report).filter(([, r]) => r.status !== 'complete').map(([s, r]) => `${s}: ${r.status}${r.reason ? ' (' + r.reason + ')' : ''}`).join('; ');
      console.error('Successful sites reconciled; other sites kept last-good state: ' + failures);
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `Partial discovery: ${failures}. Complete sites were reconciled; failed/incomplete sites retained last-good data.\n`);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, 'Article-card publication failed. Inspect the failed job logs; after fixing the cause, run **Update optional article cards (disabled)** manually on `main`. The periodic check will also retry while enabled, subject to GitHub scheduling limits.\n');
    }
    process.exitCode = 1;
  }
}
