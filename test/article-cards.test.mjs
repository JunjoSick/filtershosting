import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { classify, collect, registry, exactPath, build, check, load, discover, httpClient } from '../tools/article-cards.mjs';
import { DisclosureClassifier } from '../tools/article-classifier.mjs';
import { parseRSSDate } from '../tools/article-rss.mjs';
const repo = new URL('../', import.meta.url).pathname;
const disclosureMatrix = JSON.parse(await readFile(new URL('./fixtures/article-disclosure-matrix.json', import.meta.url), 'utf8'));
const response = (rows, pages = 1) => ({ text: JSON.stringify(rows), headers: new Headers({ 'x-wp-totalpages': String(pages) }) });
const record = (site = 'colli', url = '/invented-new/', html = '<p>Articolo ADV</p>') => ({ id: 1, link: (site === 'colli' ? 'https://daicollifiorentini.it' : 'https://www.quiantella.it') + url, date_gmt: '2026-10-02T10:00:00', modified_gmt: '2026-10-02T10:01:00', content: { rendered: html } });
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'article-cards-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(repo, 'article-cards'), path.join(root, 'article-cards'), { recursive: true });
  await cp(path.join(repo, 'fucksponsors.txt'), path.join(root, 'fucksponsors.txt'));
  await cp(path.join(repo, 'sponsored-article-cards.txt'), path.join(root, 'sponsored-article-cards.txt'));
  return root;
}
test('frozen baseline and unchanged build stay byte-stable', async t => {
  const root = await fixture(t); const s = await load(root); assert.equal(await build(root), 0); await check(root);
  assert.equal(Object.values(s.sites).reduce((sum, s) => sum + s.additions.length, 0), 0);
});
test('canonical paths retain encoding/slashes and reject aliases/query routes', () => {
  assert.equal(exactPath('colli', '/invented%20encoded/'), '/invented%20encoded/');
  for (const url of ['//evil.invalid/a/', 'https://www.daicollifiorentini.it/a/', '/a/?q=1', '/a/#part', '/', '/a"/']) assert.equal(exactPath('colli', url), null, url);
  assert.throws(() => registry('colli', ['/a/', '/a/']));
});
test('standalone and terminal BR disclosures, including short PRE, are accepted', () => {
  for (const html of ['<p>Text.</p><pre><strong>(CONTENUTO SPONSORIZZATO)</strong></pre>', '<p>Text<br><strong>CONTENUTO SPONSORIZZATO</strong></p>', '<p>Text<span><br>CONTENUTO SPONSORIZZATO</span></p>', '<p>CONTENUTO SPONSORIZZATO</p><p>Short attribution</p>']) assert.equal(classify('gdc', html), 'block', html);
  assert.equal(classify('quiantella', '<p>Informazione promozionale</p>'), 'block');
  for (const label of ['Articolo ADV', 'Contenuto adv', '#adv']) assert.equal(classify('colli', `<p>${label}</p>`), 'block');
});
test('incidental, hidden, code, quote, widget, nonterminal, and ancestor-tail examples fail open', () => {
  for (const html of ['<p>Discussing CONTENUTO SPONSORIZZATO.</p>', '<script>CONTENUTO SPONSORIZZATO</script>', '<style>CONTENUTO SPONSORIZZATO</style>', '<template><p>CONTENUTO SPONSORIZZATO</p></template>', '<pre><code>CONTENUTO SPONSORIZZATO</code></pre>', '<pre>Example: CONTENUTO SPONSORIZZATO</pre>', '<aside><p>CONTENUTO SPONSORIZZATO</p></aside>', '<blockquote><p>CONTENUTO SPONSORIZZATO</p></blockquote>', '<p hidden>CONTENUTO SPONSORIZZATO</p>', '<div style="display: none"><p>CONTENUTO SPONSORIZZATO</p></div>', '<div class="embedded-widget"><p>CONTENUTO SPONSORIZZATO</p></div>', '<p>Text<br>CONTENUTO SPONSORIZZATO<br>More text</p>', '<section><div><pre>CONTENUTO SPONSORIZZATO</pre></div></section><p>' + 'Long editorial. '.repeat(60) + '</p>']) assert.equal(classify('gdc', html), 'review', html);
  for (const label of ['INFORMAZIONE PUBBLICITARIA', 'Contenuto promozionale in collaborazione con Invented Brand']) assert.equal(classify('gdc', `<p>${label}</p>`), 'review');
  assert.equal(classify('firenze', '<p>Sponsored</p>'), 'review');
});
test('WordPress validates GMT ordering, headers, missing bodies and bounded overlap', async () => {
  const good = await collect('colli', { get: async () => response([record()]), now: Date.parse('2026-10-02T12:00Z') }); assert.equal(good.complete, true);
  for (const rows of [[{ ...record(), modified_gmt: '' }], [{ ...record(), content: null }], [record(), { ...record(), modified_gmt: '2026-10-02T10:02:00' }]]) await assert.rejects(collect('colli', { get: async () => response(rows) }));
  await assert.rejects(collect('colli', { get: async () => ({ text: '[]', headers: new Headers() }) }));
  let calls = 0; const limited = await collect('colli', { get: async () => { calls++; return response([record()], 10); }, now: Date.parse('2026-10-02T12:00Z') });
  assert.equal(calls, 4); assert.equal(limited.complete, false);
});
test('RSS parses article-local CDATA and publication dates without article fetches', async () => {
  let calls = 0;
  const batch = await collect('gdc', { get: async () => { calls++; return { text: '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><link>https://www.gazzettinodelchianti.it/invented/</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[<p>CONTENUTO SPONSORIZZATO</p>]]></content:encoded></item></channel></rss>' }; }, now: Date.parse('2026-10-02T12:00Z') });
  assert.equal(calls, 2); assert.equal(batch.complete, true); assert.equal(classify('gdc', batch.records[0].html), 'block');
});
test('partial site failure retains paths; changed and repeated inputs have deterministic outputs', async t => {
  const root = await fixture(t); const get = async u => { if (u.startsWith('https://daicollifiorentini.it')) return response([record(), { ...record('colli', '/historic-keep/'), date_gmt: '2020-01-01T00:00:00' }, record('colli', '/ambiguous/', '<p>ordinary editorial</p>')]); throw new Error('invented offline response'); };
  const report = await discover(root, { get, now: Date.parse('2026-10-02T12:00Z'), log: () => {} });
  assert.equal(report.gdc.status, 'failed'); assert.equal(report.colli.added, 1); assert.equal(report.colli.review.length, 2);
  const state = await load(root); assert.deepEqual(state.sites.colli.additions, ['/invented-new/']);
  await check(root); const before = await readFile(path.join(root, 'sponsored-article-cards.txt'));
  assert.equal((await discover(root, { get, now: Date.parse('2026-10-02T12:00Z'), log: () => {} })).colli.added, 0);
  assert.deepEqual(await readFile(path.join(root, 'sponsored-article-cards.txt')), before);
  await discover(root, { get: async () => { throw new Error('offline'); }, log: () => {} });
  assert.deepEqual(await readFile(path.join(root, 'sponsored-article-cards.txt')), before);
});
test('a truncated overlap discards even plausible additions', async t => {
  const root = await fixture(t);
  await discover(root, { get: async () => response([record()], 100), now: Date.parse('2026-10-02T12:00Z'), log: () => {} });
  assert.equal(await build(root), 0); assert.deepEqual((await load(root)).sites.colli.additions, []);
});
test('HTTP retries are bounded, denied/rate-limit responses are terminal, redirect and size fail closed', async () => {
  let calls = 0; let waits = 0;
  const client = httpClient({ fetcher: async () => { calls++; throw new Error('timeout'); }, wait: async () => { waits++; } });
  await assert.rejects(client('https://example.invalid')); assert.equal(calls, 2); assert.equal(waits, 1);
  for (const status of [401,403,404,429]) { calls = 0; await assert.rejects(httpClient({ fetcher: async () => { calls++; return new Response('', { status }); } })('https://example.invalid')); assert.equal(calls, 1); }
  calls = 0; await assert.rejects(httpClient({ fetcher: async () => { calls++; return new Response('x'.repeat(4_000_001)); } })('https://example.invalid')); assert.equal(calls, 1);
});
test('real stalled response bodies respect request timeout and the global discovery deadline', async t => {
  let calls = 0;
  const server = createServer((req, res) => { calls++; res.writeHead(200); res.write('partial'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/invented`;
  await assert.rejects(httpClient({ requestTimeoutMs: 100, wait: async () => {} })(url)); assert.equal(calls, 2);
  calls = 0; await assert.rejects(httpClient({ requestTimeoutMs: 10000, signal: AbortSignal.timeout(100), wait: async () => {} })(url)); assert.equal(calls, 1);
});
const rss = html => `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><link>https://www.gazzettinodelchianti.it/invented-safe/</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[${html}]]></content:encoded></item></channel></rss>`;
test('hidden and template disclosure examples cannot become persistent additions', async t => {
  const bodies = ['<details><summary>Example</summary><p>CONTENUTO SPONSORIZZATO</p></details>', '<p style="display:/**/none">CONTENUTO SPONSORIZZATO</p>', '<p aria-hidden="TRUE">CONTENUTO SPONSORIZZATO</p>', '<div inert><p>CONTENUTO SPONSORIZZATO</p></div>', '<p style="visibility:var(--visibility)">CONTENUTO SPONSORIZZATO</p>', '<div class="sponsor-box"><p>CONTENUTO SPONSORIZZATO</p></div>'];
  for (const html of bodies) assert.equal(classify('gdc', html), 'review');
  const root = await fixture(t);
  const report = await discover(root, { now: Date.parse('2026-10-03T12:00Z'), log: () => {}, get: async u => { if (u.startsWith('https://www.gazzettinodelchianti.it')) return { text: rss(bodies[0]) }; throw Error('invented offline'); } });
  assert.equal(report.gdc.added, 0); assert.equal(report.gdc.review.length, 1); assert.deepEqual((await load(root)).sites.gdc.additions, []);
  assert.equal(classify('gdc', '<details open><p>CONTENUTO SPONSORIZZATO</p></details>'), 'review');
});
test('unsupported disclosure structure and any styled evidence remain review-only through the real worker', async t => {
  const label = '<p>CONTENUTO SPONSORIZZATO</p>';
  const bodies = [
    ...['display:none ! important', 'visibility:hidden ! important', 'display:/**/none', 'display:none !\tIMPORTANT', 'visibility:/**/hidden ! /**/important', 'opacity:0', 'display:block', 'color:black'].map(style => `<p style="${style}">CONTENUTO SPONSORIZZATO</p>`),
    ...['canvas', 'audio', 'video', 'noscript', 'iframe', 'select', 'textarea', 'object', 'svg', 'math', 'x-invented', 'details'].map(tag => `<${tag}>${label}</${tag}>`),
    `<div class="unknown-style">${label}</div>`, `<div id="unknown-style">${label}</div>`, `<p><span style="display:none ! important">CONTENUTO SPONSORIZZATO</span></p>`,
    label + '<x-invented>' + 'Unknown later editorial. '.repeat(60) + '</x-invented>',
    ...['HIDDEN', 'STYLE="display:none"', 'StYlE="visibility:hidden"', 'popover', 'popover="manual"', 'data-unknown="value"', 'aria-hidden="false"'].map(attributes => `<p ${attributes}>CONTENUTO SPONSORIZZATO</p>`),
    '<style>p{display:none}</style>' + label, '<script>document.querySelector("p").hidden=true</script>' + label,
  ];
  for (const html of bodies) assert.equal(classify('gdc', html), 'review', html);
  const root = await fixture(t);
  const text = '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>' + bodies.map((html, i) => `<item><link>https://www.gazzettinodelchianti.it/invented-hidden-${i}/</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[${html}]]></content:encoded></item>`).join('') + '<item><link>https://www.gazzettinodelchianti.it/invented-overlap-end/</link><pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate><content:encoded>Old editorial</content:encoded></item></channel></rss>';
  const report = await discover(root, { now: Date.parse('2026-10-03T12:00Z'), log: () => {}, get: async u => { if (u.startsWith('https://www.gazzettinodelchianti.it')) return { text }; throw Error('invented offline'); } });
  assert.equal(report.gdc.status, 'complete'); assert.equal(report.gdc.added, 0); assert.equal(report.gdc.review.length, bodies.length + 1); assert.deepEqual((await load(root)).sites.gdc.additions, []);
  assert.equal(classify('gdc', '<p>Editorial.</p><p><strong>CONTENUTO SPONSORIZZATO</strong></p>'), 'block');
});
test('48 realistic disclosure cases allow unrelated markup but retain strict label contexts', async t => {
  const classifier = new DisclosureClassifier(); t.after(() => classifier.close());
  assert.equal(disclosureMatrix.length, 48);
  const totals = { block: 0, review: 0 };
  for (const { site, name, html, expected } of disclosureMatrix) {
    assert.equal(classify(site, html), expected, `${site}: ${name}`);
    assert.equal((await classifier.classify(site, html)).decision, expected, `worker ${site}: ${name}`);
    totals[expected]++;
  }
  assert.deepEqual(totals, { block: 42, review: 6 });
  console.log('Disclosure matrix:', JSON.stringify({ cases: disclosureMatrix.length, ...totals }));
  // These two former blanket-veto fixtures are deliberately retained as
  // positives. Their earlier markup does not conceal the separate clean label.
  for (const html of ['<p><a href="/ordinary-link/">Editorial reference</a></p><p>CONTENUTO SPONSORIZZATO</p>', '<p><img src="invented.png"></p><p>CONTENUTO SPONSORIZZATO</p>']) {
    assert.equal((await classifier.classify('gdc', html)).decision, 'block');
  }
});
test('active hazards anywhere still veto otherwise clean terminal disclosure', () => {
  const label = '<p>CONTENUTO SPONSORIZZATO</p>';
  const hazards = [
    '<style>p{display:none}</style>', '<STYLE>p{display:none}</STYLE>',
    '<script>document.querySelector("p").hidden=true</script>', '<svg><style>p{display:none}</style></svg>',
    '<link rel="stylesheet" href="https://example.invalid/site.css">',
    '<img src="invented.png" OnErRoR="document.querySelector(\'p\').hidden=true">',
    '<a href="/ordinary/" ONCLICK="document.querySelector(\'p\').hidden=true">Ordinary link</a>',
    '<iframe srcdoc="&lt;script&gt;parent.document.querySelector(\'p\').hidden=true&lt;/script&gt;"></iframe>',
    '<object data="https://example.invalid/embed"></object>', '<embed src="https://example.invalid/embed">',
  ];
  for (const html of hazards) {
    assert.equal(classify('gdc', html + label), 'review', html);
    assert.equal(classify('gdc', label + html), 'review', html);
  }
});
test('unrelated markup cannot launder hidden evidence or ambiguous trailing context', () => {
  const ordinary = '<h2>Ordinary heading</h2><p class="intro"><a href="/reference/">Reference</a><img src="invented.png" alt="Photo"></p>';
  const label = '<p>CONTENUTO SPONSORIZZATO</p>';
  const bad = [
    '<p HIDDEN>CONTENUTO SPONSORIZZATO</p>', '<p popover>CONTENUTO SPONSORIZZATO</p>',
    '<p><span style="display:none">CONTENUTO SPONSORIZZATO</span></p>',
    `<div aria-hidden="true">${label}</div>`, `<section class="widget">${label}</section>`,
    `<blockquote>${label}</blockquote>`, `<template>${label}</template>`, `<canvas>${label}</canvas>`,
    '<pre><code>CONTENUTO SPONSORIZZATO</code></pre>', '<p><a href="/example/">CONTENUTO SPONSORIZZATO</a></p>',
    '<p><a href="/reference/">Reference</a><br>CONTENUTO SPONSORIZZATO</p>',
    label + '<p class="unknown">Short following context</p>', label + '<img src="invented.png">',
    label + '<aside>Short widget</aside>', label + '<div>' + 'Long editorial. '.repeat(60) + '</div>',
  ];
  for (const html of bad) assert.equal(classify('gdc', ordinary + html), 'review', html);
  assert.equal(classify('gdc', `<section><div>${ordinary}${label}</div></section>`), 'block');
  assert.equal(classify('gdc', ordinary + '<p hidden>Ordinary hidden text</p>' + label), 'block');
  assert.equal(classify('gdc', ordinary + '<p HIDDEN>CONTENUTO SPONSORIZZATO</p><p>Ordinary conclusion</p>'), 'review');
  assert.equal(classify('gdc', ordinary + label + '<p>Short attribution</p>'), 'block');
});
test('real daily discovery accepts the matrix rich bodies and repeats as a coherent no-op', async t => {
  const root = await fixture(t);
  const get = async url => {
    const site = url.startsWith('https://www.gazzettinodelchianti.it') ? 'gdc' : url.startsWith('https://www.quiantella.it') ? 'quiantella' : url.startsWith('https://daicollifiorentini.it') ? 'colli' : null;
    if (!site) throw Error('invented offline');
    const rows = disclosureMatrix.filter(row => row.site === site);
    if (site !== 'gdc') return response(rows.map(row => record(site, `/invented-matrix-${row.name}/`, row.html)));
    return { text: '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>' + rows.map(row => `<item><link>https://www.gazzettinodelchianti.it/invented-matrix-${row.name}/</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate><content:encoded><![CDATA[${row.html}]]></content:encoded></item>`).join('') + '<item><link>https://www.gazzettinodelchianti.it/invented-overlap-end/</link><pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate><content:encoded>Old editorial</content:encoded></item></channel></rss>' };
  };
  const options = { get, now: Date.parse('2026-10-03T12:00Z'), log: () => {} };
  const report = await discover(root, options);
  for (const site of ['gdc', 'quiantella', 'colli']) {
    assert.equal(report[site].added, 14); assert.equal(report[site].status, 'complete');
    assert.equal(report[site].review.length, site === 'gdc' ? 3 : 2);
  }
  assert.equal(report.firenze.status, 'failed'); await check(root);
  const repeated = await discover(root, options);
  for (const site of ['gdc', 'quiantella', 'colli']) assert.equal(repeated[site].added, 0);
  assert.equal(await build(root), 0); await check(root);
});
test('RSS requires supported UTC grammar, real calendar and agreeing weekday', async () => {
  const valid = 'Fri, 02 Oct 2026 10:00:00 GMT';
  assert.equal(parseRSSDate(valid), Date.parse('2026-10-02T10:00:00Z'));
  assert.equal(parseRSSDate(valid.replace('GMT', '+0000')), parseRSSDate(valid));
  const invalid = ['10/02/2026', '2026-10-02T00:30:00', '2026-10-02T00:30:00Z', 'Fri, 02 Oct 2026 10:00:00', valid.replace('GMT', '+0200'), valid.replace('GMT', 'CET'), valid.replace('Fri', 'Thu'), valid.replace('02 Oct', '32 Oct'), valid.replace('02 Oct', '29 Feb'), valid.replace('10:00:00', '24:00:00'), valid.replace('10:00:00', '10:60:00'), valid.replace('10:00:00', '10:00:60')];
  for (const value of invalid) {
    assert.throws(() => parseRSSDate(value), /RSS UTC date/, value);
    await assert.rejects(collect('gdc', { now: Date.parse('2026-10-03T12:00Z'), get: async () => ({ text: rss('<p>CONTENUTO SPONSORIZZATO</p>').replace(valid, value) }) }), /RSS UTC date/);
  }
});
test('ambiguous RSS date cannot create an addition and valid UTC cutoff boundaries stay exact', async t => {
  for (const [date, added, status] of [['10/02/2026', 0, 'failed'], ['Thu, 01 Oct 2026 23:59:59 GMT', 0, 'complete'], ['Fri, 02 Oct 2026 00:00:00 +0000', 1, 'complete']]) {
    const root = await fixture(t); const before = await readFile(path.join(root, 'article-cards/registries/gazzettinodelchianti.it.json'));
    const report = await discover(root, { now: Date.parse('2026-10-03T12:00Z'), log: () => {}, get: async u => { if (u.startsWith('https://www.gazzettinodelchianti.it')) return { text: rss('<p>CONTENUTO SPONSORIZZATO</p>').replace('Fri, 02 Oct 2026 10:00:00 GMT', date) }; throw Error('invented offline'); } });
    assert.equal(report.gdc.status, status); assert.equal(report.gdc.added || 0, added); assert.equal((await load(root)).sites.gdc.additions.length, added);
    if (!added) assert.deepEqual(await readFile(path.join(root, 'article-cards/registries/gazzettinodelchianti.it.json')), before);
  }
});
test('strict RSS rejects incomplete XML, stray channels, duplicate fields and declarations', async () => {
  const valid = rss('<p>CONTENUTO SPONSORIZZATO</p>');
  for (const text of [valid.replace('</channel></rss>', ''), valid + '<channel/>', valid.replace('</channel>', '<channel/></channel>'), valid.replace('<pubDate>', '<link>https://example.invalid/</link><pubDate>'), '<!DOCTYPE rss [<!ENTITY custom "x">]>' + valid, valid.replace('http://purl.org/rss/1.0/modules/content/', 'https://evil.invalid/')]) await assert.rejects(collect('gdc', { get: async () => ({ text }), now: Date.parse('2026-10-03T12:00Z') }));
  const alias = valid.replaceAll('content:encoded', 'c:encoded').replace('xmlns:content=', 'xmlns:c=');
  assert.equal((await collect('gdc', { get: async () => ({ text: alias }), now: Date.parse('2026-10-03T12:00Z') })).complete, true);
});
test('malformed RSS leaves GDC unchanged while complete Colli additions still reconcile', async t => {
  const root = await fixture(t); const before = await readFile(path.join(root, 'article-cards/registries/gazzettinodelchianti.it.json'));
  const report = await discover(root, { now: Date.parse('2026-10-03T12:00Z'), log: () => {}, get: async u => {
    if (u.startsWith('https://www.gazzettinodelchianti.it')) return { text: rss('<p>CONTENUTO SPONSORIZZATO</p>').replace('</channel></rss>', '') };
    if (u.startsWith('https://daicollifiorentini.it')) return response([record()]); throw Error('invented offline');
  } });
  assert.equal(report.gdc.status, 'failed'); assert.equal(report.colli.added, 1); assert.deepEqual(await readFile(path.join(root, 'article-cards/registries/gazzettinodelchianti.it.json')), before); await check(root);
});
test('global abort retains a previously complete site and discards an interrupted site', async t => {
  const root = await fixture(t); const controller = new AbortController();
  const report = await discover(root, { signal: controller.signal, now: Date.parse('2026-10-03T12:00Z'), log: () => {}, get: async u => {
    if (u.startsWith('https://www.gazzettinodelchianti.it')) return { text: rss('<p>CONTENUTO SPONSORIZZATO</p>') };
    controller.abort(Error('invented global deadline')); return response([record('quiantella', '/interrupted/', '<p>Informazione promozionale</p>')]);
  } });
  assert.equal(report.gdc.added, 1); assert.equal(report.quiantella.status, 'failed'); assert.deepEqual((await load(root)).sites.quiantella.additions, []); await check(root);
});
test('Firenze discovery bounds its review-only archive without classifying section membership', async () => {
  const link = '<article class="thumb-info"><a href="/invented-editorial/">Editorial</a></article>';
  const good = await collect('firenze', { get: async () => ({ text: link }) }); assert.equal(good.reviewOnly, true); assert.equal(good.records.length, 3);
  await assert.rejects(collect('firenze', { get: async () => ({ text: link.repeat(201) }) }));
});
test('overlength candidates do not poison otherwise valid generated registry', async t => {
  const root = await fixture(t); const long = '/' + 'x'.repeat(4096) + '/';
  assert.equal(exactPath('colli', long), null); assert.throws(() => registry('colli', [long]));
  const report = await discover(root, { now: Date.parse('2026-10-02T12:00Z'), log: () => {}, get: async u => { if (u.startsWith('https://daicollifiorentini.it')) return response([record('colli', long), record()]); throw Error('invented offline'); } });
  assert.equal(report.colli.invalidURLs, 1); assert.equal(report.colli.added, 1);
  const emitted = JSON.parse(await readFile(path.join(root, 'article-cards/registries/daicollifiorentini.it.json')));
  assert.ok(emitted.paths.every(p => p.length <= 4096)); assert.deepEqual((await load(root)).sites.colli.additions, ['/invented-new/']);
});
test('conflicting disclosure records and future or invalid publication dates stay visible', async t => {
  for (const date_gmt of ['2099-01-01T10:00:00', '2026-02-30T00:00:00', '2026-10-03T10:00:00']) await assert.rejects(collect('colli', { get: async () => response([{ ...record(), date_gmt }]), now: Date.parse('2026-10-03T12:00Z') }));
  const root = await fixture(t); const report = await discover(root, { now: Date.parse('2026-10-02T12:00Z'), log: () => {}, get: async u => { if (u.startsWith('https://daicollifiorentini.it')) return response([record(), record('colli', '/invented-new/', '<p>Editorial</p>')]); throw Error('invented offline'); } });
  assert.equal(report.colli.added, 0); assert.equal(report.colli.review[0].reason, 'conflicting-records');
});
test('classifier work is linear and excessive node/depth/work inputs fail open', () => {
  for (const n of [100, 500, 1000]) {
    const html = ('<p>CONTENUTO SPONSORIZZATO</p><p>' + 'editorial '.repeat(75) + '</p>').repeat(n); const metrics = {};
    const start = performance.now(); assert.equal(classify('gdc', html, { budgetMs: 2000, metrics }), 'review');
    assert.ok(!metrics.limited); assert.ok(metrics.operations < metrics.nodes * 5);
    console.log('Linear classifier measurement', JSON.stringify({ n, bytes: Buffer.byteLength(html), elapsedMs: performance.now() - start, ...metrics }));
  }
  for (const options of [{ maxNodes: 2 }, { maxDepth: 2 }, { budgetMs: 0 }]) {
    const metrics = {}; assert.equal(classify('gdc', '<div><p>CONTENUTO SPONSORIZZATO</p></div>', { ...options, metrics }), 'review'); assert.ok(metrics.limited);
  }
});
test('actual classifier worker is cancellable during parsing and recovers after timeout', async t => {
  const pool = new DisclosureClassifier(); t.after(() => pool.close());
  assert.equal((await pool.classify('gdc', '<p>CONTENUTO SPONSORIZZATO</p>')).decision, 'block');
  const heavy = '<p>x</p>'.repeat(200000); const start = performance.now();
  await assert.rejects(pool.classify('gdc', heavy, { signal: AbortSignal.timeout(10) })); assert.ok(performance.now() - start < 2000);
  assert.equal((await pool.classify('gdc', '<p>CONTENUTO SPONSORIZZATO</p>')).decision, 'block');
  pool.timeoutMs = 5; assert.equal((await pool.classify('gdc', heavy)).reason, 'classification-time-limit');
  pool.timeoutMs = 1000; assert.equal((await pool.classify('gdc', '<p>CONTENUTO SPONSORIZZATO</p>')).decision, 'block');
});
