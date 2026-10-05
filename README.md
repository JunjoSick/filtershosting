# filtershosting

Personal ad-block filters and optional userscripts. Use the subscribe links for browser ad blockers; use the raw URLs when a client asks for a direct filter-list URL.

## Filter lists

### fuckquotidianilocali — all four local newspapers

One subscription combining QuiAntella, Gazzettino del Chianti, Dai Colli
Fiorentini, and Firenze e Dintorni. YouTube and the userscript are excluded.

- Subscribe: [fuckquotidianilocali](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckquotidianilocali.txt&title=fuckquotidianilocali)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckquotidianilocali.txt`

Use the bundle in place of the four individual subscriptions below. Their URLs
remain available if you prefer selecting individual sites. The generated bundle
supports AdGuard differential updates; uBlock Origin can download the complete
list. Import it as a custom content filter, not a DNS blocklist.

During review, this link becomes available on `main` only after the bundle PR
is merged. See [bundle maintenance](docs/bundle-maintenance.md) for generation,
history, validation, and client limitations.

### fucksponsors - Articoli sponsorizzati e promozionali

Optional article-card filtering for the same four newspapers, separate from the
ad lists and `fuckquotidianilocali`. Hides selected sponsored and promotional
cards on supported listings; direct articles and links inside article bodies
remain accessible. Includes all reviewed GDC sponsored content, including
events and jobs. Eight unavailable articles remain excluded pending evidence.

- Subscribe: [fucksponsors](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fucksponsors.txt&title=fucksponsors)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fucksponsors.txt`
- Optional userscript: [article-cards.user.js](https://raw.githubusercontent.com/JunjoSick/filtershosting/main/article-cards.user.js)

Requires modern uBO or AdGuard with native `:has()` support; older clients are
unsupported. Android/device integration has not been verified. The daily
article updater is disabled. See [coverage and client limits](docs/article-cards.md).
The draft `sponsored-article-cards.txt` URL remains a generated compatibility alias.

### fuckquiantella

For `quiantella.it`.

- Subscribe: [fuckquiantella](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckquiantella.txt?_=raw&title=fuckquiantella)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckquiantella.txt`

### fuckgazzettinodelchianti

For `gazzettinodelchianti.it`.

- Subscribe: [fuckgazzettinodelchianti](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckgazzettinodelchianti.txt?_=raw&title=fuckgazzettinodelchianti)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckgazzettinodelchianti.txt`

### fuckdaicollifiorentini

For `daicollifiorentini.it`.

- Subscribe: [fuckdaicollifiorentini](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckdaicollifiorentini.txt?_=raw&title=fuckdaicollifiorentini)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckdaicollifiorentini.txt`

### fuckfirenzedintorni

For `firenzedintorni.it`.

- Subscribe: [fuckfirenzedintorni](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckfirenzedintorni.txt?_=raw&title=fuckfirenzedintorni)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckfirenzedintorni.txt`

### youtubecazzimm

YouTube cleanup list, exposed as `youtubesuckssobad`.

- Subscribe: [youtubesuckssobad](https://subscribe.adblockplus.org/?location=https://raw.githubusercontent.com/JunjoSick/filtershosting/main/kebablastazione.txt?_=raw&title=youtubesuckssobad)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/kebablastazione.txt`

## Userscript

### quiantella-adblocker

Tampermonkey/Greasemonkey helper for dynamic inline QuiAntella real-estate ads.

- Install: [quiantella-adblocker.user.js](https://raw.githubusercontent.com/JunjoSick/filtershosting/main/quiantella-adblocker.user.js)
- Raw: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/quiantella-adblocker.user.js`

## AdGuard for Android troubleshooting

Add raw filter URLs as custom filters, not as DNS blocklists. DNS filtering cannot apply path-based image rules, CSS cosmetic rules, or ExtendedCss rules.

Useful raw URLs:

- QuiAntella: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckquiantella.txt`
- Gazzettino del Chianti: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckgazzettinodelchianti.txt`
- Dai Colli Fiorentini: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckdaicollifiorentini.txt`
- Firenze e Dintorni: `https://raw.githubusercontent.com/JunjoSick/filtershosting/main/fuckfirenzedintorni.txt`

For HTTPS sites, enable HTTPS filtering for the browser you use. After a list update, force-update the custom filter in AdGuard and reload the affected browser tab.
