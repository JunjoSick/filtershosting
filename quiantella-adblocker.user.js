// ==UserScript==
// @name         QuiAntella Inline Ad Blocker
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Removes inline real estate ads from QuiAntella articles
// @author       JunjoSick
// @match        https://www.quiantella.it/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // Advertisers to detect (add more as needed)
  const AD_CONTACTS = [
    "Il Peruzzi Immobiliare",
    "Per informazioni:",
    // Add new agencies here as they appear
  ];

  // Real estate keywords for h3 detection
  const PROPERTY_KEYWORDS =
    /\b(vendita|affitto|in vendita|in affitto)\b.*\b(appartamento|villa|casa|immobile|locale|terreno|bilocale|trilocale)\b/i;

  function removeAds() {
    const content = document.querySelector(".entry-content-single");
    if (!content) return;

    let removed = 0;

    // 1. Find and remove ad contact paragraphs + nearby elements
    content.querySelectorAll("p").forEach((p) => {
      const text = p.textContent.trim();

      // Contact info paragraph
      if (AD_CONTACTS.some((keyword) => text.includes(keyword))) {
        // Walk backwards and remove related elements
        let sibling = p.previousElementSibling;
        while (sibling) {
          const prev = sibling.previousElementSibling;
          const tagName = sibling.tagName.toLowerCase();
          const sibText = sibling.textContent.trim();

          // ALL CAPS description (real estate jargon)
          if (
            tagName === "p" &&
            sibText.length > 100 &&
            sibText === sibText.toUpperCase() &&
            /\b(MQ|APPARTAMENTO|BAGNI|CAMERE|IMMOBILE)\b/.test(sibText)
          ) {
            sibling.remove();
            removed++;
          }
          // Jetpack slideshow
          else if (sibling.classList.contains("wp-block-jetpack-slideshow")) {
            sibling.remove();
            removed++;
          }
          // Property title h3
          else if (tagName === "h3" && PROPERTY_KEYWORDS.test(sibText)) {
            sibling.remove();
            removed++;
          }
          // Separator line
          else if (tagName === "p" && /^[—–-]{10,}\s*$/.test(sibText)) {
            sibling.remove();
            removed++;
          } else {
            // Stop when we hit unrelated content
            break;
          }

          sibling = prev;
        }

        p.remove();
        removed++;
      }
    });

    if (removed > 0) {
      console.log(`[QuiAntella Ad Blocker] Removed ${removed} ad elements`);
    }
  }

  // Run immediately and after short delay (for lazy-loaded content)
  removeAds();
  setTimeout(removeAds, 1500);

  // Optional: observe for dynamic content
  const observer = new MutationObserver(() => removeAds());
  const target = document.querySelector(".entry-content-single");
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }
})();
