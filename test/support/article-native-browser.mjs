import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITES } from '../../tools/article-cards.mjs';
import { NATIVE_GROUP_SIZE, nativeLayoutCount } from '../../tools/article-native-css.mjs';

// Invented content in recovered layout shapes. No fetched article fixtures.
const link = '<a href="PATH">Invented sponsored title</a>';
const meta = `<div class="td-module-container"><div class="td-module-meta-info"><h3 class="td-module-title">${link}</h3></div></div>`;
const slide = `<div class="td-slide-meta"><h3 class="td-module-title">${link}</h3></div>`;
const fixture = (id, scope, html) => ({ id, scope, html });
const fixtures = {
  gdc: [
    fixture('gdc-home', 'home', `<div id="target" class="td_module_flex td_module_wrap td-cpt-post">${meta}</div>`),
    fixture('gdc-slide', 'home', `<div id="target" class="td_module_slide td-cpt-post">${slide}</div>`),
    fixture('gdc-search', 'search', `<div id="target" class="tdb_module_loop td_module_wrap td-cpt-post">${meta}</div>`),
    fixture('gdc-sidebar', 'single', `<aside class="vc_widget_sidebar"><div id="target" class="td_module_slide td-cpt-post">${slide}</div></aside>`),
    fixture('gdc-related', 'single', `<section class="tdb-single-related-posts"><div id="target" class="tdb_module_related td_module_wrap">${meta}</div></section>`),
  ],
  quiantella: [
    fixture('qa-home', 'home', '<article id="target" class="entry entry-grid type-post"><div class="entry-wrap"><h3 class="entry-title"><a class="entry-title-link" href="PATH">Invented title</a></h3></div></article>'),
    fixture('qa-search', 'search', '<article id="target" class="entry entry-archive type-post"><div class="entry-wrap"><h2 class="entry-title"><a class="entry-title-link" href="PATH">Invented title</a></h2></div></article>'),
    fixture('qa-related', 'single', '<section id="jp-relatedposts"><div class="jp-relatedposts-items"><div id="target" class="jp-relatedposts-post"><h4 class="jp-relatedposts-post-title"><a class="jp-relatedposts-post-a" href="PATH">Invented title</a></h4></div></div></section>'),
  ],
  colli: [
    fixture('colli-home', 'home', '<div id="target" class="uael-post-wrapper"><a class="uael-post__complete-box-overlay" href="PATH">Invented title</a></div>'),
    fixture('colli-search', 'search-results', `<article id="target" class="elementor-post"><h3 class="elementor-post__title">${link}</h3></article>`),
  ],
  firenze: [
    fixture('firenze-caption', '', `<article id="target" class="thumb-info"><div class="row"><div><div class="thumb-info-caption-text"><h2>${link}</h2></div></div></div></article>`),
    fixture('firenze-hero', '', '<a id="target" href="PATH"><article class="thumb-info"><h2>Invented hero</h2></article></a>'),
    fixture('firenze-image', '', '<aside><a id="target" href="PATH"><img alt="Invented sidebar card"></a></aside>'),
  ],
};

export async function testNativeStyles({ send, evaluate, frame, text, root }) {
  const all = text.split('\n').filter(s => s.includes('##'));
  assert.ok(all.length > 0);
  assert.ok(!text.includes('#?#') && !text.includes('#$?#'));
  const results = [];
  for (const [site, origin] of Object.entries(SITES)) {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    const paths = JSON.parse(await readFile(`${root}/article-cards/registries/${host}.json`, 'utf8')).paths;
    const rules = all.filter(s => s.startsWith(host + '##')).map(s => s.split('##')[1]);
    assert.equal(rules.length, Math.ceil(paths.length / NATIVE_GROUP_SIZE) * nativeLayoutCount(site));
    // Deliver the complete emitted per-site sheet, not just one selected rule.
    const sheet = rules.map(s => s + '{display:none!important}').join('\n');
    for (const f of fixtures[site]) {
      await send('Page.setDocumentContent', { frameId: frame, html: `<html><head><base href="${origin}/"></head><body class="${f.scope}"><main id="listing">${f.html.replaceAll('PATH', paths[0])}</main><article class="entry-content"><a id="body-link" href="${paths[0]}">Accessible article link</a></article></body></html>` });
      const result = await evaluate(`(()=>{
        const start=performance.now(),style=document.createElement('style');style.textContent=${JSON.stringify(sheet)};document.head.append(style);
        const target=document.querySelector('#target'),listing=document.querySelector('#listing');
        const visible=n=>getComputedStyle(n).display!=='none';
        const links=target.matches('a')?[target]:Array.from(target.querySelectorAll('a[href]'));
        const states={initial:visible(target)};const initialMs=performance.now()-start;
        const originals=links.map(a=>a.getAttribute('href'));
        links.forEach(a=>a.setAttribute('href','/invented-editorial/'));states.href=visible(target);
        links.forEach((a,i)=>a.setAttribute('href',originals[i]));states.hrefRestore=visible(target);
        links.forEach((a,i)=>a.setAttribute('href',${JSON.stringify(origin)}+originals[i]));states.absolute=visible(target);
        links.forEach((a,i)=>a.setAttribute('href',originals[i]+'?relatedposts_hit=1'));states.query=visible(target);
        links.forEach((a,i)=>a.setAttribute('href',originals[i]));
        document.querySelector('base').href='https://editorial.invalid/';states.base=visible(target);
        document.querySelector('base').href=${JSON.stringify(origin + '/')};states.baseRestore=visible(target);
        const mixed=document.createElement('span');mixed.innerHTML='<a href="/invented-editorial/">Editorial neighbor</a>';target.append(mixed);states.mixed=visible(target);mixed.remove();states.mixedRestore=visible(target);
        const other=document.createElement('a');other.href=${JSON.stringify(paths[1])};other.textContent='Another registered article';target.append(other);states.mixedRegistered=visible(target);other.remove();
        listing.className='entry-content';states.ancestorBody=visible(target);listing.className='';
        target.classList.add('entry-content');states.selfBody=visible(target);target.classList.remove('entry-content');
        const prose=document.createElement('div');prose.className='post-content';prose.textContent='Article prose';target.append(prose);states.descendantBody=visible(target);prose.remove();
        if(!target.matches('a')){const nested=target.cloneNode(true);nested.id='nested-card';target.append(nested);states.nested=visible(target);nested.remove();}
        const clone=listing.cloneNode(true);clone.id='editorial';clone.querySelector('#target').id='editorial-target';clone.querySelectorAll('a[href]').forEach(a=>a.setAttribute('href','/invented-editorial/'));listing.after(clone);
        states.neighbor=visible(clone.querySelector('#editorial-target'));clone.before(listing);states.reordered=visible(target);states.neighborAfter=visible(clone.querySelector('#editorial-target'));
        const lazy=listing.cloneNode(true);lazy.id='lazy';lazy.querySelector('#target').id='lazy-target';document.body.append(lazy);states.lazy=visible(lazy.querySelector('#lazy-target'));lazy.remove();
        const classes=target.className;target.className='unrelated';states.classChanged=visible(target);target.className=classes;
        const bodyClass=document.body.className;document.body.className='unrelated';states.scopeChanged=visible(target);document.body.className=bodyClass;
        states.final=visible(target);states.bodyLink=visible(document.querySelector('#body-link'));
        return {id:${JSON.stringify(f.id)},states,initialMs,rules:style.sheet.cssRules.length};
      })()`);
      const expected = { initial: false, href: true, hrefRestore: false, absolute: false, query: true, base: true, baseRestore: false, mixed: true, mixedRestore: false, mixedRegistered: true, ancestorBody: true, selfBody: true, descendantBody: true, neighbor: true, reordered: false, neighborAfter: true, lazy: false, classChanged: !['firenze-hero', 'firenze-image'].includes(f.id), scopeChanged: site !== 'firenze', final: false, bodyLink: true };
      if (!['firenze-hero', 'firenze-image'].includes(f.id)) expected.nested = true;
      // The hero/image layouts are identified by child structure, not a class
      // on the anchor.
      assert.deepEqual(result.states, expected, f.id);
      assert.equal(result.rules, rules.length, f.id + ' complete stylesheet parsed');
      results.push(result);
    }
    if (site === 'gdc') {
      const cards = Array.from({length:1000}, (_,i) => fixtures.gdc[0].html.replace('id="target"', `id="perf-${i}"`).replaceAll('PATH', i % 100 === 0 ? paths.at(-1) : `/invented-editorial-${i}/`)).join('');
      await send('Page.setDocumentContent', {frameId:frame,html:`<html><head><base href="${origin}/"></head><body class="home">${cards}</body></html>`});
      const perf = await evaluate(`(()=>{
        const start=performance.now(),style=document.createElement('style');style.textContent=${JSON.stringify(sheet)};document.head.append(style);
        const hidden=()=>Array.from(document.querySelectorAll('.td_module_flex')).filter(n=>getComputedStyle(n).display==='none').length;
        const initialHidden=hidden(),initialMs=performance.now()-start;
        return {cards:1000,initialHidden,initialMs};
      })()`);
      assert.equal(perf.initialHidden,10);
      console.log('Full native GDC stylesheet, invented 1,000-card page:',JSON.stringify(perf));
      const incremental = await evaluate(`(()=>{
        const t=performance.now();document.body.append(document.createElement('span'));getComputedStyle(document.querySelector('#perf-0')).display;const mutationMs=performance.now()-t;
        const startLazy=performance.now();const lazy=document.querySelector('#perf-0').cloneNode(true);lazy.id='perf-lazy';document.body.append(lazy);const lazyHidden=getComputedStyle(lazy).display==='none';const lazyMs=performance.now()-startLazy;
        return {mutationMs,lazyHidden,lazyMs};
      })()`);
      assert.equal(incremental.lazyHidden,true);
      console.log('Native GDC incremental stylesheet cost:',JSON.stringify(incremental));
    }
    if (site === 'firenze') {
      const row = `<h2 class="mb-0"><a href="${paths[0]}">Invented title</a></h2><p class="mb-0">Summary</p><p><a href="${paths[0]}">URL</a></p><hr>`;
      await send('Page.setDocumentContent',{frameId:frame,html:`<html><head><base href="${origin}/"></head><body><main class="searchpage">${row}</main></body></html>`});
      assert.equal(await evaluate(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(sheet)};document.head.append(s);return Array.from(document.querySelector('.searchpage').children).every(n=>getComputedStyle(n).display!=='none')})()`),true);
    }
  }
  console.log('Applied native stylesheet lifecycle (13 layouts):', JSON.stringify(results));
  return results;
}
