// Native CSS only. Do not duplicate these as #?# / #$?#: the tested
// ExtendedCss runtime can retain hiding after an href-only change.
const bodies = '.entry-content,.tdb_single_content,.td-post-content,.post-content,.ast-article-single,.alm-single-post';
const roots = '.td_module_flex,.td_module_slide,.tdb_module_loop,.tdb_module_related,article.entry,.jp-relatedposts-post,article.thumb-info,.uael-post-wrapper,article.elementor-post';
const outsideBody = `:not(${bodies},${bodies.split(',').map(s => s + ' *').join(',')}):not(:has(${bodies}))`;
const bounded = outsideBody + `:not(:has(${roots}))`;
// Require a link in the layout's title/overlay, then require EVERY descendant
// navigation link to have the same exact href identity. Multiple images/title
// links for one article are fine; category links or mixed articles fail open.
const layouts = {
  gdc: [
    'body.home .td_module_flex.td_module_wrap.td-cpt-post:has(> .td-module-container > .td-module-meta-info > h3.td-module-title > a[href])',
    'body.home .td_module_slide.td-cpt-post:has(> .td-slide-meta > h3.td-module-title > a[href])',
    'body.search .tdb_module_loop.td_module_wrap.td-cpt-post:has(> .td-module-container > .td-module-meta-info > h3.td-module-title > a[href])',
    'body:is(.search,.single) .vc_widget_sidebar .td_module_slide.td-cpt-post:has(> .td-slide-meta > h3.td-module-title > a[href])',
    'body.single .tdb-single-related-posts .tdb_module_related.td_module_wrap:has(> .td-module-container > .td-module-meta-info > h3.td-module-title > a[href])',
  ],
  quiantella: [
    'body.home article.entry.entry-grid.type-post:has(> .entry-wrap > h3.entry-title > a.entry-title-link[href])',
    'body.search article.entry.entry-archive.type-post:has(> .entry-wrap > h2.entry-title > a.entry-title-link[href])',
    'body.single #jp-relatedposts > .jp-relatedposts-items > .jp-relatedposts-post:has(> h4.jp-relatedposts-post-title > a.jp-relatedposts-post-a[href])',
  ],
  colli: [
    'body.home div.uael-post-wrapper:has(a.uael-post__complete-box-overlay[href])',
    'body.search-results article.elementor-post:has(.elementor-post__title > a[href])',
  ],
  firenze: [
    'article.thumb-info:not(a *):has(> .row > div > .thumb-info-caption-text > :is(h2,h4) > a[href])',
  ],
};
export const NATIVE_GROUP_SIZE = 32;
export const nativeLayoutCount = site => layouts[site].length + (site === 'firenze' ? 1 : 0);

export function nativeRules(site, origin, paths) {
  const domain = new URL(origin).hostname.replace(/^www\./, '');
  // Root-relative paths resolve safely with no base or a canonical root base.
  // Any foreign/directory base, including later changes, makes all rules inert.
  const base = `html:not(:has(base[href]:not([href=""],[href="/"],[href="${origin}"],[href="${origin}/"]))) `;
  const rules = [];
  for (let offset = 0; offset < paths.length; offset += NATIVE_GROUP_SIZE) {
    // Factor repeated layout guards while retaining SAME-PATH identity. The
    // cheap positive gate limits expensive wrapper checks to this small group.
    // A union-only negative gate would wrongly accept two different paths.
    const identities = paths.slice(offset, offset + NATIVE_GROUP_SIZE).map(p => `[href="${p}"],[href="${origin}${p}"]`);
    const hrefs = identities.join(',');
    const samePath = identities.map(h => `:not(:has(a[href]:not(${h})))`).join(',');
    for (const layout of layouts[site]) {
      // Keep the concrete card class outside :is(): browsers can index it and
      // avoid evaluating a relational selector against every node in the page.
      rules.push(`${domain}##${base}${layout.replace('[href]', `:is(${hrefs})`)}${bounded}:is(${samePath})`);
    }
    if (site === 'firenze') {
      // Outer links contain one whole article or one image. Wrapperless search
      // siblings have no stable boundary and are deliberately unsupported.
      rules.push(`${domain}##${base}:is(a:has(> article.thumb-info:only-child),:is(aside,.sidebar) a:has(> img:only-child)):is(${hrefs})${outsideBody}:not(:has(a[href]))`);
    }
  }
  return rules;
}
