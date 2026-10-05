import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { outputs, classify } from '../tools/article-cards.mjs';
import { testNativeStyles } from './support/article-native-browser.mjs';
import { launchBrowser } from './support/browser-launch.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
test('applied native subscription, ExtendedCss negative control and userscript lifecycle', async t => {
  const text = (await outputs(root)).get('fucksponsors.txt');
  const library = await readFile(path.join(root, 'node_modules/@adguard/extended-css/dist/extended-css.js'), 'utf8');
  const legacy = JSON.parse(await readFile(new URL('./fixtures/article-legacy-extended-rule.json', import.meta.url), 'utf8')).rule.split('#?#')[1];
  const p = JSON.parse(await readFile(path.join(root, 'article-cards/registries/gazzettinodelchianti.it.json'), 'utf8')).paths[0];
  const card = (href, id = 'card') => `<div id="${id}" class="td_module_flex td_module_wrap td-cpt-post"><div class="td-module-container"><div class="td-module-meta-info"><h3 class="td-module-title"><a href="${href}">Invented title</a></h3></div></div></div>`;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const { port } = browser;
  console.log('Browser test runtime:', JSON.stringify({executable:browser.executable,version:browser.version}));
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); t.after(()=>ws.close());
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const frame = (await send('Page.getFrameTree')).frameTree.frame.id;
  const documentFor = body => `<html><head><base href="https://www.gazzettinodelchianti.it/"></head><body class="home">${body}</body></html>`;
  await send('Page.setDocumentContent', {frameId:frame, html:documentFor(card(p))}); await evaluate(library);
  // Keep the old generated rule as an applied-runtime negative control. A
  // selector query alone cannot establish restoration by the delivery engine.
  const legacyResult = await evaluate(`(async()=>{
    const rule=${JSON.stringify(legacy)};const css=new ExtendedCss({cssRules:[rule+' {display:none!important}']});css.apply();
    const wait=()=>new Promise(r=>setTimeout(r,300));await wait();const c=document.querySelector('#card'),a=c.querySelector('a');
    const before=getComputedStyle(c).display;a.href='/editorial/';await wait();
    const href={matches:ExtendedCss.query(rule).length,display:getComputedStyle(c).display};
    a.setAttribute('href',${JSON.stringify(p)});document.querySelector('base').href='https://editorial.invalid/';await wait();
    const base={matches:ExtendedCss.query(rule).length,display:getComputedStyle(c).display};
    document.body.classList.add('control');await wait();const restored=getComputedStyle(c).display;css.dispose();return{before,href,base,restored};
  })()`);
  assert.equal(legacyResult.before,'none');assert.deepEqual(legacyResult.href,{matches:0,display:'none'});assert.deepEqual(legacyResult.base,{matches:0,display:'none'});assert.notEqual(legacyResult.restored,'none');
  console.log('Preserved unsafe ExtendedCss control:',JSON.stringify(legacyResult));
  await testNativeStyles({send,evaluate,frame,text,root});
  // Browser-visible/hidden ground truth for the classifier regressions.
  const label='<p class="probe">CONTENUTO SPONSORIZZATO</p>';
  const hidden=['<p class="probe" style="display:none ! important">CONTENUTO SPONSORIZZATO</p>','<p class="probe" style="visibility:hidden ! important">CONTENUTO SPONSORIZZATO</p>',...['canvas','audio','video','noscript','iframe','select'].map(tag=>`<${tag}>${label}</${tag}>`),...['HIDDEN','STYLE="display:none"','StYlE="visibility:hidden"','popover','popover="manual"'].map(a=>`<p class="probe" ${a}>CONTENUTO SPONSORIZZATO</p>`),'<style>p{display:none}</style>'+label];
  await send('Page.setDocumentContent',{frameId:frame,html:'<html><body><main></main></body></html>'});
  for(const html of hidden){const visible=await evaluate(`(()=>{document.querySelector('main').innerHTML=${JSON.stringify(html)};return document.querySelector('.probe')?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})??false})()`);assert.equal(visible,false,html);assert.equal(classify('gdc',html.replace(' class="probe"','')),'review',html);}
  const matrix = JSON.parse(await readFile(new URL('./fixtures/article-disclosure-matrix.json', import.meta.url), 'utf8'));
  for (const {site,name,html,expected} of matrix) {
    const visible = await evaluate(`(()=>{document.querySelector('main').innerHTML=${JSON.stringify(html)};return Array.from(document.querySelector('main').querySelectorAll('p,pre')).at(-1).checkVisibility({checkOpacity:true,checkVisibilityCSS:true})})()`);
    assert.equal(visible, true, `${site}: ${name}`); assert.equal(classify(site, html), expected, `${site}: ${name}`);
  }
  console.log('Disclosure matrix browser visibility:', JSON.stringify({cases:matrix.length,visible:matrix.length}));
  let userscript=await readFile(path.join(root,'article-cards.user.js'),'utf8');
  userscript=userscript.replace('debug: false','debug: true').replace("const host = location.hostname.toLowerCase().replace(/^www\\./, '');","const host = 'gazzettinodelchianti.it';");
  const invented='/invented-sponsored/';const many=Array.from({length:1000},(_,i)=>card(i%100===0?invented:'/invented-editorial-'+i+'/', 'card-'+i)).join('');
  await send('Page.setDocumentContent',{frameId:frame,html:documentFor(many)});
  await evaluate("window.GM_getValue=async(k,f)=>f;window.GM_setValue=async()=>{};window.GM_xmlhttpRequest=()=>{throw Error('Unexpected network')};window.requestIdleCallback=()=>1;");await evaluate(userscript);
  const result=await evaluate(`(async()=>{
    const api=window.__articleCardFilterTest;for(let i=0;!api.ready()&&i<100;i++)await new Promise(r=>setTimeout(r,10));if(!api.ready())throw Error('start timeout');
    api.replaceRegistry({snapshot:'a'.repeat(64)},new Set([${JSON.stringify(invented)}]));api.flush();const initial=api.metrics.nodes;
    for(let i=0;i<100;i++){document.body.append(document.createElement('span'));await Promise.resolve();api.flush();}await new Promise(r=>setTimeout(r,0));api.flush();
    const perf={...api.metrics,initialNodes:initial,incrementalNodes:api.metrics.nodes-initial,hidden:document.querySelectorAll('[data-local-article-card]').length};
    const flush=async()=>{await new Promise(r=>setTimeout(r,0));api.flush();};const c=document.querySelector('#card-0'),a=c.querySelector('a');
    a.href='/editorial/';await flush();const afterHref=getComputedStyle(c).display;
    a.setAttribute('href',${JSON.stringify(invented)});await flush();const reapplied=getComputedStyle(c).display;
    document.querySelector('base').href='https://editorial.invalid/';await flush();const afterBase=getComputedStyle(c).display;
    document.querySelector('base').href='https://www.gazzettinodelchianti.it/';await flush();
    const nested=document.createElement('span');nested.innerHTML='<a href="/editorial/">Editorial neighbor</a>';c.querySelector('h3').append(nested);await flush();const afterMixed=getComputedStyle(c).display;
    nested.remove();await flush();const restored=getComputedStyle(c).display;api.stop();return{perf,afterHref,reapplied,afterBase,afterMixed,restored};
  })()`);
  assert.equal(result.perf.hidden,10);assert.equal(result.perf.requests,0);assert.ok(result.perf.incrementalNodes<=250,JSON.stringify(result));
  assert.notEqual(result.afterHref,'none');assert.equal(result.reapplied,'none');assert.notEqual(result.afterBase,'none');assert.notEqual(result.afterMixed,'none');assert.equal(result.restored,'none');
  console.log('Chromium userscript applied lifecycle and performance:',JSON.stringify(result));
});
