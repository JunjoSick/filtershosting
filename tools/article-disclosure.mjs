import { parseHTML } from 'linkedom';

const labels = {
  gdc: /^(?:CONTENUTO SPONSORIZZATO|\(CONTENUTO SPONSORIZZATO\))$/i,
  quiantella: /^(?:Informazione promozionale|\(Informazione promozionale\))$/i,
  colli: /^(?:(?:Articolo ADV|Contenuto adv|#adv)|\((?:Articolo ADV|Contenuto adv|#adv)\))$/i,
};
// Evidence and its ancestor chain must be plain prose/formatting. Ordinary
// markup elsewhere is allowed, but document-active content can affect a label
// from outside that chain and therefore still holds the whole body for review.
const supported = new Set(['MAIN', 'ARTICLE', 'SECTION', 'DIV', 'P', 'PRE', 'BR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'SMALL', 'U']);
const active = new Set(['STYLE', 'SCRIPT', 'LINK', 'IFRAME', 'OBJECT', 'EMBED']);
const normalize = text => text.replace(/\s+/g, ' ').trim();

const empty = () => ({ text: '', long: false, lastLine: '', lineLong: false, br: false });
function append(to, child) {
  // Fixed-size summaries keep nested containers and repeated labels linear.
  const text = (to.text + child.text).replace(/ +/g, ' ');
  to.long ||= child.long || text.length > 602;
  to.text = text.slice(0, 602);
  const line = child.br ? child.lastLine : (to.lastLine + child.lastLine).replace(/ +/g, ' ');
  to.lineLong = child.br ? child.lineLong : to.lineLong || child.lineLong || line.length > 64;
  to.lastLine = line.slice(0, 64);
  to.br ||= child.br;
}
const tailJoin = (a, b) => normalize(a + ' ' + b).slice(0, 600);

export function classify(site, html, { budgetMs = 250, maxNodes = 50000, maxDepth = 128, metrics = {} } = {}) {
  if (!labels[site] || typeof html !== 'string' || html.length > 2_000_000) return 'review';
  const deadline = performance.now() + budgetMs;
  const limit = reason => { metrics.limited = reason; return 'review'; };
  if (budgetMs <= 0) return limit('time-limit');
  const { document } = parseHTML('<html><body><main></main></body></html>');
  const root = document.querySelector('main'); root.innerHTML = html;
  const nodes = []; const metadata = new Map(); const stack = [{ node: root, depth: 0, context: true }];
  metrics.nodes = 0; metrics.operations = 0;
  while (stack.length) {
    const { node, depth, context } = stack.pop();
    if (++metrics.nodes > maxNodes) return limit('node-limit');
    if (depth > maxDepth) return limit('depth-limit');
    if (metrics.nodes % 128 === 0 && performance.now() > deadline) return limit('time-limit');
    let plain = true;
    if (node.nodeType === 1) {
      const tag = node.tagName.toUpperCase(); const attributes = node.attributes;
      if (active.has(tag)) return 'review';
      for (const attribute of attributes) {
        metrics.operations++;
        if (metrics.operations % 128 === 0 && performance.now() > deadline) return limit('time-limit');
        // Case-insensitive event handlers are active even on an unrelated
        // image/link. Ordinary href/src/class/id/style attributes are not.
        if (attribute.name.toLowerCase().startsWith('on')) return 'review';
      }
      plain = supported.has(tag) && attributes.length === 0;
    }
    const eligibleContext = context && plain;
    metadata.set(node, { summary: empty(), tail: '', context: eligibleContext, plainTree: plain }); nodes.push(node);
    for (let child = node.lastChild; child; child = child.previousSibling) stack.push({ node: child, depth: depth + 1, context: eligibleContext });
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]; const info = metadata.get(node); const summary = info.summary;
    metrics.operations++;
    if (i % 128 === 0 && performance.now() > deadline) return limit('time-limit');
    if (node.nodeType === 3) {
      const text = node.textContent.replace(/\s+/g, ' ');
      summary.text = text.slice(0, 602); summary.long = text.length > 602;
      summary.lastLine = text.slice(0, 64); summary.lineLong = text.length > 64;
    } else if (node.nodeType === 1 && node.tagName === 'BR') { summary.text = '\n'; summary.br = true; }
    else if (node.nodeType === 1) for (let child = node.firstChild; child; child = child.nextSibling) {
      const childInfo = metadata.get(child);
      append(summary, childInfo.summary); info.plainTree &&= childInfo.plainTree; metrics.operations++;
    }
  }
  for (const node of nodes) {
    const info = metadata.get(node); let following = '';
    // Parent-first traversal shares each ancestor's already bounded suffix.
    for (let child = node.lastChild; child; child = child.previousSibling) {
      const childInfo = metadata.get(child);
      childInfo.tail = tailJoin(following, info.tail);
      // Preserve conservative trailing-context handling: unsupported following
      // content is not silently treated as an empty/short attribution.
      following = tailJoin(childInfo.summary.long || !childInfo.plainTree ? 'x'.repeat(600) : childInfo.summary.text, following);
      metrics.operations++;
    }
    if (metrics.operations % 128 === 0 && performance.now() > deadline) return limit('time-limit');
    if (!info.context || !info.plainTree || !['P', 'DIV', 'PRE'].includes(node.tagName) || info.tail.length >= 600) continue;
    const s = info.summary;
    if (!s.long && labels[site].test(normalize(s.text)) || node.tagName !== 'PRE' && s.br && !s.lineLong && labels[site].test(normalize(s.lastLine))) return 'block';
  }
  return 'review';
}
