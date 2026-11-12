// A thing's name, the same everywhere it is shown (docs/content.md "Names"): the Sakha name first, then a short fade
// into the chosen language's. An entry's name in each language is the head of its title (`title.<lang>` up to " — ",
// or `name`); a label's is its own text, less a Sakha word in brackets. The fade belongs to a surface, not to each
// name: `fade(el)` runs it on one element (the prompt, a card, the journal, a toast) and every name inside follows
// it through `--nm` (index.html), so names drawn in later show the same moment and nothing replays.

const head = (t) => String(t || '').split(' — ')[0].trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cache = new WeakMap();

// { sah, en, ru } of an entry or a label
export function names(x) {
  let n = cache.get(x);
  if (n) return n;
  if (x.title) { const m = x.name || {}; n = { sah: m.sah || head(x.title.sah), en: m.en || head(x.title.en), ru: m.ru || head(x.title.ru) }; }
  else { const bare = (s) => String(s || x.sah).replace(` (${x.sah})`, ''); n = { sah: x.sah, en: bare(x.en), ru: bare(x.ru) }; }
  n = { sah: cap(n.sah), en: cap(n.en), ru: cap(n.ru) };
  cache.set(x, n);
  return n;
}
// the name as it ends up in `lang` (plain text: titles, aria labels)
export const nameIn = (x, lang) => (x ? names(x)[lang] || names(x).en : '');
// markup: the Sakha name, and over it the chosen language's (shown as the surface's fade goes); one when they agree
export function nameHTML(x, lang) {
  if (!x) return '';
  const n = names(x), s = n.sah, l = n[lang] || n.en;
  return lang === 'sah' || l === s ? esc(s) : `<span class="nm"><span class="nm-s">${esc(s)}</span><span class="nm-l">${esc(l)}</span></span>`;
}
// Does `lang` show this name as a fade (the surface then runs one)?
export const fades = (x, lang) => !!x && lang !== 'sah' && (names(x)[lang] || names(x).en) !== names(x).sah;

// Run the fade on a surface: 0.9 s of Sakha, then out and the other in over 0.5 s.
const KEYS = [{ '--nm': 0 }, { '--nm': 0, offset: 0.64 }, { '--nm': 1 }];
export function fade(el) {
  el._nm?.cancel();
  el._nm = el.animate ? el.animate(KEYS, { duration: 1400, easing: 'linear', fill: 'backwards' }) : null;
}
