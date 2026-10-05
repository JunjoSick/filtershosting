import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';
import { DisclosureClassifier } from './article-classifier.mjs';
import { parseRSS } from './article-rss.mjs';
import { nativeRules } from './article-native-css.mjs';
export { classify } from './article-disclosure.mjs';

export const SITES = {
  gdc: 'https://www.gazzettinodelchianti.it',
  quiantella: 'https://www.quiantella.it',
  colli: 'https://daicollifiorentini.it',
  firenze: 'https://www.firenzedintorni.it',
};
export const BASELINE_COUNTS = { gdc: 1822, quiantella: 9, colli: 32, firenze: 5 };
const baselineHashes = { gdc: '861df8fdf7c06bc128f32c3e589889efa566e30a32e82b4a8e34ecd647e3baf0', quiantella: '815b55e4433231052c6d0cf0ffb2d84accb8a8f8345127a2c4308698503b6d5a', colli: 'c15ab6e6d8b9dd479ed5d6b43afabc9664ccc0230b37d25c6e76ac58236b9c92', firenze: 'fe707ee3b4237c117b9207df9c65c81943661374f45e4d64b6f5f2a6218bc7a0' };
const json = value => JSON.stringify(value) + '\n';
const hash = value => createHash('sha256').update(value).digest('hex');
const host = site => new URL(SITES[site]).hostname.replace(/^www\./, '');
export const CLASSIFICATION_CUTOFF = '2026-10-01T23:59:59Z';
const cutoff = Date.parse(CLASSIFICATION_CUTOFF);
// 17 sequential requests, each two 15s attempts plus a 1s retry wait.
export const DISCOVERY_BUDGET_MS = 540_000;
export const DISCOVERY_PROCESS_MS = 600_000;
export const MAX_PATH_LENGTH = 4096;
export const MAX_REGISTRY_LENGTH = 2_000_000;
export function exactPath(site, input) {
  try {
    if (typeof input !== 'string' || /[\u0000-\u0020"\\]/.test(input)) return null;
    const u = new URL(input, SITES[site]);
    if (u.origin !== SITES[site] || u.search || u.hash || u.username || u.password || u.pathname === '/') return null;
    if (u.pathname.length > MAX_PATH_LENGTH || /[\u0000-\u0020"\\]/.test(u.pathname)) return null;
    return u.pathname;
  } catch { return null; }
}
export function registry(site, paths) {
  if (!Array.isArray(paths) || paths.length > 50000 || new Set(paths).size !== paths.length || paths.some(p => exactPath(site, p) !== p)) throw new Error(`Invalid ${site} paths`);
  paths = [...paths].sort();
  const result = { schema: 1, host: host(site), snapshot: hash(json(paths)), paths };
  if (json(result).length > MAX_REGISTRY_LENGTH) throw new Error(`Oversized ${site} registry`);
  return result;
}

async function readJSON(root, name) { return JSON.parse(await readFile(path.join(root, name), 'utf8')); }
export async function load(root) {
  const state = await readJSON(root, 'article-cards/state.json');
  if (state.schema !== 1 || !state.sites || Object.keys(state.sites).sort().join() !== Object.keys(SITES).sort().join()) throw new Error('Invalid discovery state');
  for (const site of Object.keys(SITES)) {
    if (hash(await readFile(path.join(root, `article-cards/baseline/${site}.json`))) !== baselineHashes[site]) throw new Error(`Frozen ${site} baseline changed`);
    const baseline = await readJSON(root, `article-cards/baseline/${site}.json`);
    if (baseline.count !== BASELINE_COUNTS[site] || baseline.paths.length !== baseline.count) throw new Error('Baseline count changed');
    registry(site, baseline.paths);
    const additions = state.sites[site].additions;
    registry(site, additions);
    if (additions.some(p => baseline.paths.includes(p))) throw new Error('Duplicate baseline addition');
  }
  return state;
}
export async function outputs(root, state) {
  state ??= await load(root);
  const result = new Map();
  const registries = {};
  for (const site of Object.keys(SITES)) {
    const baseline = await readJSON(root, `article-cards/baseline/${site}.json`);
    const r = registry(site, [...baseline.paths, ...state.sites[site].additions]);
    registries[r.host] = r;
    result.set(`article-cards/registries/${r.host}.json`, json(r));
  }
  const lines = ['! Title: fucksponsors', '! Version: pending', '! Description: Articoli sponsorizzati e promozionali', '! Expires: 1 day', '! RAW: https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fucksponsors.txt', '! Requires native :has(): modern uBO or AdGuard. See docs/article-cards.md for client limits.', '! No procedural fallback rules or network blocking. Do not use with older ExtendedCss-only clients.', '! Exact canonical/root-relative hrefs only; mixed-link cards and wrapperless Firenze search rows stay visible.'];
  for (const [site, origin] of Object.entries(SITES)) {
    const r = registries[host(site)];
    lines.push(`! ${r.host}: ${r.paths.length} registered paths; snapshot ${r.snapshot}`, ...nativeRules(site, origin, r.paths));
  }
  lines[1] = '! Version: ' + hash([...lines.slice(0, 1), ...lines.slice(2)].join('\n') + '\n').slice(0, 16);
  result.set('fucksponsors.txt', lines.join('\n') + '\n');
  // Preserve the draft URL as a generated compatibility alias.
  const legacy = lines.map(line => line.replace('main/fucksponsors.txt', 'main/sponsored-article-cards.txt'));
  legacy[1] = '! Version: ' + hash([...legacy.slice(0, 1), ...legacy.slice(2)].join('\n') + '\n').slice(0, 16);
  result.set('sponsored-article-cards.txt', legacy.join('\n') + '\n');
  return result;
}
async function atomicWrite(root, name, content) {
  const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true });
  try { if (await readFile(file, 'utf8') === content) return false; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = file + `.tmp-${process.pid}`;
  await writeFile(temp, content, { flag: 'wx' }); await rename(temp, file); return true;
}
export async function build(root, state) {
  let changed = 0;
  for (const [name, content] of await outputs(root, state)) changed += await atomicWrite(root, name, content);
  return changed;
}
export async function check(root) {
  for (const [name, expected] of await outputs(root)) if (await readFile(path.join(root, name), 'utf8') !== expected) throw new Error(`Stale ${name}`);
}

// Bounds are deliberately fixed. Coverage gaps are visible; never jump to a
// full census, retry denied APIs, or remove entries after a partial response.
export async function collect(site, { get, now = Date.now(), signal }) {
  const records = [];
  if (site === 'quiantella' || site === 'colli') {
    let prior = Infinity;
    for (let page = 1; page <= 4; page++) {
      const u = new URL('/wp-json/wp/v2/posts', SITES[site]);
      u.search = new URLSearchParams({ per_page: '100', orderby: 'modified', order: 'desc', page: String(page), _fields: 'id,link,date_gmt,modified_gmt,content' });
      const response = await get(u.href); const rows = JSON.parse(response.text);
      const pages = Number(response.headers.get('x-wp-totalpages'));
      if (!Array.isArray(rows) || !Number.isInteger(pages) || pages < page || rows.length > 100) throw new Error('Invalid WP page/headers');
      for (const r of rows) {
        const gmt = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value) ? Date.parse(value + 'Z') : NaN;
        const modified = gmt(r.modified_gmt); const published = gmt(r.date_gmt);
        if (!Number.isFinite(modified) || !Number.isFinite(published) || new Date(modified).toISOString().slice(0, 19) !== r.modified_gmt || new Date(published).toISOString().slice(0, 19) !== r.date_gmt || modified > prior || modified > now + 300000 || published > now + 300000 || published > modified + 300000 || !r.content || typeof r.content.rendered !== 'string') throw new Error('Unverified WP GMT ordering/body');
        prior = modified;
        records.push({ url: r.link, published, html: r.content.protected ? '' : r.content.rendered });
      }
      if (page === pages || prior < now - 7 * 86400000) return { records, complete: true };
    }
    return { records, complete: false };
  }
  if (site === 'gdc') {
    for (const query of ['CONTENUTO SPONSORIZZATO', 'SPONSORIZZATO -CONTENUTO']) {
      let ended = false;
      for (let page = 1; page <= 3; page++) {
        const u = new URL('/', SITES.gdc); u.search = new URLSearchParams({ s: query, feed: 'rss2', paged: String(page) });
        const response = await get(u.href);
        const items = await parseRSS(response.text, { signal });
        let oldest = Infinity;
        for (const item of items) {
          const { published } = item;
          if (!Number.isFinite(published) || published > now + 300000) throw new Error('Missing RSS date/body');
          oldest = Math.min(oldest, published);
          records.push(item);
        }
        if (oldest < now - 7 * 86400000 || items.length < 10) { ended = true; break; }
      }
      if (!ended) return { records, complete: false };
    }
    return { records, complete: true };
  }
  // Firenze has no verified modification/date API. Discover bounded cards for
  // review only; do not infer sponsored status from an economy section/title.
  for (let page = 1; page <= 3; page++) {
    const response = await get(SITES.firenze + `/it/sezione/19/economia-e-lavoro/pag-${page}.html`);
    const { document } = parseHTML(response.text);
    const links = [...document.querySelectorAll('article.thumb-info a[href],a[href] > article.thumb-info')];
    if (!links.length || links.length > 200) throw new Error('Unrecognized/unbounded Firenze archive');
    for (const n of links) {
      const a = n.matches('a') ? n : n.parentElement;
      records.push({ url: a.getAttribute('href'), published: NaN, html: '' });
    }
  }
  return { records, complete: true, reviewOnly: true };
}

export function httpClient({ fetcher = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), signal, requestTimeoutMs = 15000 } = {}) {
  return async url => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        signal?.throwIfAborted();
        const requestSignal = AbortSignal.any([AbortSignal.timeout(requestTimeoutMs), ...(signal ? [signal] : [])]);
        const response = await fetcher(url, { redirect: 'error', credentials: 'omit', signal: requestSignal, headers: { 'User-Agent': 'filtershosting-article-cards/1.0 (bounded daily discovery)' } });
        if ([401,403,404,429].includes(response.status)) throw Object.assign(new Error(`HTTP ${response.status}`), { terminal: true });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let text = ''; const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0;
        try { for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 4_000_000) throw Object.assign(new Error('Response too large'), { terminal: true }); text += decoder.decode(value, { stream: true }); } }
        finally { await reader.cancel(); }
        text += decoder.decode(); return { text, headers: response.headers };
      } catch (error) { if (signal?.aborted || error.terminal || attempt === 1) throw error; await wait(1000); }
    }
  };
}
export async function discover(root, { get, now = Date.now(), log = console.log, signal = AbortSignal.timeout(DISCOVERY_BUDGET_MS) } = {}) {
  get ??= httpClient({ signal });
  const state = await load(root); const report = {};
  const classifier = new DisclosureClassifier();
  try { for (const site of Object.keys(SITES)) {
    try {
      signal.throwIfAborted();
      const batch = await collect(site, { get, now, signal });
      const baseline = await readJSON(root, `article-cards/baseline/${site}.json`);
      const existing = new Set([...baseline.paths, ...state.sites[site].additions]);
      const adds = new Set(state.sites[site].additions); const review = []; let invalidURLs = 0;
      let registryLength = json(registry(site, [...baseline.paths, ...adds])).length;
      let registryCount = baseline.paths.length + adds.size;
      const unique = new Map(); const conflicts = new Set();
      for (const r of batch.records) {
        const p = exactPath(site, r.url);
        if (!p) { invalidURLs++; continue; }
        const old = unique.get(p);
        if (old && (old.published !== r.published || old.html !== r.html)) conflicts.add(p);
        else unique.set(p, r);
      }
      // A truncated overlap is not treated as a completed update. Keep the
      // committed state intact, even when a prefix contains plausible labels.
      if (batch.complete) for (const [p, r] of unique) {
        signal.throwIfAborted();
        if (existing.has(p)) continue;
        if (site === 'gdc' && p === '/pubblicita-sul-gazzettino-del-chianti-e-delle-colline-fiorentine/') continue;
        if (conflicts.has(p)) { review.push({ path: p, reason: 'conflicting-records' }); continue; }
        const decision = !batch.reviewOnly && r.published > cutoff ? await classifier.classify(site, r.html, { signal }) : { decision: 'review' };
        if (decision.decision === 'block') {
          const delta = JSON.stringify(p).length + 1;
          if (registryCount >= 50000 || registryLength + delta > MAX_REGISTRY_LENGTH) review.push({ path: p, reason: 'registry-capacity-limit' });
          else { adds.add(p); registryCount++; registryLength += delta; }
        } else review.push({ path: p, reason: decision.reason || (r.published > cutoff ? 'ambiguous-disclosure' : 'historical-or-unverified-date') });
      }
      signal.throwIfAborted();
      const added = adds.size - state.sites[site].additions.length;
      state.sites[site].additions = [...adds].sort();
      report[site] = { status: batch.complete ? 'complete' : 'bounded-gap', reviewOnly: !!batch.reviewOnly, records: batch.records.length, invalidURLs, added, review };
    } catch (e) { report[site] = { status: 'failed', reason: e.message }; }
  } } finally { await classifier.close(); }
  // State and outputs are committed together in an isolated Git worktree.
  // No clock-only writes: failures and unchanged inputs remain byte-identical.
  await build(root, state);
  await atomicWrite(root, 'article-cards/state.json', json(state));
  log(json(report));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const command = process.argv[2];
  try {
    if (command === 'build') console.log(await build(process.cwd()));
    else if (command === 'check') await check(process.cwd());
    else if (command === 'discover') {
      const report = await discover(process.cwd());
      // A partial result is a coherent candidate, not complete discovery.
      // Failed/truncated sites retained their state; publisher reports them.
      if (process.argv[3] === '--report') {
        const destination = path.resolve(process.argv[4] || '');
        const root = process.cwd() + path.sep;
        if (!process.argv[4] || destination.startsWith(root)) throw new Error('Report must be outside the publication checkout');
        await writeFile(destination, json(report));
      } else if (process.argv.length > 3) throw new Error('Expected --report PATH');
    } else throw new Error('Expected build, check, or discover');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
