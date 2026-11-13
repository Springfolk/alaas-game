// DOM overlay: look prompt, the inspect stage's type and photographs (the thing itself is the live view:
// src/ui/stage.js), the journal's window (src/ui/journal.js), toasts, and the title's loading bar. Styles live in
// index.html. The windows take the mouse through a drawn cursor while pointer lock stays on (cursor.js).
import ENTRIES from '../data/entries.json';
import { versioned } from '../load/assetv.js';
import { T, LANGS, LANG_NAMES } from './i18n.js';
import { icon, actIcon, MOUSE } from './icons.js';
import { selectHTML } from './select.js';
import { VirtualCursor } from './cursor.js';
import { VIEWS } from './stage.js';
import { Journal } from './journal.js';
import { names, nameHTML, fade } from './names.js';

export const BY_ID = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));
// { entryId: [{ src, w, h, caption: {sah,en,ru}, credit, license, url }] } — optional (src/data/images.json)
const IMAGES = Object.values(import.meta.glob('../data/images.json', { eager: true, import: 'default' }))[0] || {};

const CATS = {
  land: { sah: 'Дойду', en: 'Land', ru: 'Земля' }, dwelling: { sah: 'Дьиэ-уот', en: 'Dwellings', ru: 'Жилища' },
  household: { sah: 'Тэрил', en: 'Household', ru: 'Утварь' }, craft: { sah: 'Уһаныы', en: 'Crafts', ru: 'Ремёсла' },
  food: { sah: 'Аһылык', en: 'Food', ru: 'Еда' }, music: { sah: 'Муусука', en: 'Music', ru: 'Музыка' },
  clothing: { sah: 'Таҥас', en: 'Clothing', ru: 'Одежда' }, animals: { sah: 'Сүөһү', en: 'Herds', ru: 'Стада' },
  belief: { sah: 'Итэҕэл', en: 'Belief', ru: 'Верования' }, rite: { sah: 'Сиэр-туом', en: 'Rites', ru: 'Обряды' },
  calendar: { sah: 'Дьыл кэмнэрэ', en: 'The year', ru: 'Годовой круг' },
};
const L = {
  journal: { sah: 'Бэлиэтээһин', en: 'Journal', ru: 'Дневник' }, found: { sah: 'булулунна', en: 'found', ru: 'найдено' },
  close: { sah: 'сап', en: 'close', ru: 'закрыть' },
  related: { sah: 'Сибээстээх', en: 'Related', ru: 'См. также' }, sources: { sah: 'Сигэлэр', en: 'Sources', ru: 'Источники' },
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const imgSrc = (s) => /^(https?:|data:|\/)/.test(s) ? s : versioned(import.meta.env.BASE_URL + s.replace(/^(\.\/|public\/)/, ''));

// Title loading bar: mirrors main.js's `#go` status line ("45% · stage", then "preparing… 60%").
{
  const go = $('#go'), bar = $('#loadbar'), title = $('#title'), lbl = $('#startlbl');
  if (go && bar) new MutationObserver(() => {
    const t = go.textContent.trim(), m = t.match(/(\d+)%/);
    if (/^failed/i.test(t)) title.classList.add('error');
    if (m) bar.style.setProperty('--p', /^\d+%/.test(t) ? 0.6 * m[1] / 100 : 0.6 + 0.4 * m[1] / 100);
    if (window.game?.ready) { bar.style.setProperty('--p', 1); title.classList.add('ready'); lbl.textContent = t; }
  }).observe(go, { childList: true, characterData: true, subtree: true });
}

export class UI {
  constructor(state) {
    this.state = state; // { lang, found: Set }
    this.prompt = $('#prompt');
    this.pName = $('#prompt .p-name'); this.pTool = $('#prompt .tool'); this.pVerb = $('#prompt .verb'); this.pKey = $('#prompt .p-act .p-key');
    $('#prompt .lens').innerHTML = icon('eye');
    this.putHint = $('#puthint');
    this.fit(); addEventListener('resize', () => this.fit());
    this.card = $('#card');
    this.journal = $('#journal');
    this.lightbox = $('#lightbox');
    this.toasts = $('#toasts');
    this.open = null; // 'card' | 'journal' | null
    this.mode = null; // card: 'peek' | 'full'
    this.img = 0;     // gallery index
    this.images = IMAGES;
    this.menu = false; // the pause menu is up while the pointer stays locked (main.js)
    this.placed = new Set(); // entries found somewhere in the world (others are told of in cards)
    this.cursor = new VirtualCursor(() => this.modal || this.menu);
    this.card.addEventListener('click', (e) => {
      if (e.target.closest('.sel')) return;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) { this.onAction?.(act); return; }
      const t = e.target.closest('[data-entry],[data-img],[data-big],[data-mark],.hero,.st-hero');
      if (!t) return;
      if (t.dataset.big) { this.enlarge(+t.dataset.big); return; } // the reading sheet's photographs
      if (t.dataset.learn) this.onAction?.('learn', t.dataset.entry); // told of only in cards: reading the link finds it
      if (t.dataset.entry) this.onAction?.('open', t.dataset.entry);
      else if (t.dataset.mark) { const m = this.marks?.[+t.dataset.mark]; if (m) this.onAction?.('open', m.entry, m.it); }
      else if (t.dataset.img) this.setImage(+t.dataset.img);
      else this.enlarge();
    });
    // turning the thing: a drag on the open view (a free pointer or a finger; under pointer lock the drawn cursor does it)
    let drag = null;
    this.card.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('[data-orbit]') || document.pointerLockElement) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      e.target.setPointerCapture?.(e.pointerId);
    });
    this.card.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.stage?.orbit(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    for (const k of ['pointerup', 'pointercancel']) this.card.addEventListener(k, (e) => { if (drag?.id === e.pointerId) drag = null; });
    this.cursor.onOrbit = (dx, dy) => this.stage?.orbit(dx, dy);
    this.cursor.onZoom = (d) => this.stage?.zoomBy(d);
    addEventListener('resize', () => { if (this.open === 'card') this.layout(); });
    // a missing reference image just drops out
    this.card.addEventListener('error', (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG') return;
      (img.closest('.st-strip button') || img).remove();
    }, true);
    this.j = new Journal(this, CATS, L.journal); // (src/ui/journal.js; it takes its own clicks and drags)
    this.cursor.onMapPan = (dx, dy) => this.j.cursorPan(dx, dy);
    this.cursor.onMapZoom = (d, x, y) => this.j.cursorZoom(d, x, y);
    this.cursor.onMapTap = (x, y) => this.j.cursorTap(x, y);
    this.lightbox.addEventListener('click', () => this.lightbox.classList.remove('show'));
    addEventListener('wheel', (e) => { // a free pointer over the open view: nearer, further
      if (this.open === 'card' && !document.pointerLockElement && e.target.closest?.('[data-orbit]')) this.stage?.zoomBy(e.deltaY);
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (this.lightbox.classList.contains('show')) this.lightbox.classList.remove('show');
      if (!this.open) return;
      if (e.code === 'PageDown' || e.code === 'PageUp') {
        e.preventDefault();
        const c = this.client();
        this.scroll((e.code === 'PageDown' ? 1 : -1) * (c ? c.clientHeight * 0.85 : 300));
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.scroll(e.code === 'ArrowDown' ? 80 : -80);
      } else if (this.open === 'card' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        this.stage?.orbit(e.code === 'ArrowRight' ? -70 : 70, 0);
      } else if (this.open === 'card' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        this.setImage(this.pic ? this.img + (e.code === 'BracketRight' ? 1 : -1) : this.img);
      }
    });
  }
  t(o) { return o?.[this.state.lang] || o?.en || ''; }
  get isOpen() { return !!this.open; }
  // the journal or a card is up: the player stands still and the mouse drives a cursor
  get modal() { return !!this.open; }
  client() { return this.open === 'journal' ? this.journal.querySelector('.j-list.on') : this.card.querySelector('.client'); }
  scroll(dy, smooth = true) { this.client()?.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' }); }

  // The interface's scale on a big screen (`--ui`, index.html): a desktop larger than 1600×900 gets everything
  // larger by as much; phones stay at 1.
  fit() {
    const k = matchMedia('(pointer: coarse)').matches ? 1 : Math.max(1, Math.min(2.4, innerWidth / 1600, innerHeight / 900));
    this.scale = k;
    document.documentElement.style.setProperty('--ui', k.toFixed(3));
  }

  // The look prompt (index.html `#prompt`): the thing's name under the dot; to the dot's left the blue lens (E) when
  // it can be looked at closer; to its right the green plate with the tool and the verb of what the hands would do
  // now (`act`, a tap). `put`: what is carried can be put down.
  // Its parts stay in the page and only change their content: the touch controls take touches on them.
  // `label`: the thing's name (an entry or a label: src/ui/names.js; a new one restarts the fade).
  setPrompt(label, { act = null, read = false, put = null } = {}) {
    const on = !!(label || act);
    this.prompt.className = `${on ? 'show' : ''}${act ? ' has-act' : ''}${read ? ' has-read' : ''}`;
    if (on) {
      const lang = this.state.lang, key = `${typeof label === 'string' ? label : label ? names(label).sah : ''}|${lang}`;
      if (key !== this.pKeyName) {
        this.pKeyName = key;
        this.pName.innerHTML = typeof label === 'string' ? label : nameHTML(label, lang);
        if (label) fade(this.pName);
      }
      const k = act ? actIcon(act) : '';
      if (k !== this.pIcon) { this.pIcon = k; this.pTool.innerHTML = k ? icon(k) : ''; }
      const verb = act ? this.t(act.label) : '';
      this.pVerb.textContent = verb.charAt(0).toUpperCase() + verb.slice(1); // (labels are written in either case)
      if (!this.pKey.firstChild) this.pKey.innerHTML = MOUSE.left;
    }
    const pk = put ? actIcon(put) : '';
    if (pk !== this.putIcon) { this.putIcon = pk; this.putHint.innerHTML = pk ? `${icon(pk)}<span class="p-key">${MOUSE.right}</span>` : ''; this.putHint.classList.toggle('show', !!pk); }
  }

  // The inspect stage's interface (docs/ui.md): the thing itself fills the view (src/ui/stage.js moves the eye
  // there) and the type is set straight on the picture: its Sakha name, one line, its reference photographs as
  // a strip to compare with, the names of the things round it. mode 'peek' = that; 'full' = the reading sheet
  // too (title, text, facts, related, sources). kind: what the stage shows ('near' | 'out' | 'here' | 'photo').
  showEntry(id, { mode = 'peek', kind = this.kind, fresh = false } = {}) {
    const e = BY_ID[id];
    if (!e) return;
    const lang = this.state.lang, full = mode === 'full';
    const again = this.open === 'card' && this.current === id;
    if (!again) { this.img = 0; this.pic = false; this.fresh = fresh; }
    this.kind = kind;
    const imgs = this.images[id] || [], photo = kind === 'photo';
    const kb = (k) => `<kbd class="kb">${k}</kbd>`;
    const say = VIEWS[id]?.say;
    const rel = (e.related || []).filter((r) => BY_ID[r]).map((r) => {
      const known = this.state.found.has(r), told = !known && !this.placed.has(r);
      if (told) return `<button class="chip told" data-entry="${r}" data-learn="1">${nameHTML(BY_ID[r], lang)}</button>`;
      return `<button class="chip${known ? '' : ' unknown'}" ${known ? `data-entry="${r}"` : 'disabled'}>${known ? nameHTML(BY_ID[r], lang) : '· · ·'}</button>`;
    }).join('');
    const facts = (e.facts[lang] || e.facts.en || []).map((f) => `<li>${esc(f)}</li>`).join('');
    const tl = this.t(e.title), th = names(e)[lang], title = !e.name && tl.startsWith(th) ? nameHTML(e, lang) + esc(tl.slice(th.length)) : esc(tl);
    this.card.innerHTML = `
      <div class="st-orbit" data-orbit>${photo && imgs.length ? '<img class="st-hero" alt="">' : ''}</div>
      <div class="st-marks"></div>
      <div class="st-col"><div class="st-pane glass win">
        <button class="win-close" data-act="close" title="${esc(this.t(L.close))}" aria-label="${esc(this.t(L.close))}"></button>
        <div class="st-head win-head">
          <div class="cat">${this.fresh ? '<i class="gmark"></i>' : ''}${esc(this.t(CATS[e.category]) || e.category)}</div>
          <h2>${nameHTML(e, lang)}</h2>
        </div>
        <div class="st-body st-show">
          <figure class="st-fig"></figure>
          <p class="lead">${esc(this.t(e.short))}</p>
          ${say ? `<p class="say">${esc(this.t(say))}</p>` : ''}
        </div>
        ${imgs.length ? `<div class="st-strip">${imgs.map((m, k) => `<button data-img="${k}"><img src="${esc(imgSrc(m.src))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        <div class="st-read"><div class="client">
          <h3>${title}</h3>
          <p class="lead">${esc(this.t(e.short))}</p>
          ${say ? `<p class="say">${esc(this.t(say))}</p>` : ''}
          ${imgs.length ? `<div class="rd-gal">${imgs.map((m, k) => `<button data-big="${k}"><img src="${esc(imgSrc(m.src))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
          <p>${esc(this.t(e.body))}</p>
          ${facts ? `<ul class="facts">${facts}</ul>` : ''}
          ${rel ? `<div class="rel"><span>${esc(this.t(L.related))}</span>${rel}</div>` : ''}
          <details class="src"><summary>${esc(this.t(L.sources))}</summary>${(e.sources || []).map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\//, '').slice(0, 70))}</a>`).join('')}</details>
        </div></div>
        <div class="st-go">
          <button class="btn primary" data-act="more">${kb('E')} ${esc(this.t(full ? L.close : T.readMore))}</button>
          ${this.langSelect()}
        </div>
      </div></div>`;
    if (!again) fade(this.card);
    this.card.className = `layer stage show k-${kind || 'near'}${full ? ' read' : ''}${again ? ' again' : ''}`;
    document.documentElement.classList.add('carded');
    this.open = 'card';
    this.mode = full ? 'full' : 'peek';
    this.current = id;
    this.marks = null; // the names round it: asked of the stage on the next frame (frame())
    this.setImage(this.img, this.pic || photo);
    this.layout();
    this.cursor.sync();
  }
  // the language as a select: the three by their own names, the current one ticked (src/ui/select.js)
  langSelect(up = true) { return `<span class="sel${up ? ' up' : ''}" data-sel="lang" title="${esc(this.t(T.language))}">${selectHTML(LANGS.map((l) => [l, LANG_NAMES[l]]), this.state.lang)}</span>`; }

  // The reference photograph `i` beside the thing (`show`: opened; a second pick of the same one puts it away).
  setImage(i, show = true) {
    const imgs = this.images[this.current] || [], fig = this.card.querySelector('.st-fig');
    if (!fig || !imgs.length) return;
    const photo = this.kind === 'photo';
    i = (i + imgs.length) % imgs.length;
    if (show && this.pic && i === this.img && !photo && this.card.classList.contains('pic')) show = false;
    this.img = i; this.pic = show;
    const im = imgs[i], cap = im.caption?.[this.state.lang] || im.caption?.en || '';
    const hero = this.card.querySelector('.st-hero');
    if (hero) hero.src = imgSrc(im.src);
    fig.innerHTML = show ? `${photo ? '' : `<button class="hero"><img src="${esc(imgSrc(im.src))}" ${im.w ? `width="${im.w}" height="${im.h}"` : ''} alt="${esc(cap)}"></button>`}
      <figcaption>${this.capHTML(im)}</figcaption>` : '';
    this.card.classList.toggle('pic', show && !photo);
    for (const b of this.card.querySelectorAll('.st-strip button')) b.classList.toggle('on', show && +b.dataset.img === i);
    this.layout();
  }
  capHTML(im) {
    const cap = im.caption?.[this.state.lang] || im.caption?.en || '';
    const credit = [im.credit, im.license && (im.url ? `<a href="${esc(im.url)}" target="_blank" rel="noopener">${esc(im.license)}</a>` : esc(im.license))].filter(Boolean);
    return `${esc(cap)}${credit.length ? `<span class="credit">${credit.map((c, k) => k ? c : esc(c)).join(' · ')}</span>` : ''}`;
  }
  // Where the thing sits on screen: the part of the view the type leaves free (the stage frames it there).
  layout() {
    const col = this.card.querySelector('.st-col');
    if (!col || !this.stage) return;
    const W = innerWidth, H = innerHeight, r = col.getBoundingClientRect();
    if (H > W * 1.05) { // portrait: the thing above, the type below
      const top = Math.min(70, H * 0.09), bot = Math.max(top + H * 0.2, r.top);
      this.free = { l: 0, t: top, r: W, b: bot };
    } else this.free = { l: 0, t: 0, r: Math.max(W * 0.3, r.left), b: H };
    const f = this.free;
    Object.assign(this.stage.area, { x: (f.l + f.r) / W - 1, y: 1 - (f.t + f.b) / H, w: (f.r - f.l) / W * 0.86, h: (f.b - f.t) / H * 0.8 });
    this.card.style.setProperty('--free-r', `${W - f.r}px`); this.card.style.setProperty('--free-b', `${H - f.b}px`);
  }
  // each frame while a card is up: the names round the thing follow their places
  frame() {
    if (this.open !== 'card' || !this.stage?.on) return;
    const box = this.card.querySelector('.st-marks'), st = this.stage;
    if (!box) return;
    if (!this.marks) {
      this.marks = st.marks(this.state.found);
      box.innerHTML = this.marks.map((m, k) => `<button class="st-mark" data-mark="${k}"><i></i>${nameHTML(m.label || BY_ID[m.entry], this.state.lang)}</button>`).join('');
      this.markEls = [...box.children];
      for (const el of this.markEls) { el.classList.add('msr'); el._w = el.offsetWidth; el._h = el.offsetHeight; el.classList.remove('msr'); } // (both names of a fade share one box: its width is the longer)
    }
    // each name on its dot, its text to the right, or to the left at the right edge; inside the free part of the view,
    // clear of the lesson and of the names already placed (nearest first)
    const f = this.free, o = {}, keep = [], t = document.getElementById('teach');
    if (t && t.offsetParent) { const r = t.getBoundingClientRect(); if (r.width) keep.push(r); }
    for (let k = 0; k < this.marks.length; k++) {
      const el = this.markEls[k], p = st.s?.t >= 1 && !st.closing && st.project(this.marks[k].p, o);
      let on = !!p && p.x > f.l + 8 && p.x < f.r - 8 && p.y > f.t + 8 && p.y < f.b - 8, left = false, x = 0;
      if (on) {
        left = p.x - 6 + el._w > f.r - 4;
        x = left ? p.x + 6 - el._w : p.x - 6;
        const r = { left: x - 3, right: x + el._w + 3, top: p.y - el._h / 2 - 2, bottom: p.y + el._h / 2 + 2 };
        on = x >= f.l + 4 && r.top >= f.t && r.bottom <= f.b && !keep.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
        if (on) keep.push(r);
      }
      if (on !== el._on) { el._on = on; el.classList.toggle('on', on); }
      if (left !== el._l) { el._l = left; el.classList.toggle('l', left); }
      if (on) el.style.transform = `translate(${Math.round(x)}px,${Math.round(p.y - el._h / 2)}px)`;
    }
  }
  // the photograph `i` (the one shown) over everything, with its caption and credit
  enlarge(i = this.img) {
    const im = (this.images[this.current] || [])[i];
    if (!im) return;
    this.lightbox.innerHTML = `<img src="${esc(imgSrc(im.src))}" alt=""><div class="cap">${this.capHTML(im)}</div>`;
    this.lightbox.classList.add('show');
  }

  // The journal (src/ui/journal.js): the map, the finds, the work. `tab`: which leaf (none: the last one);
  // `here`: the map comes up round the player.
  showJournal(tab, here = false) {
    this.card.classList.remove('show');
    this.journal.classList.add('show');
    if (this.open !== 'journal') fade(this.journal);
    this.open = 'journal';
    this.j.show(tab, here);
    this.cursor.sync();
  }

  setMenu(on) { this.menu = on; this.cursor.sync(); }

  close() {
    if (this.open === 'journal') this.j.tiles.clear(); // (their pictures go)
    this.card.classList.remove('show');
    this.journal.classList.remove('show');
    this.lightbox.classList.remove('show');
    this.card.innerHTML = '';
    document.documentElement.classList.remove('carded');
    this.open = null;
    this.mode = null;
    this.cursor.sync();
  }

  toggleLang() {
    this.state.lang = { sah: 'en', en: 'ru', ru: 'sah' }[this.state.lang] || 'sah';
    if (this.open === 'card') this.showEntry(this.current, { mode: this.mode });
    else if (this.open === 'journal') this.showJournal();
  }

  // A beat (docs/ui.md), no window: `html` is its body. A saying (`say`): a caption low in the view, a <b> line
  // and a <small> by-line.
  toast(html, ms = 3600, cls = 'say') {
    const d = document.createElement('div');
    d.className = 'toast pane ' + cls;
    d.innerHTML = html;
    if (d.querySelector('.nm')) fade(d);
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 700);
  }
  // found by doing: the thing's own picture (the journal's) and its name, by the journal's corner
  discovered(id) {
    const e = BY_ID[id], v = VIEWS[id] || {}, im = this.images[id]?.[0];
    const src = v.photo ? im && imgSrc(im.src) : imgSrc(`assets/ui/journal/${id}.webp`);
    this.toast(`<b>${nameHTML(e, this.state.lang)}</b>${src ? `<img src="${esc(src)}" alt="">` : '<span class="gmark"></span>'}`, 2600, 'found');
  }
}
