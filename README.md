# filtershosting

Personal ad-block filters and one userscript. Use the subscribe links for browser ad blockers; use the raw URLs when a client asks for a direct filter-list URL.

## Filter lists

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

For HTTPS sites, enable HTTPS filtering for the browser you use. After a list update, force-update the custom filter in AdGuard and reload the affected browser tab.
