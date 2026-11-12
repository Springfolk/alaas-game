// A thing's name, the same everywhere it is shown (docs/content.md "Names"): the Sakha name first, then a short fade
// into the chosen language's. An entry's name in each language is the head of its title (`title.<lang>` up to " — ",
// or `name`); a label's is its own text, less a Sakha word in brackets. The fade belongs to a surface, not to each
// name: `fade(el)` runs it on one element (the prompt, a card, the journal, a toast) and every name inside follows
// it through `--nm` (index.html), so names drawn in later show the same moment and nothing replays.

const head = (t) => String(t || '').split(' — ')[0].trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cache = new WeakMap();

// Sakha in the game's phonetic Latin (docs/content.md "Names"): ө ö, ү ü, ыа e, ҥ ng, ҕ gh, һ h, дь dj, нь ny (ni before ы),
// х kh, ч ch, ы y, й y, э e; long vowels stay doubled.
const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', ҕ: 'gh', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', ҥ: 'ng', о: 'o', ө: 'ö', п: 'p', р: 'r', с: 's', һ: 'h', т: 't', у: 'u', ү: 'ü', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const translit = (s) => String(s || '').replace(/ыа|[дн]ь|[Ѐ-ӿ]/gi, (c, i, all) => {
  const l = c.toLowerCase(), t = l === 'ыа' ? 'e' : l === 'дь' ? 'dj' : l === 'нь' ? (/ы/i.test(all[i + 2] || '') ? 'ni' : 'ny') : LAT[l] ?? c;
  return c[0] === l[0] ? t : cap(t);
});

// { sah, en, ru } of an entry or a label
export function names(x) {
  let n = cache.get(x);
  if (n) return n;
  if (x.title) { const m = x.name || {}; n = { sah: m.sah || head(x.title.sah), en: m.en || head(x.title.en), ru: m.ru || head(x.title.ru) }; }
  else { const bare = (s, d, w) => String(s || d).replace(` (${w})`, ''); n = { sah: x.sah, en: bare(x.en, translit(x.sah), translit(x.sah)), ru: bare(x.ru, x.sah, x.sah) }; }
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
