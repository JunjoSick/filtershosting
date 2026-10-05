// ==UserScript==
// @name         fucksponsors
// @namespace    https://github.com/JunjoSick/filtershosting
// @version      1.0.4
// @description  Articoli sponsorizzati e promozionali.
// @match        https://www.quiantella.it/*
// @match        https://quiantella.it/*
// @match        https://www.gazzettinodelchianti.it/*
// @match        https://gazzettinodelchianti.it/*
// @match        https://daicollifiorentini.it/*
// @match        https://www.daicollifiorentini.it/*
// @match        https://www.firenzedintorni.it/*
// @match        https://firenzedintorni.it/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/JunjoSick/filtershosting/main/article-cards.user.js
// @downloadURL  https://raw.githubusercontent.com/JunjoSick/filtershosting/main/article-cards.user.js
// ==/UserScript==
(function () {
  'use strict';
  // Exact digest transitions must be separately reviewed with all removed
  // paths. Only the approved 40-to-32 Colli release transition is pinned.
  const CONFIG = /*__CONFIG__*/ { registryBase: 'https://raw.githubusercontent.com/JunjoSick/filtershosting/main/article-cards/registries', version: '1.0.4', reviewedRemovals: [{"host":"daicollifiorentini.it","fromSnapshot":"812e243fd27aa25f597c3328fdb911a6f2e89e765df5c0f219e201b323230083","toSnapshot":"b18b892ea2a1ae324390ee9c0cd389671826a250888d1d1602acb3768a020be1","reviewId":"fucksponsors-release-2026-10-05"}], debug: false };
  const DAY = 86400000;
  const RETRY = 3600000;
  const MARK = 'data-local-article-card';
  const VALUE = 'hide-v1';
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = ['quiantella.it', 'gazzettinodelchianti.it', 'daicollifiorentini.it', 'firenzedintorni.it'];
  if (!allowed.includes(host) || window.top !== window.self) return;
  const metrics = { nodes: 0, cards: 0, changed: 0, slices: 0, maxSliceMs: 0, requests: 0, overflows: 0 };
  const definitions = {
    'gazzettinodelchianti.it': [
      ['body.home .td_module_flex.td_module_wrap.td-cpt-post', ':scope > .td-module-container > .td-module-meta-info > h3.td-module-title > a[href]'],
      ['body.home .td_module_slide.td-cpt-post', ':scope > .td-slide-meta > h3.td-module-title > a[href]'],
      ['body.search .tdb_module_loop.td_module_wrap.td-cpt-post', ':scope > .td-module-container > .td-module-meta-info > h3.td-module-title > a[href]'],
      ['body:is(.search,.single) .vc_widget_sidebar .td_module_slide.td-cpt-post', ':scope > .td-slide-meta > h3.td-module-title > a[href]'],
      ['body.single .tdb-single-related-posts .tdb_module_related.td_module_wrap', ':scope > .td-module-container > .td-module-meta-info > h3.td-module-title > a[href]']
    ],
    'quiantella.it': [
      ['body.home article.entry.entry-grid.type-post', ':scope > .entry-wrap > h3.entry-title > a.entry-title-link[href]'],
      ['body.search article.entry.entry-archive.type-post', ':scope > .entry-wrap > h2.entry-title > a.entry-title-link[href]'],
      ['body.single #jp-relatedposts > .jp-relatedposts-items > .jp-relatedposts-post', ':scope > h4.jp-relatedposts-post-title > a.jp-relatedposts-post-a[href]']

    ],
    'daicollifiorentini.it': [
      ['body.home div.uael-post-wrapper', 'a.uael-post__complete-box-overlay[href]'],
      ['body.search-results article.elementor-post:not(.ast-article-single)', '.elementor-post__title > a[href]']
    ],
    'firenzedintorni.it': [
      ['aside a[href]:has(> img), .sidebar a[href]:has(> img)', ':scope'],
      ['article.thumb-info', ':scope > .row > div > .thumb-info-caption-text > :is(h2,h4) > a[href]']
    ]
  }[host];
  const roots = definitions.map(d => d[0]).join(',');
  const protectedBodies = '.entry-content,.tdb_single_content,.td-post-content,.post-content,.ast-article-single,.alm-single-post';
  const scopeClasses = new Set(['home', 'search', 'single', 'search-results', 'sidebar', 'vc_widget_sidebar', 'tdb-single-related-posts', 'entry-content', 'tdb_single_content', 'td-post-content', 'post-content', 'ast-article-single', 'alm-single-post', 'jp-relatedposts-items']);
  const key = 'article-cards-v1:' + host;
  let paths = new Set();
  let snapshot = '';
  let ready = false;
  let stopped = false;
  let scheduled = false;
  let refreshing = false;
  let refreshingRequest = null;
  let refreshTimer = null;
  let overflowRecovery = false;
  let observer;
  let jobs = [];
  let queued = new WeakMap();
  const hidden = new Map();
  const signatures = new WeakMap();
  const owners = new WeakMap();
  const sourceOwners = new WeakMap();
  let checks = 0;

  function normalizedPath(input, base = location.href) {
    try {
      const u = new URL(input, base);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || u.hostname.toLowerCase().replace(/^www\./, '') !== host) return null;
      // Ignore known attribution parameters only; unknown query routes fail open.
      for (const [k] of u.searchParams) if (!/^utm_/i.test(k) && !['fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'relatedposts_hit', 'relatedposts_origin', 'relatedposts_position'].includes(k)) return null;
      let p = u.pathname;
      if (!p.startsWith('/') || p.includes('\\') || /[\u0000-\u001f]/.test(p)) return null;
      return p || '/';
    } catch { return null; }
  }

  function validateRegistry(data) {
    if (!data || data.schema !== 1 || data.host !== host || !/^[a-f0-9]{64}$/.test(data.snapshot) || !Array.isArray(data.paths) || data.paths.length > 50000) return null;
    try { if (JSON.stringify(data).length + 1 > 2000000) return null; } catch { return null; }
    const set = new Set();
    for (const p of data.paths) {
      if (typeof p !== 'string' || p.length > 4096 || !p.startsWith('/') || p.startsWith('//') || p.includes('?') || p.includes('#') || normalizedPath(p) !== p || p === '/') return null;
      set.add(p);
    }
    if (set.size !== data.paths.length) return null;
    return set;
  }

  async function verifiedRegistry(data) {
    const set = validateRegistry(data);
    if (!set || !crypto.subtle) return null;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(data.paths) + '\n');
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      return hex === data.snapshot ? set : null;
    } catch { return null; }
  }

  function parts(card) {
    const definition = definitions.find(d => card.matches(d[0]));
    if (!definition) return null;
    if (card.closest(protectedBodies) || card.querySelector(protectedBodies) || card.querySelector(roots)) return null;
    const links = card.matches('a') ? [card] : card.querySelectorAll(definition[1]);
    if (links.length > 1) return null;
    let a = links[0];
    if (!a && host === 'firenzedintorni.it' && card.matches('article.thumb-info') && card.parentElement?.matches('a[href]')) a = card.parentElement;
    if (!a) return null;
    // One title source only, including nested links not matched by the narrow
    // source selector. Wrapperless search fragments deliberately stay visible.
    if (a.parentElement?.matches('h2,h3,h4') && a.parentElement.querySelectorAll('a').length !== 1) return null;
    // An enclosing hero cannot identify an article containing another link.
    if (card.parentElement?.matches('a') && (a !== card.parentElement || card.querySelector('a'))) return null;
    const p = normalizedPath(a.getAttribute('href'), a.baseURI);
    if (!p) return null;
    // A mixed destination could be an editorial neighbor. Taxonomy/author and
    // unrelated links also fail open; coverage is secondary to card identity.
    const navigation = card.querySelectorAll('a[href]');
    if (navigation.length > 16 || [...navigation].some(link => normalizedPath(link.getAttribute('href'), link.baseURI) !== p)) return null;
    const elements = [card];
    const sources = [...new Set([a, ...navigation])];
    return { path: p, elements, sources };
  }

  function unhide(card) {
    const old = hidden.get(card);
    if (old) for (const el of old) if (el.getAttribute(MARK) === VALUE) el.removeAttribute(MARK);
    if (old) for (const el of old) owners.delete(el);
    hidden.delete(card);
    for (const source of signatures.get(card)?.sources || []) sourceOwners.get(source)?.delete(card);
  }

  function inspect(card) {
    metrics.cards++;
    const value = parts(card);
    const shouldHide = !!value && paths.has(value.path);
    // Clones can inherit our marker but never inherit ownership/signatures.
    if (!hidden.has(card) && card.getAttribute(MARK) === VALUE) card.removeAttribute(MARK);
    const old = signatures.get(card);
    if (old && old.path === value?.path && old.snapshot === snapshot && old.block === shouldHide && old.elements.length === (value?.elements.length || 0) && old.elements.every((el, i) => el === value.elements[i] && (!shouldHide || el.getAttribute(MARK) === VALUE)) && old.sources.length === (value?.sources.length || 0) && old.sources.every((el, i) => el === value.sources[i])) return;
    unhide(card);
    if (shouldHide) {
      for (const el of value.elements) { el.setAttribute(MARK, VALUE); owners.set(el, card); }
      hidden.set(card, value.elements);
    }
    for (const source of value?.sources || []) {
      if (!sourceOwners.has(source)) sourceOwners.set(source, new Set());
      sourceOwners.get(source).add(card);
    }
    signatures.set(card, { path: value?.path, snapshot, block: shouldHide, elements: value?.elements || [], sources: value?.sources || [] });
    metrics.changed++;
  }

  function nearby(node) {
    if (node.nodeType !== 1) node = node.parentElement;
    // Only ancestors of this changed node, including deeply nested links. A
    // fixed depth cutoff can strand an already hidden card after an edit.
    const marked = node?.closest('[' + MARK + '="' + VALUE + '"]');
    if (marked && hidden.has(marked)) inspect(marked);
    const card = node?.closest(roots);
    if (card && card !== marked) inspect(card);
  }

  function queue(node, shallow = false, retire = false) {
    if (!ready || !node || node.nodeType !== 1) return;
    const existing = queued.get(node);
    if (existing) {
      existing.retire ||= retire;
      if (!shallow && existing.shallow) { existing.walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT); existing.shallow = false; }
      return;
    }
    if (jobs.length >= 1024) { metrics.overflows++; overflowRecovery = true; return; }
    const job = { root: node, first: true, walker: shallow ? null : document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT), shallow, retire };
    queued.set(node, job);
    jobs.push(job);
    schedule();
  }

  function schedule() {
    if (scheduled || stopped || !ready || document.hidden || !jobs.length) return;
    scheduled = true;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(work, { timeout: 1500 });
    else setTimeout(() => work(null), 32);
  }

  function work(deadline) {
    scheduled = false;
    if (stopped || document.hidden) return;
    const start = performance.now();
    let count = 0;
    // Wall-time is checked between individual nodes. A slow selector call itself is not preemptible.
    while (jobs.length && count < 100 && performance.now() - start < 3) {
      if (count > 0 && (deadline && !deadline.didTimeout && deadline.timeRemaining() < 1 || navigator.scheduling?.isInputPending?.())) break;
      const j = jobs[0];
      let node;
      if (j.first) { node = j.root; j.first = false; if (node.isConnected) nearby(node); }
      else node = j.walker?.nextNode();
      if (!node) { queued.delete(j.root); jobs.shift(); continue; }
      metrics.nodes++; count++;
      // A removed subtree may already be connected elsewhere by delivery time.
      if (j.retire) { const owner = owners.get(node); if (owner) queue(owner, true); }
      if (!node.isConnected) {
        const owner = owners.get(node);
        if (owner?.isConnected) queue(owner, true);
        unhide(node); signatures.delete(node); continue;
      }
      if (node.getAttribute(MARK) === VALUE && !hidden.has(owners.get(node))) node.removeAttribute(MARK);
      if (hidden.has(node) || node.matches(roots)) inspect(node);
    }
    metrics.slices++; metrics.maxSliceMs = Math.max(metrics.maxSliceMs, performance.now() - start);
    if (++checks % 20 === 0) for (const card of hidden.keys()) if (!card.isConnected) { unhide(card); signatures.delete(card); }
    if (!jobs.length && overflowRecovery) { overflowRecovery = false; queue(document.body); }
    schedule();
  }

  function observe() {
    let base = document.baseURI;
    observer = new MutationObserver(records => {
      if (stopped || !ready) return;
      if (base !== document.baseURI) {
        base = document.baseURI;
        for (const card of hidden.keys()) { unhide(card); signatures.delete(card); }
        queue(document.body);
      }
      for (const r of records) {
        if (r.target !== document.body && !document.body.contains(r.target)) continue;
        // Queue, never walk or query the full document in the observer callback.
        // Rescan descendants only if a relevant scope class changes. Dark-mode
        // and scroll-state body classes must not rewalk an entire feed.
        const before = new Set((r.oldValue || '').split(/\s+/));
        const after = new Set((r.target.getAttribute('class') || '').split(/\s+/));
        const scopeChanged = r.attributeName === 'class' && [...scopeClasses].some(c => before.has(c) !== after.has(c));
        const idScopeChanged = host === 'quiantella.it' && r.attributeName === 'id' && (r.oldValue === 'jp-relatedposts' || r.target.id === 'jp-relatedposts');
        queue(r.target, !(scopeChanged || idScopeChanged));
        const owner = owners.get(r.target);
        if (owner) queue(owner, true);
        for (const card of sourceOwners.get(r.target) || []) queue(card, true);
        // Keep a hero reachable even after an invalid/foreign href removed its
        // previous dependency. This query stays inside the changed anchor.
        if (host === 'firenzedintorni.it' && r.attributeName === 'href' && r.target.matches('a')) queue(r.target.querySelector(':scope > article.thumb-info'), true);

        if (r.type === 'childList') for (const n of r.addedNodes) queue(n);
        // Retire removed subtrees cooperatively, so the ownership Map does not
        // retain an abandoned feed until an unrelated future mutation.
        if (r.type === 'childList') {
          for (const n of r.removedNodes) queue(n, false, true);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['href', 'class', 'id'] });
    if (document.head) observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }

  function replaceRegistry(data, set) {
    if (snapshot === data.snapshot && paths.size === set.size && [...set].every(p => paths.has(p))) return;
    paths = set; snapshot = data.snapshot;
    for (const card of hidden.keys()) { unhide(card); signatures.delete(card); }
    jobs = []; queued = new WeakMap();
    for (const el of document.querySelectorAll('[' + MARK + ']')) el.removeAttribute(MARK);
    queue(document.body);
  }

  async function get(k, fallback) { try { return await GM_getValue(k, fallback); } catch { return fallback; } }
  async function put(k, value) { try { await GM_setValue(k, value); return true; } catch { return false; } }

  function allowedReplacement(data, set) {
    if (![...paths].some(p => !set.has(p))) return true;
    return CONFIG.reviewedRemovals.some(r => r.host === host && r.fromSnapshot === snapshot && r.toSnapshot === data.snapshot && typeof r.reviewId === 'string' && r.reviewId.trim());
  }

  async function adoptCache() {
    const cached = await get(key, null);
    const set = await verifiedRegistry(cached?.data);
    if (set && allowedReplacement(cached.data, set)) replaceRegistry(cached.data, set);
    return cached;
  }

  function contentionRetry() { armRefresh(20000 + Math.floor(Math.random() * 10000)); }

  function armRefresh(delay = 10000) {
    clearTimeout(refreshTimer);
    if (stopped || !CONFIG.registryBase || document.hidden) return;
    refreshTimer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => refresh(), { timeout: 3000 });
      else refresh();
    }, delay);
  }

  async function fetchRegistry() {
    if (stopped || document.hidden || refreshing) return;
    if (navigator.onLine === false || navigator.connection?.saveData) { armRefresh(RETRY); return; }
    refreshing = true;
    try {
      const now = Date.now();
      const current = await get(key, null);
      const currentSet = await verifiedRegistry(current?.data);
      if (currentSet && allowedReplacement(current.data, currentSet)) {
        replaceRegistry(current.data, currentSet);
        if (Number.isFinite(current.checkedAt) && current.checkedAt <= now && now - current.checkedAt < DAY) { armRefresh(DAY - (now - current.checkedAt) + 1000); return; }
      }
      const attempt = await get(key + ':attempt', 0);
      if (Number.isFinite(attempt) && attempt <= now && now - attempt < RETRY) { armRefresh(RETRY - (now - attempt) + 1000); return; }
      if (stopped || document.hidden) return;
      await put(key + ':attempt', now);
      const result = await new Promise(resolve => {
        metrics.requests++;
        let settled = false;
        const finish = value => { if (!settled) { settled = true; clearTimeout(watchdog); resolve(value); } };
        // Anonymous Tampermonkey requests enforce fetch mode, where its native
        // timeout may be ignored. The independent watchdog bounds the request.
        const watchdog = setTimeout(() => { finish(null); refreshingRequest?.abort?.(); }, 15000);
        try {
          refreshingRequest = GM_xmlhttpRequest({
            method: 'GET', url: CONFIG.registryBase + '/' + host + '.json',
            anonymous: true, redirect: 'error', timeout: 15000, headers: { Referer: '' },
            // No page URL, titles, DOM text, cookies or history is submitted.
            // Some managers expose byte progress; abort early when available.
            // Managers without it still have duration and post-load text limits.
            onprogress: event => {
              if (Number.isFinite(event.loaded) && event.loaded > 2_000_000 || event.lengthComputable && Number.isFinite(event.total) && event.total > 2_000_000) {
                finish(null); refreshingRequest?.abort?.();
              }
            },
            onload: finish, onerror: () => finish(null), ontimeout: () => finish(null), onabort: () => finish(null)
          });
        } catch { finish(null); }
      });
      refreshingRequest = null;
      if (stopped || !result || result.status !== 200 || typeof result.responseText !== 'string' || result.responseText.length > 2000000) { armRefresh(RETRY); return; }
      if (result.finalUrl && result.finalUrl !== CONFIG.registryBase + '/' + host + '.json') { armRefresh(RETRY); return; }
      let data; try { data = JSON.parse(result.responseText); } catch { armRefresh(RETRY); return; }
      const set = await verifiedRegistry(data);
      if (!set) { armRefresh(RETRY); return; }
      // All removals (including small/empty snapshots) need an exact reviewed
      // from/to digest pin. Last-good data remains active on unapproved shrink.
      if (!allowedReplacement(data, set)) { armRefresh(RETRY); return; }
      await put(key, { data, checkedAt: now });
      replaceRegistry(data, set);
      armRefresh(DAY + 1000);
    } catch { armRefresh(RETRY); }
    finally { refreshing = false; }
  }

  async function refresh() {
    if (stopped || document.hidden || refreshing) return;
    await adoptCache();
    if (stopped || document.hidden) return;
    // Same-origin tab serialization. Without Web Locks, a shared storage lease is best-effort, not atomic.
    if (navigator.locks?.request) {
      try { await navigator.locks.request(key, { ifAvailable: true }, lock => lock ? fetchRegistry() : contentionRetry()); }
      catch { contentionRetry(); }
    } else {
      // GM storage lacks compare-and-swap; re-read after a randomized lease
      // election. This is best effort across isolated tabs, not an atomic lock.
      const leaseKey = key + ':lease';
      const token = Math.random().toString(36).slice(2);
      const lease = await get(leaseKey, null);
      if (lease?.until > Date.now()) { contentionRetry(); return; }
      if (!await put(leaseKey, { token, until: Date.now() + 20000 })) { armRefresh(RETRY); return; }
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      const elected = await get(leaseKey, null);
      if (elected?.token !== token) { contentionRetry(); return; }
      if (stopped || document.hidden) return;
      try { await fetchRegistry(); }
      finally { if ((await get(leaseKey, null))?.token === token) await put(leaseKey, null); }
    }
  }

  async function start() {
    const cached = await get(key, null);
    const set = await verifiedRegistry(cached?.data);
    if (stopped) return;
    if (set) { paths = set; snapshot = cached.data.snapshot; }
    const style = document.createElement('style');
    style.textContent = '[' + MARK + '="' + VALUE + '"]{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
    ready = true; observe(); queue(document.body);
    if (document.readyState === 'complete') armRefresh();
    else window.addEventListener('load', () => armRefresh(), { once: true });
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { schedule(); armRefresh(); } else { clearTimeout(refreshTimer); refreshingRequest?.abort?.(); } });
  window.addEventListener('pagehide', () => { stopped = true; scheduled = false; observer?.disconnect(); clearTimeout(refreshTimer); refreshingRequest?.abort?.(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; if (!ready) start(); else { observe(); queue(document.body); armRefresh(); } } });
  window.addEventListener('popstate', () => { for (const c of hidden.keys()) { unhide(c); signatures.delete(c); } queue(document.body); });
  // No history interception, scroll listeners, polling, layout reads, fetch monkey-patches, or article requests.
  if (CONFIG.debug) window.__articleCardFilterTest = { metrics, normalizedPath, validateRegistry, parts, queue, refresh, replaceRegistry, inspect, paths: () => paths, ready: () => ready, owned: () => hidden.size, flush: () => { let n = 0; while (jobs.length && n++ < 10000) work(null); }, stop: () => { stopped = true; observer?.disconnect(); clearTimeout(refreshTimer); refreshingRequest?.abort?.(); } };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
