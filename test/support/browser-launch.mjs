import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function browserExecutable(env = process.env) {
  if (env.CHROME_BIN) return env.CHROME_BIN;
  const candidates = process.platform === 'win32'
    ? ['C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe']
    : ['/usr/bin/google-chrome', '/usr/lib/chromium/chromium', '/usr/bin/chromium'];
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error('Browser test is required: set CHROME_BIN to a Chrome/Chromium-compatible executable');
  return executable;
}

export async function launchBrowser({
  executable = browserExecutable(), startupTimeoutMs = 15_000,
  stderrLimit = 16_384, spawnBrowser = spawn,
} = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'article-browser-'));
  const profile = path.join(temporary, 'profile');
  const cache = path.join(temporary, 'cache');
  const config = path.join(temporary, 'config');
  await Promise.all([profile, cache, config].map(directory => mkdir(directory)));
  const args = ['--headless', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'];
  const started = Date.now();
  let child, closed = false, exit = 'running', spawnError, stderr = Buffer.alloc(0);
  let version = 'unavailable before debugging endpoint';
  let lastReadinessError = 'DevToolsActivePort not created';
  let closing;
  let notifyClose;
  const closeEvent = new Promise(resolve => { notifyClose = resolve; });
  const diagnostic = reason => `${reason}; executable=${JSON.stringify(executable)}; version=${version}; elapsedMs=${Date.now() - started}; exit=${exit}; stderr tail:\n${stderr.toString('utf8') || '(empty)'}`;
  const waitForClose = async () => {
    let timer;
    try { return await Promise.race([closeEvent.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 2_000); })]); }
    finally { clearTimeout(timer); }
  };
  const close = () => closing ??= (async () => {
    if (child && !closed) {
      child.kill('SIGTERM');
      if (!await waitForClose()) {
        child.kill('SIGKILL');
        if (!await waitForClose()) throw new Error(diagnostic(`Browser would not exit; profile retained at ${temporary}`));
      }
    }
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  })();
  try {
    child = spawnBrowser(executable, args, {
      stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
      env: { ...process.env, XDG_CACHE_HOME: cache, XDG_CONFIG_HOME: config },
    });
    child.stderr.on('data', chunk => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > stderrLimit) stderr = stderr.subarray(stderr.length - stderrLimit);
    });
    child.on('error', error => { spawnError = error; exit = `spawn error ${error.code || error.message}`; });
    child.on('exit', (code, signal) => { exit = `code=${code}, signal=${signal}`; });
    child.on('close', () => { closed = true; notifyClose(); });
    while (Date.now() - started < startupTimeoutMs) {
      if (spawnError || closed || child.exitCode !== null || child.signalCode !== null) {
        throw new Error(diagnostic('Browser exited before debugging readiness'));
      }
      let port;
      try {
        const firstLine = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim();
        if (!/^\d+$/.test(firstLine) || Number(firstLine) < 1 || Number(firstLine) > 65535) {
          throw new Error(`Invalid DevToolsActivePort port: ${JSON.stringify(firstLine)}`);
        }
        port = Number(firstLine);
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error(diagnostic(`Cannot read debugging port: ${error.message}`));
      }
      if (port) {
        try {
          const remaining = startupTimeoutMs - (Date.now() - started);
          const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(Math.max(1, Math.min(1_000, remaining))) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const details = await response.json();
          if (typeof details.Browser !== 'string' || !details.Browser) throw new Error('Browser version missing from debugging endpoint');
          version = details.Browser;
          return { executable, version, port, profile, close };
        } catch (error) { lastReadinessError = error.message; }
      }
      await delay(50);
    }
    throw new Error(diagnostic(`Browser startup timed out: ${lastReadinessError}`));
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new Error(`${error.message}\nCleanup failed: ${cleanup.message}`, { cause: error }); }
    throw error;
  }
}
