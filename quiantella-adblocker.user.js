// ==UserScript==
// @name         QuiAntella Inline Ad Blocker
// @namespace    https://github.com/JunjoSick/filtershosting
// @version      1.1.0
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

  const PROPERTY_TITLE_REGEX =
    /\b(appartamento|villa|casa|immobile|locale|terreno|bilocale|trilocale|attico|mansarda|rustico|colonica|podere)\b.{0,50}\b(in\s+)?(vendita|affitto)\b/i;

  const PROPERTY_TITLE_REGEX_ALT =
    /\b(in\s+)?(vendita|affitto)\b.{0,50}\b(appartamento|villa|casa|immobile|locale|terreno|bilocale|trilocale|attico|mansarda|rustico|colonica|podere)\b/i;

  function isPropertyTitle(text) {
    return (
      PROPERTY_TITLE_REGEX.test(text) || PROPERTY_TITLE_REGEX_ALT.test(text)
    );
  }

  function isSeparatorLine(el) {
    return (
      el?.tagName?.toLowerCase() === "p" &&
      /^[—–-]{10,}\s*$/.test(el.textContent.trim())
    );
  }

  function isAllCapsRealEstate(el) {
    if (el?.tagName?.toLowerCase() !== "p") return false;
    const text = el.textContent.trim();
    return (
      text.length > 100 &&
      text === text.toUpperCase() &&
      /\b(MQ|APPARTAMENTO|BAGNI|CAMERE|IMMOBILE|PIANO|GIARDINO|TERRAZZA)\b/.test(
        text
      )
    );
  }

  function isContactInfo(el) {
    if (el?.tagName?.toLowerCase() !== "p") return false;
    const text = el.textContent.trim();
    return (
      /\bPer informazioni\b/i.test(text) ||
      /\bImmobiliare\b.*\d{6,}/.test(text) ||
      /\b(055|333|334|335|338|339|347|348|349|366|388|392|393)\d{6,}/.test(text)
    );
  }

  function isSlideshow(el) {
    return el?.classList?.contains("wp-block-jetpack-slideshow");
  }

  function removeAds() {
    const content = document.querySelector(".entry-content-single");
    if (!content) return;

    const toRemove = [];

    content.querySelectorAll("h3").forEach((h3) => {
      const titleText = h3.textContent.trim();
      if (!isPropertyTitle(titleText)) return;

      const adBlock = [h3];

      const prev = h3.previousElementSibling;
      if (isSeparatorLine(prev)) {
        adBlock.push(prev);
      }

      let next = h3.nextElementSibling;
      let safety = 0;

      while (next && safety < 5) {
        if (isSlideshow(next)) {
          adBlock.push(next);
        } else if (isAllCapsRealEstate(next)) {
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
        toRemove.push(...adBlock);
      }
    });

    const uniqueElements = [...new Set(toRemove)];
    uniqueElements.forEach((el) => el.remove());

    if (uniqueElements.length > 0) {
      console.log(
        `[QuiAntella Ad Blocker] Removed ${uniqueElements.length} ad elements`
      );
    }
  }

  removeAds();
  setTimeout(removeAds, 1500);

  const observer = new MutationObserver(() => removeAds());
  const target = document.querySelector(".entry-content-single");
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }
})();
