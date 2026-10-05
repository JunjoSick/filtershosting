import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../sources/filters/fuckfirenzedintorni.txt', import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../fuckquotidianilocali.txt', import.meta.url), 'utf8');
const marker = '! ---- fuckfirenzedintorni.txt ----';
assert.equal(bundle.split(marker).length, 2, 'bundle must contain one Firenze section');
const bundled = bundle.split(marker)[1].split(/^! ---- /m)[0];
const activeRules = content => content.split(/\r?\n/).map(line => line.trim())
  .filter(line => line && !line.startsWith('!'));

// This is the reviewed scope of the rollback, not a scriptlet or CSS emulator.
// In particular, sponsor-gap collapse must survive removal of article rewriting.
const retainedRules = [
  '||firenzedintorni.it/uploadedfiles/sponsor/$image',
  'firenzedintorni.it##.itm_sponsor_carousel',
  'firenzedintorni.it##.bkg-griginoo',
  'firenzedintorni.it###wdc_banner',
  'firenzedintorni.it##.cookiebanner',
  'firenzedintorni.it#?#div:has(> .cookiekit_accetto_btn)',
  'firenzedintorni.it##div:has(> .cookiekit_accetto_btn)',
];

for (const [name, content] of [['individual subscription', source], ['combined subscription', bundled]]) {
  test(`Firenze ${name} cannot flatten article spans through scriptlets`, () => {
    const rules = activeRules(content);
    // Both former variants are forbidden: the AdGuard call removed BR/links,
    // while the malformed uBO call would become destructive if changed to span.
    assert.deepEqual(rules.filter(rule => /##\+js\(|#%#/.test(rule)), []);
  });

  test(`Firenze ${name} retains sponsor-gap, cookie and placeholder rules only`, () => {
    // Also rejects generic blank-paragraph/BR cleanup or selectors targeting
    // editorial text as a substitute for the removed scriptlets.
    assert.deepEqual(activeRules(content), retainedRules);
  });
}
