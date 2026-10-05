import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { browserExecutable, launchBrowser } from './support/browser-launch.mjs';

// Real disposable child processes exercise launch/exit, stderr and readiness.
// No installed browser or personal browser profile is used by these regressions.
const fixture = `
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[1];
const profile = process.argv.find(a => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
if (mode === 'exit') { process.stderr.write('x'.repeat(40000)+'launch-failure-sentinel'); process.exitCode=23; }
else if (mode === 'invalid') { fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'invalid\\n'); setInterval(()=>{},1000); }
else if (mode === 'hang') { process.stderr.write('waiting-sentinel'); setInterval(()=>{},1000); }
else { const server=require('node:http').createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({Browser:'FixtureBrowser/1.0'}));}); server.listen(0,'127.0.0.1',()=>fs.writeFileSync(path.join(profile,'DevToolsActivePort'),server.address().port+'\\n/test')); }
`;
function driver(mode) {
  let profile, child;
  return {
    spawnBrowser(executable, args, options) {
      profile = args.find(arg => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
      assert.ok(existsSync(profile));
      assert.ok(existsSync(options.env.XDG_CACHE_HOME));
      assert.ok(existsSync(options.env.XDG_CONFIG_HOME));
      assert.equal(args.includes('--no-sandbox'), false);
      assert.equal(options.windowsHide, true);
      child = spawn(process.execPath, ['-e', fixture, mode, ...args], options);
      return child;
    },
    assertClean() {
      assert.ok(child.exitCode !== null || child.signalCode !== null);
      assert.equal(existsSync(path.dirname(profile)), false);
    },
  };
}

test('explicit CHROME_BIN is authoritative, including a nonexistent path', async () => {
  const executable = path.join(process.cwd(), 'missing-browser-for-launch-test');
  assert.equal(browserExecutable({ CHROME_BIN: executable }), executable);
  await assert.rejects(launchBrowser({ executable, startupTimeoutMs: 2_000 }), error => {
    assert.match(error.message, /exited before debugging readiness/);
    assert.match(error.message, /ENOENT/);
    assert.ok(error.message.includes(executable.replaceAll('\\', '\\\\')));
    return true;
  });
});

test('early exit includes exit status and a bounded stderr tail, without waiting for timeout', async () => {
  const fake = driver('exit');
  const started = Date.now();
  await assert.rejects(launchBrowser({ executable: process.execPath, spawnBrowser: fake.spawnBrowser, startupTimeoutMs: 10_000, stderrLimit: 1_024 }), error => {
    assert.match(error.message, /code=23/);
    assert.match(error.message, /launch-failure-sentinel/);
    assert.ok(error.message.length < 2_048);
    return true;
  });
  assert.ok(Date.now() - started < 5_000);
  fake.assertClean();
});

test('startup timeout fails and stops the child before removing its isolated profile', async () => {
  const fake = driver('hang');
  await assert.rejects(launchBrowser({ executable: process.execPath, spawnBrowser: fake.spawnBrowser, startupTimeoutMs: 1_000 }), /startup timed out.*DevToolsActivePort/s);
  fake.assertClean();
});

test('malformed debugging port is reported rather than treated as a missing file', async () => {
  const fake = driver('invalid');
  await assert.rejects(launchBrowser({ executable: process.execPath, spawnBrowser: fake.spawnBrowser, startupTimeoutMs: 3_000 }), /Cannot read debugging port: Invalid DevToolsActivePort/);
  fake.assertClean();
});

test('readiness verifies the endpoint and exposes the actual version; close is idempotent', async () => {
  const fake = driver('ready');
  const browser = await launchBrowser({ executable: process.execPath, spawnBrowser: fake.spawnBrowser, startupTimeoutMs: 3_000 });
  try {
    assert.equal(browser.version, 'FixtureBrowser/1.0');
    assert.ok(browser.port > 0);
    assert.ok(existsSync(browser.profile));
  } finally { await browser.close(); await browser.close(); }
  fake.assertClean();
});
