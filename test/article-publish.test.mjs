import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reconcile, runCommand } from '../tools/publish-article-cards.mjs';
const repo = new URL('../', import.meta.url).pathname;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const isPush = (c, a) => c === 'git' && a.includes('push');
async function fixture(t, enabled = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'article-publish-')); t.after(() => rm(root, { recursive: true, force: true }));
  const seed = path.join(root, 'seed'); const remote = path.join(root, 'remote.git'); const runner = path.join(root, 'runner'); await mkdir(seed);
  for (const f of ['article-cards','tools','sponsored-article-cards.txt','package.json','package-lock.json','.gitignore']) await cp(path.join(repo, f), path.join(seed, f), { recursive: true });
  await writeFile(path.join(seed, 'article-cards-automation.json'), JSON.stringify({ enabled }) + '\n');
  // Only transport is synthetic. Execute the production discovery CLI,
  // report file, exit policy, commit guard and publisher unchanged.
  await writeFile(path.join(seed, 'fixture-http.cjs'), `
if(process.env.GH_TOKEN||process.env.GITHUB_TOKEN)throw Error('credential leak');
global.fetch=async(url,options)=>{
 if(!options.signal || options.redirect!=='error')throw Error('missing request safety');
 if(url.startsWith('https://daicollifiorentini.it'))return new Response(JSON.stringify([{link:'https://daicollifiorentini.it/invented-publisher-test/',date_gmt:'2026-10-02T10:00:00',modified_gmt:'2026-10-02T10:00:00',content:{rendered:'<p>Articolo ADV</p>'}}]),{headers:{'x-wp-totalpages':'1'}});
 return new Response('',{status:403});
};
`);
  await mkdir(path.join(seed, 'test')); await writeFile(path.join(seed, 'test/fixture.test.mjs'), "import assert from 'node:assert/strict'; assert.equal(process.env.GH_TOKEN,undefined); assert.equal(process.env.GITHUB_TOKEN,undefined);\n");
  git(seed,'init','-b','main'); git(seed,'config','user.name','Article test'); git(seed,'config','user.email','test@example.invalid'); git(seed,'add','.'); git(seed,'commit','-m','Fixture');
  git(root,'init','--bare','-b','main',remote); git(seed,'remote','add','origin',remote); git(seed,'push','origin','main'); git(root,'clone',remote,runner);
  const head = () => git(remote,'rev-parse','main'); const calls = [];
  async function change(name, content) { git(seed,'fetch','origin','main'); git(seed,'reset','--hard','FETCH_HEAD'); await writeFile(path.join(seed,name),content); git(seed,'add',name); git(seed,'commit','-m','Concurrent change'); git(seed,'push','origin','main'); }
  function run(command,args,options) {
    calls.push({command,args,cwd:options.cwd});
    if(command==='npm'&&args[0]==='ci') {
      assert.equal(options.env.GH_TOKEN,undefined); assert.equal(options.env.GITHUB_TOKEN,undefined);
      // Parser only: publisher tests do not recursively run the outer suite.
      cpSync(path.join(repo,'node_modules'),path.join(options.cwd,'node_modules'),{recursive:true}); return '';
    }
    if(command==='node'&&args[0]==='tools/article-cards.mjs'&&args[1]==='discover') {
      assert.equal(options.timeout,600000);
      assert.equal(options.env.GH_TOKEN,undefined);assert.equal(options.env.GITHUB_TOKEN,undefined);
      return runCommand(command,args,{...options,env:{...options.env,NODE_OPTIONS:'--require '+path.join(options.cwd,'fixture-http.cjs')}});
    }
    return runCommand(command,args,options);
  }
  const options = {run,wait:async()=>{},log:()=>{},env:{...process.env,GH_TOKEN:'ephemeral-test-token',GITHUB_TOKEN:'ephemeral-test-token'}};
  const publish = o => reconcile(runner,{...options,...o});
  const clean = () => { assert.equal(git(runner,'status','--porcelain'),''); assert.equal(git(runner,'worktree','list','--porcelain').match(/^worktree /gm).length,1); };
  return {seed,remote,runner,head,change,run,publish,calls,clean};
}
test('new publisher gate is disabled without installing or generating anything',async t=>{
  const f=await fixture(t,false); const before=f.head(); assert.equal((await f.publish()).status,'disabled'); assert.equal(f.head(),before); assert.equal(f.calls.some(c=>c.command==='npm'),false); f.clean();
});
test('atomic publication modifies only article outputs and a second run is a byte-stable no-op',async t=>{
  const f=await fixture(t); const first=await f.publish(); assert.equal(first.status,'published'); assert.equal(first.partial,true); assert.equal(first.report.colli.status,'complete'); assert.equal(first.report.firenze.status,'failed'); const before=f.head();
  const files=git(f.remote,'diff','--name-only','main^','main').split('\n'); assert.deepEqual(files.sort(),['article-cards/registries/daicollifiorentini.it.json','article-cards/state.json','sponsored-article-cards.txt']);
  const next=await f.publish();assert.equal(next.status,'current');assert.equal(next.partial,true); assert.equal(f.head(),before); f.clean();
});
test('actual publisher rejects ambiguous RSS dates and cannot commit the invented path', async t => {
  const f = await fixture(t);
  const xml = '<rss xmlns:c="http://purl.org/rss/1.0/modules/content/"><channel><item><link>https://www.gazzettinodelchianti.it/invented-date-ambiguity/</link><pubDate>10/02/2026</pubDate><c:encoded><![CDATA[<p>CONTENUTO SPONSORIZZATO</p>]]></c:encoded></item></channel></rss>';
  await f.change('fixture-http.cjs', "if(process.env.GH_TOKEN||process.env.GITHUB_TOKEN)throw Error('credential leak');global.fetch=async url=>url.startsWith('https://www.gazzettinodelchianti.it')?new Response(" + JSON.stringify(xml) + "):new Response('',{status:403});\n");
  const before = f.head(); const result = await f.publish({ maxAttempts: 1 });
  assert.equal(result.status, 'current'); assert.equal(result.partial, true); assert.equal(result.report.gdc.status, 'failed'); assert.match(result.report.gdc.reason, /RSS UTC date/);
  assert.equal(f.head(), before); assert.deepEqual(JSON.parse(git(f.remote, 'show', 'main:article-cards/state.json')).sites.gdc.additions, []); f.clean();
});
test('normal push race rebuilds from concurrent main in another fresh worktree',async t=>{
  const f=await fixture(t); let raced=false; const dirs=[];
  const result=await f.publish({run:(c,a,o)=>{
    if(c==='node'&&a[1]==='discover')dirs.push(o.cwd);
    if(isPush(c,a)&&!raced){raced=true;git(f.seed,'fetch','origin','main');git(f.seed,'reset','--hard','FETCH_HEAD');execFileSync('node',['-e',"require('fs').writeFileSync('concurrent-note.txt','preserved\\n')"],{cwd:f.seed});git(f.seed,'add','.');git(f.seed,'commit','-m','Other publisher');git(f.seed,'push','origin','main');}
    return f.run(c,a,o);
  }});
  assert.equal(result.attempt,2); assert.equal(new Set(dirs).size,2); assert.equal(git(f.remote,'show','main:concurrent-note.txt'),'preserved'); f.clean();
});
test('lost final push response is confirmed read-only without another generation',async t=>{
  const f=await fixture(t);let pushes=0;
  const result=await f.publish({maxAttempts:1,run:(c,a,o)=>{const out=f.run(c,a,o);if(isPush(c,a)){pushes++;throw Error('response lost');}return out;}});
  assert.equal(result.status,'current');assert.equal(result.attempt,2);assert.equal(pushes,1);assert.equal(f.calls.filter(c=>c.command==='node'&&c.args[1]==='discover').length,1);f.clean();
});
test('failed generation and rejected pushes stay visible; final check cannot claim success',async t=>{
  const f=await fixture(t);const before=f.head();
  await assert.rejects(f.publish({maxAttempts:1,run:(c,a,o)=>{if(c==='node'&&a[1]==='discover')throw Error('upstream failure');return f.run(c,a,o);}}),/Cannot confirm/);assert.equal(f.head(),before);
  await assert.rejects(f.publish({maxAttempts:1,run:(c,a,o)=>{if(isPush(c,a))throw Error('push rejected');return f.run(c,a,o);}}),/Cannot confirm/);assert.equal(f.head(),before);f.clean();
});
test('concurrent disable is reread before retrying and discards rejected candidate',async t=>{
  const f=await fixture(t);let changed=false;
  const result=await f.publish({run:(c,a,o)=>{
    if(isPush(c,a)&&!changed){changed=true;git(f.seed,'fetch','origin','main');git(f.seed,'reset','--hard','FETCH_HEAD');execFileSync('node',['-e',"require('fs').writeFileSync('article-cards-automation.json','{\"enabled\":false}\\n')"],{cwd:f.seed});git(f.seed,'add','.');git(f.seed,'commit','-m','Disable');git(f.seed,'push','origin','main');}
    return f.run(c,a,o);
  }});assert.equal(result.status,'disabled');assert.equal(result.attempt,2);assert.equal(git(f.remote,'show','main:article-cards/state.json').includes('invented-publisher-test'),false);f.clean();
});
test('a concurrent main advance during a no-op triggers a fresh no-op without pushing',async t=>{
  const f=await fixture(t);await f.publish();let fetches=0;let pushes=0;
  const result=await f.publish({run:(c,a,o)=>{
    if(isPush(c,a))pushes++;
    if(c==='git'&&a.includes('fetch')&&++fetches===2){git(f.seed,'fetch','origin','main');git(f.seed,'reset','--hard','FETCH_HEAD');execFileSync('node',['-e',"require('fs').writeFileSync('other-writer.txt','kept\\n')"],{cwd:f.seed});git(f.seed,'add','.');git(f.seed,'commit','-m','Concurrent no-op advance');git(f.seed,'push','origin','main');}
    return f.run(c,a,o);
  }});assert.equal(result.status,'current');assert.equal(result.attempt,2);assert.equal(pushes,0);assert.equal(git(f.remote,'show','main:other-writer.txt'),'kept');f.clean();
});
