import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createHash, webcrypto } from 'node:crypto';
const digest = paths => createHash('sha256').update(JSON.stringify(paths) + '\n').digest('hex');
const source = await readFile(new URL('../article-cards.user.js', import.meta.url), 'utf8');
const blocked = '/invented-sponsored/'; const mark = '[data-local-article-card]';
const card = (href = blocked, kind = 'td_module_flex td_module_wrap td-cpt-post') => `<div class="${kind}"><div class="td-module-container"><div class="td-module-meta-info"><h3 class="td-module-title"><a href="${href}">Invented title</a></h3></div></div></div>`;
const row = (p, second = p) => `<h2 class="mb-0"><a href="${p}">Title</a></h2><p class="mb-0">Summary</p><p><a href="${second}">URL</a></p><hr>`;
async function setup(t, html, host = 'gazzettinodelchianti.it', opts = {}) {
  const dom = new JSDOM(html, { url: `https://${host}/`, runScripts: 'outside-only', pretendToBeVisual: true }); const w = dom.window;
  const data = { schema: 1, host, snapshot: digest([blocked]), paths: [blocked] };
  const store = opts.store ?? new Map([[`article-cards-v1:${host}`, { data, checkedAt: Date.now() }]]);
  Object.defineProperty(w.crypto, 'subtle', { value: webcrypto.subtle }); w.TextEncoder = TextEncoder;
  let network = 0;
  w.GM_getValue = async (k, f) => store.get(k) ?? f; w.GM_setValue = async (k, v) => store.set(k, v);
  w.GM_xmlhttpRequest = options => { network++; opts.request?.(options); return { abort() { opts.abort?.(); options.onabort(); } }; };
  w.requestIdleCallback = () => 1;
  opts.prepare?.(w);
  w.eval((opts.source ?? source).replace('debug: false', 'debug: true'));
  const api = w.__articleCardFilterTest;
  for (let i = 0; !api.ready() && i < 200; i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(api.ready(), 'asynchronous cache verification completed');
  const flush = async () => { await new Promise(r => setImmediate(r)); api.flush(); await new Promise(r => setImmediate(r)); api.flush(); };
  await flush(); t.after(() => { api.stop(); w.close(); });
  return { w, api, store, data, flush, network: () => network };
}
test('exact path preserves slash and recognized tracking only; direct body remains visible', async t => {
  const x = await setup(t, `<body class="home">${card()}${card('/invented-sponsored')}${card(blocked + '?utm_source=feed')}${card(blocked + '?unrecognized=1')}<div class="tdb_single_content">${card()}<a href="${blocked}">Body</a></div></body>`);
  assert.equal(x.w.document.querySelectorAll(mark).length, 2); assert.equal(x.w.document.querySelector('.tdb_single_content ' + mark), null); assert.equal(x.network(), 0);
  for (const url of ['javascript:alert(1)', '//evil.invalid/path/', 'https://user:pass@gazzettinodelchianti.it/path/']) assert.equal(x.api.normalizedPath(url), null);
});
test('lazy loading, recycled href/classes, body scope changes, cloning and reinsertion restore safely', async t => {
  const x = await setup(t, '<body class="home"><main></main></body>'); const main = x.w.document.querySelector('main');
  main.innerHTML = card(); await x.flush(); const c = main.firstElementChild; assert.ok(c.matches(mark));
  const clone = c.cloneNode(true); clone.querySelector('a').href = '/editorial/'; main.append(clone); await x.flush(); assert.ok(!clone.matches(mark));
  c.querySelector('a').href = '/editorial/'; await x.flush(); assert.ok(!c.matches(mark));
  c.querySelector('a').href = blocked; await x.flush(); assert.ok(c.matches(mark));
  x.w.document.body.className = 'single'; await x.flush(); assert.ok(!c.matches(mark));
  x.w.document.body.className = 'home'; await x.flush(); assert.ok(c.matches(mark));
  c.remove(); await x.flush(); main.className = 'tdb_single_content'; main.append(c); await x.flush(); assert.ok(!c.matches(mark));
});
test('article-page GDC sidebar and related cards hide independently of body links', async t => {
  const slide = `<div class="td_module_slide td-cpt-post"><div class="td-slide-meta"><h3 class="td-module-title"><a href="${blocked}">Title</a></h3></div></div>`;
  const x = await setup(t, `<body class="single"><article class="tdb_single_content"><a href="${blocked}">Body</a>${slide}</article><aside class="vc_widget_sidebar">${slide}</aside><div class="tdb-single-related-posts">${card(blocked, 'tdb_module_related td_module_wrap')}</div></body>`);
  assert.equal(x.w.document.querySelectorAll(mark).length, 2); assert.equal(x.w.document.querySelector('article ' + mark), null);
});
test('QA Jetpack attribution parameters do not hide direct article bodies', async t => {
  const x = await setup(t, `<body class="single"><article class="entry-content"><a href="${blocked}">Body link</a></article><div id="jp-relatedposts"><div class="jp-relatedposts-items"><div class="jp-relatedposts-post"><h4 class="jp-relatedposts-post-title"><a class="jp-relatedposts-post-a" href="${blocked}?relatedposts_hit=1&relatedposts_origin=1&relatedposts_position=0">Title</a></h4></div></div></div></body>`, 'quiantella.it');
  assert.equal(x.w.document.querySelectorAll(mark).length, 1); assert.equal(x.w.document.querySelector('article ' + mark), null);
});
test('unsupported Firenze split rows stay visible through href changes', async t => {
  const x = await setup(t, `<body><div class="searchpage">${row(blocked)}${row('/editorial/')}${row(blocked, '/mismatch/')}</div></body>`, 'firenzedintorni.it');
  assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  x.w.document.querySelector('h2 a').href = '/editorial/'; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  x.w.document.querySelector('h2 a').href = blocked; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  x.w.document.querySelector('p:not(.mb-0) > a').href = '/editorial/'; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
});
test('Firenze image-only sidebar does not select an image in article content', async t => {
  const x = await setup(t, `<body><article class="blog-single-post"><div class="post-content"><aside><a href="${blocked}"><img></a></aside></div></article><aside><a href="${blocked}"><img></a><a href="/editorial/"><img></a></aside></body>`, 'firenzedintorni.it');
  assert.equal(x.w.document.querySelectorAll(mark).length, 1); assert.equal(x.w.document.querySelector('article ' + mark), null);
});
test('unsupported Firenze fragments stay visible through removal and lazy replacement', async t => {
  const x = await setup(t, `<body><div class="searchpage">${row(blocked)}${row('/editorial/')}</div></body>`, 'firenzedintorni.it');
  const url = x.w.document.querySelector('p:not(.mb-0)'); const parent = url.parentElement;
  assert.equal(parent.querySelectorAll(mark).length, 0);
  url.remove(); await x.flush(); assert.equal(parent.querySelectorAll(mark).length, 0);
  parent.insertBefore(url, parent.querySelector('hr')); await x.flush(); assert.equal(parent.querySelectorAll(mark).length, 0);
  url.querySelector('a').remove(); await x.flush(); assert.equal(parent.querySelectorAll(mark).length, 0);
  url.innerHTML = `<a href="${blocked}">URL</a>`; await x.flush(); assert.equal(parent.querySelectorAll(mark).length, 0);
  assert.equal(parent.querySelectorAll('h2')[1].matches(mark), false);
});
test('Web Lock contention defers a retry which adopts another tab cache without fetching', async t => {
  const timers = []; let lockCalls = 0;
  const x = await setup(t, '<body class="home">' + card('/new/') + '</body>', undefined, { prepare(w) {
    Object.defineProperty(w.navigator, 'locks', { value: { request: async (key, options, callback) => { lockCalls++; return callback(null); } } });
    const timer = w.setTimeout.bind(w); w.setTimeout = (fn, delay, ...args) => { if (delay >= 20000 && delay < 30000) timers.push(fn); return timer(fn, delay, ...args); };
  } });
  await x.api.refresh(); assert.equal(lockCalls, 1); assert.equal(timers.length, 1); assert.equal(x.network(), 0);
  const paths = [blocked, '/new/']; x.store.set('article-cards-v1:gazzettinodelchianti.it', { data: { ...x.data, paths, snapshot: digest(paths) }, checkedAt: Date.now() });
  x.w.requestIdleCallback = fn => { fn(); return 1; }; timers[0]();
  for (let i = 0; x.api.paths().size !== 2 && i < 50; i++) await new Promise(r => setTimeout(r, 5));
  await x.flush(); assert.equal(x.api.paths().size, 2); assert.ok(x.w.document.querySelector(mark)); assert.equal(x.network(), 0);
});
test('lease contention defers cache adoption rather than stranding the losing tab', async t => {
  const timers = [];
  const x = await setup(t, '<body></body>', undefined, { prepare(w) {
    const timer = w.setTimeout.bind(w); w.setTimeout = (fn, delay, ...args) => { if (delay >= 20000 && delay < 30000) timers.push(fn); return timer(fn, delay, ...args); };
  } });
  x.store.set('article-cards-v1:gazzettinodelchianti.it:lease', { token: 'other', until: Date.now() + 60000 });
  await x.api.refresh(); assert.equal(timers.length, 1); assert.equal(x.network(), 0);
});
test('only an exact client-reviewed transition can remove paths, including an empty registry', async t => {
  const host = 'gazzettinodelchianti.it'; const old = { schema: 1, host, paths: [blocked], snapshot: digest([blocked]) };
  const next = { ...old, paths: [], snapshot: digest([]) }; const key = 'article-cards-v1:' + host;
  for (const pin of [null, { host, fromSnapshot: old.snapshot, toSnapshot: next.snapshot, reviewId: '' }, { host: 'quiantella.it', fromSnapshot: old.snapshot, toSnapshot: next.snapshot, reviewId: 'invented-review' }, { host, fromSnapshot: old.snapshot, toSnapshot: next.snapshot, reviewId: 'invented-review' }]) {
    const code = source.replace("version: '1.0.3'", "version: '99'").replace('reviewedRemovals: []', 'reviewedRemovals: ' + JSON.stringify(pin ? [pin] : []));
    const x = await setup(t, '<body class="home">' + card() + '</body>', host, { source: code, request: o => o.onload({ status: 200, responseText: JSON.stringify(next) }) });
    x.store.set(key, { data: old, checkedAt: 1 }); await x.api.refresh(); await x.flush();
    const accepted = pin?.reviewId && pin.host === host;
    assert.equal(x.api.paths().size, accepted ? 0 : 1);
    assert.equal(x.w.document.querySelectorAll(mark).length, accepted ? 0 : 1);
    assert.deepEqual(Array.from(x.store.get(key).data.paths), accepted ? [] : [blocked]);
  }
});
test('manager progress size abort and post-load fallback both preserve last-good paths', async t => {
  let aborts = 0; let reply;
  const x = await setup(t, '<body class="home">' + card() + '</body>', undefined, { abort: () => aborts++, request: o => queueMicrotask(() => reply(o)) });
  const key = 'article-cards-v1:gazzettinodelchianti.it'; x.store.set(key, { data: x.data, checkedAt: 1 });
  reply = o => o.onprogress({ loaded: 2_000_001 }); await x.api.refresh(); assert.equal(aborts, 1);
  x.store.set(key + ':attempt', 0); reply = o => o.onload({ status: 200, responseText: ' '.repeat(2_000_001) }); await x.api.refresh();
  assert.equal(x.api.paths().size, 1); assert.ok(x.w.document.querySelector(mark));
});
test('registry validation rejects malformed paths, duplicate entries and wrong host', async t => {
  const x = await setup(t, '<body class="home">' + card() + '</body>');
  for (const data of [null, { ...x.data, host: 'evil.invalid' }, { ...x.data, paths: [blocked, blocked] }, { ...x.data, paths: ['//evil.invalid/'] }, { ...x.data, paths: [blocked + '?q=1'] }]) assert.equal(x.api.validateRegistry(data), null);
  x.api.replaceRegistry({ snapshot: 'b'.repeat(64) }, new Set()); await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
});
test('failed refresh and radical shrink preserve last-good registry; successful refresh is deferred and daily cached', async t => {
  let reply;
  const x = await setup(t, '<body class="home">' + card() + '</body>', undefined, { request: options => options.onload(reply) });
  const key = 'article-cards-v1:gazzettinodelchianti.it'; x.store.set(key, { data: x.data, checkedAt: 1 });
  reply = { status: 500, responseText: '' }; await x.api.refresh(); assert.equal(x.network(), 1); assert.ok(x.w.document.querySelector(mark));
  x.store.set(key + ':attempt', 0); reply = { status: 200, responseText: JSON.stringify({ ...x.data, snapshot: digest([]), paths: [] }) }; await x.api.refresh(); assert.ok(x.w.document.querySelector(mark));
  x.store.set(key + ':attempt', 0); reply = { status: 200, responseText: JSON.stringify({ ...x.data, snapshot: digest([blocked, '/new/']), paths: [blocked, '/new/'] }) }; await x.api.refresh();
  assert.equal(x.api.paths().size, 2); const count = x.network(); await x.api.refresh(); assert.equal(x.network(), count);
});
test('incremental mutation overhead stays local after 1000 cards; bounded overflow handles 5000 cards', async t => {
  const x = await setup(t, '<body class="home">' + Array.from({ length: 1000 }, (_, i) => card('/editorial-' + i + '/')).join('') + '</body>'); const before = x.api.metrics.nodes;
  for (let i = 0; i < 100; i++) { x.w.document.body.append(x.w.document.createElement('span')); await x.flush(); }
  const incremental = x.api.metrics.nodes - before; assert.ok(incremental <= 250); assert.equal(x.network(), 0);
  const fragment = x.w.document.createDocumentFragment();
  for (let i = 0; i < 5000; i++) { const div = x.w.document.createElement('div'); div.innerHTML = card(i % 100 === 0 ? blocked : '/later-' + i + '/'); fragment.append(div.firstElementChild); }
  x.w.document.body.append(fragment); await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 50); assert.ok(x.api.metrics.overflows > 0);
  console.log('Synthetic DOM measurement:', JSON.stringify({ initialNodes: before, incrementalNodes: incremental, ...x.api.metrics }));
});
test('two same-site tabs elect one best-effort fallback refresher', async t => {
  const host = 'gazzettinodelchianti.it'; const data = { schema: 1, host, paths: [blocked], snapshot: digest([blocked]) };
  const store = new Map([['article-cards-v1:' + host, { data, checkedAt: 1 }]]);
  const request = options => options.onload({ status: 200, responseText: JSON.stringify(data) });
  const a = await setup(t, '<body></body>', host, { store, request }); const b = await setup(t, '<body></body>', host, { store, request });
  await Promise.all([a.api.refresh(), b.api.refresh()]); assert.equal(a.network() + b.network(), 1);
});
test('removed cards release ownership; irrelevant body classes stay local; hidden tabs and bfcache resume safely', async t => {
  const x = await setup(t, '<body class="home">' + card() + '</body>'); const c = x.w.document.body.firstElementChild;
  assert.equal(x.api.owned(), 1); c.remove(); await x.flush(); assert.equal(x.api.owned(), 0); assert.ok(!c.matches(mark));
  x.w.document.body.append(c); await x.flush(); assert.equal(x.api.owned(), 1);
  const before = x.api.metrics.nodes; x.w.document.body.classList.add('dark-mode'); await x.flush(); assert.ok(x.api.metrics.nodes - before <= 2);
  Object.defineProperty(x.w.document, 'hidden', { configurable: true, value: true }); c.querySelector('a').href = '/editorial/';
  await new Promise(r => setImmediate(r)); const paused = x.api.metrics.nodes; x.api.flush(); assert.equal(x.api.metrics.nodes, paused);
  Object.defineProperty(x.w.document, 'hidden', { configurable: true, value: false }); x.w.document.dispatchEvent(new x.w.Event('visibilitychange')); await x.flush(); assert.ok(!c.matches(mark));
  x.w.dispatchEvent(new x.w.PageTransitionEvent('pagehide', { persisted: true })); c.querySelector('a').href = blocked;
  x.w.dispatchEvent(new x.w.PageTransitionEvent('pageshow', { persisted: true })); await x.flush(); assert.ok(c.matches(mark));
});
test('independent watchdog aborts an ignored manager timeout; redirects preserve last-good data', async t => {
  let aborts = 0; let reply;
  const x = await setup(t, '<body class="home">' + card() + '</body>', undefined, { abort: () => aborts++, request: options => {
    assert.equal(options.anonymous, true); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Referer, '');
    assert.ok(options.url.endsWith('/gazzettinodelchianti.it.json')); assert.ok(!options.url.includes(blocked));
    if (reply) options.onload(reply);
  } });
  const key = 'article-cards-v1:gazzettinodelchianti.it'; x.store.set(key, { data: x.data, checkedAt: 1 });
  const timer = x.w.setTimeout.bind(x.w); x.w.setTimeout = (fn, delay, ...args) => timer(fn, delay === 15000 ? 0 : delay, ...args);
  await x.api.refresh(); assert.equal(aborts, 1); assert.ok(x.w.document.querySelector(mark));
  x.store.set(key + ':attempt', 0); reply = { status: 200, finalUrl: 'https://evil.invalid/registry.json', responseText: JSON.stringify({ ...x.data, paths: [blocked, '/new/'], snapshot: digest([blocked, '/new/']) }) };
  await x.api.refresh(); assert.equal(x.api.paths().size, 1); assert.ok(x.w.document.querySelector(mark));
});

// Converted from the preserved Astra scratch reproductions; editorial controls
// assert restoration, not merely that a selector still matches its own fixture.
test('unsupported Firenze fragments stay visible through connected moves and separators', async t => {
  const x = await setup(t, `<body><main class="searchpage">${row(blocked)}${row('/editorial/')}</main><section id="destination"></section></body>`, 'firenzedintorni.it');
  const heading = x.w.document.querySelector('h2'); const url = heading.nextElementSibling.nextElementSibling;
  const separator = x.w.document.createElement('div'); heading.after(separator); await x.flush();
  assert.equal(x.api.parts(heading), null); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  separator.remove(); await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  x.w.document.querySelector('#destination').append(url); await x.flush();
  assert.equal(x.w.document.querySelectorAll(mark).length, 0); assert.ok(!url.matches(mark));
  heading.nextElementSibling.after(url); await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  assert.ok(!x.w.document.querySelectorAll('h2')[1].matches(mark));
});
test('enclosing Firenze hero href changes invalidate its dependent card both ways', async t => {
  const x = await setup(t, `<body><a href="${blocked}"><article class="thumb-info"><img></article></a><a href="/editorial/"><article class="thumb-info"><img></article></a></body>`, 'firenzedintorni.it');
  const a = x.w.document.querySelector('a'); const article = a.firstElementChild;
  assert.ok(article.matches(mark)); a.href = '/editorial/'; await x.flush(); assert.ok(!article.matches(mark));
  a.href = blocked; await x.flush(); assert.ok(article.matches(mark));
  a.href = 'https://editorial.invalid/'; await x.flush(); assert.ok(!article.matches(mark));
  a.href = blocked; await x.flush(); assert.ok(article.matches(mark));
  assert.ok(!x.w.document.querySelectorAll('article')[1].matches(mark));
});
test('document base changes restore cards without changing registry path validation', async t => {
  const x = await setup(t, `<head><base href="https://editorial.invalid/"></head><body class="home">${card()}</body>`);
  assert.equal(x.w.document.querySelectorAll(mark).length, 0); assert.ok(x.api.validateRegistry(x.data));
  const base = x.w.document.querySelector('base'); base.href = 'https://gazzettinodelchianti.it/'; await x.flush(); assert.ok(x.w.document.querySelector(mark));
  base.href = 'https://editorial.invalid/'; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
});
test('one sidebar anchor owns multiple images without releasing another image marker', async t => {
  const x = await setup(t, `<body><aside><a href="${blocked}"><img><img></a></aside></body>`, 'firenzedintorni.it');
  const a = x.w.document.querySelector('a'); assert.ok(a.matches(mark)); assert.equal(x.api.owned(), 1);
  a.firstElementChild.remove(); await x.flush(); assert.ok(a.matches(mark));
  a.firstElementChild.remove(); await x.flush(); assert.ok(!a.matches(mark)); assert.equal(x.api.owned(), 0);
});
test('unsupported multiple title/URL links and protected sibling fragments fail open', async t => {
  const x = await setup(t, `<body><main class="searchpage">${row(blocked)}${row('/editorial/')}</main></body>`, 'firenzedintorni.it');
  const heading = x.w.document.querySelector('h2'); const url = heading.nextElementSibling.nextElementSibling;
  url.innerHTML += '<a href="/editorial/">Editorial neighbor</a>'; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  url.lastElementChild.remove(); url.className = 'post-content'; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  url.className = ''; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
});
test('formatted and rearranged Firenze search fragments remain unsupported and visible', async t => {
  const html = row(blocked).replace('</h2>', '</h2>\n<!--lazy-slot-->\n');
  const x = await setup(t, `<body><main class="searchpage">${html}${row('/editorial/')}</main><section></section></body>`, 'firenzedintorni.it');
  const h = x.w.document.querySelector('h2'); const comment = h.nextSibling.nextSibling;
  assert.equal(comment.nodeType, 8); comment.before(x.w.document.createElement('div')); await x.flush();
  assert.equal(x.api.parts(h), null); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  const p = x.w.document.querySelector('p'); p.before(x.w.document.createTextNode('\n')); p.before(x.w.document.createElement('div')); await x.flush();
  x.w.document.querySelector('section').append(p); await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
  h.innerHTML += '<span><a href="/editorial/">Neighbor</a></span>'; await x.flush(); assert.equal(x.w.document.querySelectorAll(mark).length, 0);
});
test('mixed title, deeply nested editorial links and nested body containers restore whole cards', async t => {
  const x = await setup(t, '<body class="home">' + card() + card('/editorial/') + '</body>');
  const c = x.w.document.body.firstElementChild; const h = c.querySelector('h3');
  for (const html of ['<a href="/editorial/">Neighbor</a>', '<span><a href="/editorial/">Neighbor</a></span>', `<span><a href="${blocked}">Duplicate title</a></span>`]) {
    const span = x.w.document.createElement('span'); span.innerHTML = html; h.append(span); await x.flush(); assert.ok(!c.matches(mark));
    span.remove(); await x.flush(); assert.ok(c.matches(mark));
  }
  const deep = x.w.document.createElement('div'); deep.innerHTML = '<div>'.repeat(15) + '<span id="slot"></span>' + '</div>'.repeat(15); c.append(deep); await x.flush(); assert.ok(c.matches(mark));
  deep.querySelector('#slot').innerHTML = '<a href="/editorial/">Nested neighbor</a>'; await x.flush(); assert.ok(!c.matches(mark));
  deep.querySelector('a').href = blocked; await x.flush(); assert.ok(c.matches(mark));
  deep.className = 'entry-content'; await x.flush(); assert.ok(!c.matches(mark));
  deep.remove(); await x.flush(); assert.ok(c.matches(mark)); assert.ok(!x.w.document.body.children[1].matches(mark));
});
test('QA related ID removal and restoration revalidate descendants without visiting unrelated ID changes', async t => {
  const x = await setup(t, `<body class="single"><div id="jp-relatedposts"><div class="jp-relatedposts-items"><div class="jp-relatedposts-post"><h4 class="jp-relatedposts-post-title"><a class="jp-relatedposts-post-a" href="${blocked}">Title</a></h4></div></div></div><div id="unrelated"><span></span></div></body>`, 'quiantella.it');
  const scope = x.w.document.querySelector('#jp-relatedposts'); const c = x.w.document.querySelector('.jp-relatedposts-post'); assert.ok(c.matches(mark));
  scope.id = 'editorial-content'; await x.flush(); assert.equal(x.api.parts(c), null); assert.ok(!c.matches(mark));
  scope.id = 'jp-relatedposts'; await x.flush(); assert.ok(c.matches(mark));
  const before = x.api.metrics.nodes; x.w.document.querySelector('#unrelated').id = 'another'; await x.flush(); assert.ok(x.api.metrics.nodes - before <= 2);
});
test('reviewed pins require a direct old-to-current transition; intermediate pins alone hold old paths', async t => {
  const host = 'gazzettinodelchianti.it'; const data = paths => ({ schema: 1, host, paths, snapshot: digest(paths) });
  const old = data([blocked, '/keep/', '/remove/']); const middle = data(['/keep/', '/remove/']); const latest = data(['/keep/']);
  const pin = (from, to) => ({ host, fromSnapshot: from.snapshot, toSnapshot: to.snapshot, reviewId: 'invented-explicit-review' });
  for (const direct of [false, true]) {
    const pins = [pin(old, middle), pin(middle, latest), ...(direct ? [pin(old, latest)] : [])];
    const store = new Map([['article-cards-v1:' + host, { data: old, checkedAt: 1 }]]);
    const x = await setup(t, '<body class="home">' + card() + '</body>', host, { store, source: source.replace('reviewedRemovals: []', 'reviewedRemovals: ' + JSON.stringify(pins)), request: o => o.onload({ status: 200, responseText: JSON.stringify(latest) }) });
    await x.api.refresh(); await x.flush(); assert.equal(x.api.paths().size, direct ? 1 : 3); assert.equal(x.w.document.querySelectorAll(mark).length, direct ? 0 : 1);
  }
});
