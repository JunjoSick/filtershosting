// ==UserScript==
// @name         QuiAntella Inline Ad Blocker
// @namespace    https://github.com/JunjoSick/filtershosting
// @version      1.2.0
// @description  Removes inline real estate ads from QuiAntella articles
// @author       JunjoSick
// @match        https://www.quiantella.it/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/JunjoSick/filtershosting/master/quiantella-adblocker.user.js
// @downloadURL  https://raw.githubusercontent.com/JunjoSick/filtershosting/master/quiantella-adblocker.user.js
// ==/UserScript==

(function () {
  "use strict";

  const PROPERTY_TYPES_PATTERN =
    "appartamento|villa|casa|immobile|locale|terreno|bilocale|trilocale|attico|mansarda|rustico|colonica|podere";
  const PROPERTY_TITLE_REGEX = new RegExp(
    "(?:" +
      "\\b(?:" + PROPERTY_TYPES_PATTERN + ")\\b.{0,50}\\b(?:in\\s+)?(?:vendita|affitto)\\b" +
      "|" +
      "\\b(?:in\\s+)?(?:vendita|affitto)\\b.{0,50}\\b(?:" + PROPERTY_TYPES_PATTERN + ")\\b" +
    ")",
    "i"
  );

  const SEPARATOR_REGEX = /^[—–-]{10,}\s*$/;
  const REAL_ESTATE_KEYWORDS =
    /\b(MQ|APPARTAMENTO|BAGNI|CAMERE|IMMOBILE|PIANO|GIARDINO|TERRAZZA)\b/;
  const CONTACT_REGEX =
    /\bPer informazioni\b|\bImmobiliare\b.*\d{6,}|\b(055|333|334|335|338|339|347|348|349|366|388|392|393)\d{6,}/i;

  function isP(el) {
    return el?.tagName === "P";
  }

  function isSeparatorLine(el) {
    return isP(el) && SEPARATOR_REGEX.test(el.textContent.trim());
  }

  function isAllCapsRealEstate(el) {
    if (!isP(el)) return false;
    const text = el.textContent.trim();
    return (
      text.length > 100 &&
      text === text.toUpperCase() &&
      REAL_ESTATE_KEYWORDS.test(text)
    );
  }

  function isContactInfo(el) {
    return isP(el) && CONTACT_REGEX.test(el.textContent.trim());
  }

  function isSlideshow(el) {
    return el?.classList?.contains("wp-block-jetpack-slideshow");
  }

  function removeAds() {
    const content = document.querySelector(".entry-content-single");
    if (!content) return;

    const toRemove = new Set();

    content.querySelectorAll("h3").forEach((h3) => {
      if (!PROPERTY_TITLE_REGEX.test(h3.textContent.trim())) return;

      const adBlock = [h3];

      const prev = h3.previousElementSibling;
      if (isSeparatorLine(prev)) {
        adBlock.push(prev);
      }

      let next = h3.nextElementSibling;
      let safety = 0;

      while (next && safety < 5) {
        if (isSlideshow(next) || isAllCapsRealEstate(next)) {
          adBlock.push(next);
        } else if (isContactInfo(next)) {
          adBlock.push(next);
          break;
        } else {
          break;
        }
        next = next.nextElementSibling;
        safety++;
      }

      if (adBlock.length >= 2) {
        for (const el of adBlock) toRemove.add(el);
      }
    });

    if (toRemove.size > 0) {
      toRemove.forEach((el) => el.remove());
      console.log(
        `[QuiAntella Ad Blocker] Removed ${toRemove.size} ad elements`
      );
    }
  }

  removeAds();

  let debounceTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(removeAds, 200);
  });
  const target = document.querySelector(".entry-content-single");
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }
})();
