import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../sources/userscripts/quiantella-adblocker.user.js', import.meta.url), 'utf8');
const filters = readFileSync(new URL('../sources/filters/fuckquiantella.txt', import.meta.url), 'utf8').split(/\r?\n/);
// Minimal synthetic DOM: removal changes siblings and subsequent observer passes.
function element(tagName, textContent = '', classes = []) {
  return { tagName, textContent, classes, children: [], classList: { contains: c => classes.includes(c) } };
}
function run(nodes) {
  const content = { children: nodes, querySelectorAll: s => nodes.filter(n => n.tagName.toLowerCase() === s) };
  function relink() {
    nodes.forEach((n, i) => {
      n.previousElementSibling = nodes[i - 1] ?? null;
      n.nextElementSibling = nodes[i + 1] ?? null;
      n.remove = () => { nodes.splice(nodes.indexOf(n), 1); relink(); };
    });
  }
  relink();
  let observer;
  const context = { document: { querySelector: () => content }, console: { log() {} },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
    setTimeout: fn => fn(), clearTimeout() {} };
  vm.runInNewContext(source, context);
  return { nodes, repeat: () => observer() };
}
const heading = () => element('H3', 'Appartamento in antica villa in vendita a Picille (Antella)');
const dash = () => element('P', '------------------------------');
const hr = () => element('HR', '', ['wp-block-separator']);
const gallery = () => element('DIV', '', ['wp-block-jetpack-slideshow']);
const copy = () => element('P', 'APPARTAMENTO CON GIARDINO E CAMERE. '.repeat(8));
const contact = (colon = true) => element('P', `Per informazioni${colon ? ':' : ''} Il Peruzzi Immobiliare 055 123 4567`);

test('complete Picille ad, hr edge and no-gallery variant remove only the ad', () => {
  for (const middle of [[gallery(), copy()], [hr(), gallery(), copy()], [copy()]]) {
    const before = element('P', 'Article before'); const after = element('P', 'Article after');
    const { nodes, repeat } = run([before, dash(), heading(), ...middle, contact(), after]);
    assert.deepEqual(nodes, [before, after]); repeat(); repeat(); assert.deepEqual(nodes, [before, after]);
  }
});
test('no-colon spaced-phone contact and no preceding separator are supported', () => {
  assert.equal(run([heading(), gallery(), copy(), contact(false)]).nodes.length, 0);
});
test('property headings plus provisional separators alone remain intact', () => {
  for (const nodes of [[dash(), heading()], [heading(), hr()], [dash(), heading(), hr()], [heading(), gallery(), copy()]]) {
    const original = [...nodes]; const result = run(nodes); assert.deepEqual(result.nodes, original);
    result.repeat(); assert.deepEqual(result.nodes, original);
  }
});
test('unrelated paragraph interrupts traversal even if a contact follows', () => {
  const nodes = [dash(), heading(), gallery(), element('P', 'Editorial text'), contact()];
  const original = [...nodes]; assert.deepEqual(run(nodes).nodes, original);
});
test('generic information contacts and ordinary Peruzzi/event mentions remain', () => {
  for (const text of ['Per informazioni: Comune di Bagno a Ripoli', 'Torneo di padel de Il Peruzzi Immobiliare', 'Il Peruzzi Immobiliare 0551234567']) {
    const nodes = [dash(), heading(), gallery(), element('P', text)];
    const original = [...nodes]; assert.deepEqual(run(nodes).nodes, original);
  }
});
test('unrelated initialized slideshow controls remain untouched', () => {
  const editorial = gallery(); editorial.children = [element('DIV', '1 / 3', ['wp-block-jetpack-slideshow_pagination', 'swiper-pagination-custom'])];
  const { nodes, repeat } = run([editorial, heading(), gallery(), copy(), contact()]);
  repeat(); assert.deepEqual(nodes, [editorial]); assert.equal(editorial.children[0].textContent, '1 / 3');
  assert.ok(!filters.includes('quiantella.it##.wp-block-jetpack-slideshow_pagination.swiper-pagination-custom'));
});

const assets = [
  ['2020/06/libri-e-giornali.jpg',39803], ['2020/05/QA_mollalosso.png',39210],
  ['2020/05/qa_rapid_foto_center.png',39337], ['2020/05/scm_def.jpg',38989],
  ['2020/05/QA_edicolandia-1.png',39285], ['2020/06/672x560.jpg',39990],
  ['2020/05/DI-TUTTO-UN-PO-1.jpg',39352], ['2020/06/QA_mARISA-3.jpg',39394],
  ['2020/06/image.png',39392], ['2020/06/banner-definitivo.jpg',40111],
  ['2020/06/scm_def.jpg',39758], ['2020/05/Merciai.png',39348],
  ['2020/07/Rettori.jpg',40510], ['2020/05/QA_mARISA-3.jpg',39331],
  ['2020/05/DI-TUTTO-UN-PO.jpg',39184], ['2020/05/QA_edicolandia.png',39217],
  ['2020/09/Rettori.jpg',41698], ['2020/09/QA_mollalosso.png',41726],
];
const network = filters.filter(l => l.startsWith('/^https?')).map(l => new RegExp(l.slice(1, l.lastIndexOf('/$'))));
const matches = url => network.some(r => r.test(url));
test('18 historical creatives support exact originals, numeric sizes, CDN and queries', () => {
  assert.equal(network.length, 18);
  for (const [path, id] of assets) {
    for (const host of ['www.quiantella.it', 'i0.wp.com/www.quiantella.it', 'i1.wp.com/www.quiantella.it', 'i2.wp.com/www.quiantella.it']) {
      for (const tail of [path, path.replace(/\.(jpg|png)$/, '-300x200.$1')]) {
        assert.ok(matches(`https://${host}/wp-content/uploads/${tail}?resize=300%2C200`), tail);
      }
    }
    assert.ok(filters.includes(`quiantella.it##img.wp-image-${id}`)); // also lazy src placeholders
    for (const sep of ['##','#?#']) assert.ok(filters.includes(`quiantella.it${sep}.entry-content figure:has(img.wp-image-${id})`));
  }
});
test('same basenames on other dates, unverified and event/public-health images remain', () => {
  for (const path of ['2021/06/image.png', '2020/05/scm_def-1.jpg', '2020/06/image-extra.png',
    '2020/06/image-300wide.png', '2020/06/Copia-di-locandina-gresb.jpg',
    '2020/05/96277528_10159773962410550_3897224741383045120_o.jpg', '2020/10/coronavirus.jpg']) {
    assert.ok(!matches(`https://www.quiantella.it/wp-content/uploads/${path}`), path);
  }
  assert.ok(!matches('https://unrelated.example/wp-content/uploads/2020/06/image.png'));
});
test('only exact gallery identities, with dual-client parent collapse', () => {
  for (const id of ['70921', '92038']) for (const sep of ['##', '#?#']) {
    assert.ok(filters.includes(`quiantella.it${sep}.entry-content .wp-block-jetpack-slideshow:has(img[data-id="${id}"])`));
  }
  assert.ok(!filters.some(l => /data-id\^=/.test(l)));
});
test('unanchored brand and global dashed-paragraph filters are absent', () => {
  assert.ok(!filters.some(l => /p:(?:has-text|contains)\(Il Peruzzi Immobiliare\)/.test(l)));
  assert.ok(!filters.some(l => /^quiantella.it.*p:(?:has-text|contains|-abp-contains)\(\/\^\[—–-\].*\$\/\)$/.test(l)));
});
