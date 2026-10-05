import { SaxesParser } from 'saxes';
import { setImmediate } from 'node:timers/promises';

// Supported feed evidence is an explicit UTC RFC 1123 form. Do not guess a
// locale, timezone, missing weekday or a rolled-over calendar date.
export function parseRSSDate(input) {
  const m = typeof input === 'string' && input.trim().match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) (?:GMT|\+0000)$/);
  if (!m) throw new Error('Unsupported RSS UTC date');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[3]);
  const [day, year, hour, minute, second] = [m[2], m[4], m[5], m[6], m[7]].map(Number);
  const value = Date.UTC(year, month, day, hour, minute, second); const date = new Date(value);
  if (year < 1970 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()] !== m[1]) throw new Error('Invalid RSS UTC date');
  return value;
}

// Strict XML parsing: no recovery, DTDs, entities from external sources or
// stray channels. CDATA/escaped text remains local to one direct item field.
export async function parseRSS(text, { signal } = {}) {
  signal?.throwIfAborted();
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4_000_000) throw new Error('Invalid RSS size');
  const parser = new SaxesParser({ xmlns: true });
  const stack = []; const records = []; let channels = 0; let elements = 0; let item; let field;
  const invalid = () => { throw new Error('Invalid RSS structure'); };
  parser.on('error', invalid); parser.on('doctype', invalid);
  parser.on('opentag', tag => {
    if (++elements > 20000 || stack.length >= 32) invalid();
    const parent = stack.at(-1); stack.push(tag);
    if (stack.length === 1) { if (tag.name !== 'rss' || tag.uri) invalid(); }
    else if (tag.local === 'channel') { if (stack.length !== 2 || parent.name !== 'rss' || tag.uri || ++channels !== 1) invalid(); }
    else if (tag.local === 'item') {
      if (stack.length !== 3 || parent.name !== 'channel' || tag.uri || records.length >= 100) invalid();
      item = {};
    } else if (item && stack.length === 4) {
      const key = tag.local === 'encoded' && tag.uri === 'http://purl.org/rss/1.0/modules/content/' ? 'html' : !tag.uri && ['link', 'pubDate'].includes(tag.name) ? tag.name : null;
      if (key) { if (Object.hasOwn(item, key)) invalid(); item[key] = ''; field = key; }
    } else if (field) invalid();
  });
  const content = text => { if (field) item[field] += text; };
  parser.on('text', content); parser.on('cdata', content);
  parser.on('closetag', () => {
    if (stack.length === 4) field = null;
    if (stack.length === 3 && stack.at(-1).name === 'item') {
      if (typeof item.link !== 'string' || !item.link.trim() || typeof item.pubDate !== 'string' || typeof item.html !== 'string') invalid();
      records.push({ url: item.link.trim(), published: parseRSSDate(item.pubDate), html: item.html }); item = null;
    }
    stack.pop();
  });
  // Yield between bounded chunks so a global abort can interrupt feed parsing.
  for (let offset = 0; offset < text.length; offset += 65536) {
    signal?.throwIfAborted(); parser.write(text.slice(offset, offset + 65536)); await setImmediate();
  }
  signal?.throwIfAborted(); parser.close();
  if (channels !== 1 || !records.length || stack.length) invalid();
  return records;
}
