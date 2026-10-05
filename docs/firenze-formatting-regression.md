# Preserve Firenze article markup

The former NBSP cleanup changed an entire span's `textContent` in AdGuard.
An indented article span could therefore lose its BR, links, emphasis and
other children. Matching only leading NBSP narrowed the affected spans but
did not make rewriting those spans safe.

A minimal synthetic reproduction is:

```html
<div class="post-content"><div class="mb-4">
  <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;First sentence.<br><br>-----<br><br>Second sentence with <a href="https://example.invalid/source">a source</a> and <em>emphasis</em>.</span>
</div></div>
```

Replacing the span's textContent with its leading NBSP removed collapses the
separator onto the adjacent text and deletes the anchor and emphasis nodes.
The fix leaves the publisher's text and markup unchanged, including indentation.
It does not replace the scriptlets with generic BR or empty-paragraph cleanup.

The published uBO rule also had the wrong signature: it supplied a CSS selector
where uBO expects a node name. It was inert in the verified implementation.
Changing that argument to `span` and fixing the pattern would introduce the
same child-markup loss; uBO is not inherently limited to text nodes.

## Sponsor spacing is a separate feature

Commit [c64ea79](https://github.com/JunjoSick/filtershosting/commit/c64ea79f1cb20aae789ef74ab829fdcc78bc7bae)
fixed leftover sponsor space by hiding the dedicated `.bkg-griginoo` wrapper.
The [later NBSP change](https://github.com/JunjoSick/filtershosting/commit/9a9f363a8823ae873350efd0bc496ef97ef4d5da)
targeted editorial indentation. Keep the wrapper rule, sponsor image blocking,
carousel hiding, cookie rules and both clients' share-placeholder rules.

The investigation replayed original HTML for articles 48001, 48080, 48096 and
the home page at 390 and 1280 px in Edge, with publisher CSS and page scripts
removed. Images/fonts were blocked to make the comparison deterministic.
On each article, hiding carousel items left a 27 px sponsor box and a 71 px
gap between the neighboring sections. Hiding the wrapper reduced the box to
zero and the gap to the article's normal 24 px margin, with or without the
NBSP scriptlet. Restoring article BR increased some article-body heights;
it did not restore sponsor gaps. No additional empty ad wrappers were found
in those article bodies. These static measurements are not exact phone layouts.

## Regression checks

`node --test test/firenzedintorni.test.mjs` checks the actual individual and
generated subscriptions. It rejects scriptlet reintroduction and requires the
seven retained rules in their original order, including sponsor-gap collapse.
These are subscription-contract tests, not a browser or blocker emulator.

The browser investigation also checked indented/plain spans, BR separators,
anchors, emphasis, nested spans, images, intentional blank paragraphs and
spans outside article content. Before release, compare the individual list and
bundle on the installed AdGuard Android and full uBO clients. Reload a fresh
document after changing filters: an already flattened DOM cannot regain its
children just from a subscription refresh. Ensure no stale copy of the
scriptlet remains active through another subscription.

## Engine references

- [AdGuard replacement helper](https://github.com/AdguardTeam/Scriptlets/blob/31b68c9a4104506c08df313963d4453931957371/src/helpers/node-text-utils.ts#L101-L120)
- [uBO implementation](https://github.com/gorhill/uBlock/blob/4676ec1fb37c265e1052d3b089bcef4c01e28cec/src/js/resources/scriptlets.js#L87-L212)
- [uBO signature documentation](https://github.com/gorhill/uBlock/wiki/Resources-Library#trusted-replace-node-textjs-)
