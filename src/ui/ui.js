// DOM overlay: look prompt, the inspect stage's type and photographs (the thing itself is the live view:
// src/ui/stage.js), journal (Бэлиэтээһин), Messenger-style toasts, and the title's loading bar. Styles live in
// index.html. The windows take the mouse through a drawn cursor while pointer lock stays on (cursor.js).
import ENTRIES from '../data/entries.json';
import HINTS from '../data/hints.json';
import { versioned } from '../load/assetv.js';
import { T, MOUSE } from './i18n.js';
import { VirtualCursor } from './cursor.js';
import { WORKS } from '../interact/work/list.js';
import { VIEWS } from './stage.js';

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
const NEXT = { sah: 'English', en: 'Русский', ru: 'Сахалыы' };
const L = {
  journal: { sah: 'Бэлиэтээһин', en: 'Journal', ru: 'Дневник' }, found: { sah: 'булулунна', en: 'found', ru: 'найдено' },
  close: { sah: 'сап', en: 'close', ru: 'закрыть' },
  related: { sah: 'Сибээстээх', en: 'Related', ru: 'См. также' }, sources: { sah: 'Сигэлэр', en: 'Sources', ru: 'Источники' },
  newEntry: { sah: 'Бэлиэтээһиҥҥэ киирдэ', en: 'Added to the journal', ru: 'Добавлено в дневник' },
  guideHow: { sah: '«?» тал — бэлиэ онно сирдиэ.', en: 'Pick a “?” and a marker will lead you there.', ru: 'Выберите «?», и метка приведёт вас туда.' },
  guiding: { sah: 'Сирдэтэ', en: 'Guiding', ru: 'Ведёт' },
  work: { sah: 'Үлэ', en: 'Work', ru: 'Работа' },
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const head = (e) => e.sah.split(/[;(]/)[0].trim();
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
    this.card = $('#card');
    this.journal = $('#journal');
    this.lightbox = $('#lightbox');
    this.toasts = $('#toasts');
    this.open = null; // 'card' | 'journal' | null
    this.mode = null; // card: 'peek' | 'full'
    this.img = 0;     // gallery index
    this.images = IMAGES;
    this.menu = false; // the pause menu is up while the pointer stays locked (main.js)
    this.guided = null; // the entry the finder points at (src/ui/guide.js)
    this.placed = new Set(); // entries found somewhere in the world (others are told of in cards)
    this.cursor = new VirtualCursor(() => this.modal || this.menu);
    // window buttons (close, language) and a click on the dim backdrop round the journal
    const winAct = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act || (e.target === e.currentTarget && 'close');
      if (a) this.onAction?.(a); // set by main.js: 'close' | 'lang'
      return !!a;
    };
    this.card.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) { this.onAction?.(act); return; }
      const t = e.target.closest('[data-entry],[data-img],[data-mark],.hero,.st-hero');
      if (!t) return;
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
    this.journal.addEventListener('click', (e) => {
      if (winAct(e)) return;
      const r = e.target.closest('[data-entry]');
      if (r && this.state.found.has(r.dataset.entry)) this.onAction?.('open', r.dataset.entry, null, 'journal');
      else if (r) this.onAction?.('guide', r.dataset.entry);
    });
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
  client() { return (this.open === 'journal' ? this.journal : this.card).querySelector('.client'); }
  scroll(dy, smooth = true) { this.client()?.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' }); }

  // The look prompt: the thing's name; with `act` the hands' glyph and what they would do; with `read` the E chip
  // (it has a card). Touch shows no glyphs: its hand and eye buttons light up instead.
  setPrompt(label, action, { act = false, read = false } = {}) {
    if (!label) { this.prompt.classList.remove('show'); return; }
    this.prompt.innerHTML = `<span class="what">${esc(label)}</span>${act ? `${MOUSE.left}${action ? `<span class="act">${esc(action)}</span>` : ''}` : ''}${read ? '<span class="key kb">E</span>' : ''}`;
    this.prompt.classList.add('show');
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
      if (told) return `<button class="chip told" data-entry="${r}" data-learn="1">${esc(head(BY_ID[r]))}</button>`;
      return `<button class="chip${known ? '' : ' unknown'}" ${known ? `data-entry="${r}"` : 'disabled'}>${esc(known ? head(BY_ID[r]) : '· · ·')}</button>`;
    }).join('');
    const facts = (e.facts[lang] || e.facts.en || []).map((f) => `<li>${esc(f)}</li>`).join('');
    const rest = e.sah.slice(head(e).length).replace(/^[;\s]+/, '');
    this.card.innerHTML = `
      <div class="st-orbit" data-orbit>${photo && imgs.length ? '<img class="st-hero" alt="">' : ''}</div>
      <div class="st-marks"></div>
      <button class="st-x" data-act="close" title="${esc(this.t(L.close))}" aria-label="${esc(this.t(L.close))}"></button>
      <div class="st-col">
        <div class="st-head">
          <div class="cat">${this.fresh ? '<i class="gmark"></i>' : ''}${esc(this.t(CATS[e.category]) || e.category)}</div>
          <h2>${esc(head(e))}</h2>
          <div class="sub">${rest ? `<span class="more">${esc(rest)}</span> ` : ''}${esc(e.translit || '')}${e.ru ? ` · <span class="ru">${esc(e.ru)}</span>` : ''}</div>
        </div>
        <div class="st-show">
          <figure class="st-fig"></figure>
          <p class="lead">${esc(this.t(e.short))}</p>
          ${say ? `<p class="say">${esc(this.t(say))}</p>` : ''}
        </div>
        ${imgs.length ? `<div class="st-strip">${imgs.map((m, k) => `<button data-img="${k}"><img src="${esc(imgSrc(m.src))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        <div class="st-read"><div class="client">
          <h3>${esc(this.t(e.title))}</h3>
          <p class="lead">${esc(this.t(e.short))}</p>
          ${say ? `<p class="say">${esc(this.t(say))}</p>` : ''}
          <p>${esc(this.t(e.body))}</p>
          ${facts ? `<ul class="facts">${facts}</ul>` : ''}
          ${rel ? `<div class="rel"><span>${esc(this.t(L.related))}</span>${rel}</div>` : ''}
          <details class="src"><summary>${esc(this.t(L.sources))}</summary>${(e.sources || []).map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\//, '').slice(0, 70))}</a>`).join('')}</details>
        </div></div>
        <div class="st-go">
          <button class="btn primary" data-act="more">${kb('E')} ${esc(this.t(full ? L.close : T.readMore))}</button>
          ${this.langButton()}
        </div>
      </div>`;
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
  closeButton() { return `<button class="win-close" data-act="close" title="${esc(this.t(L.close))}" aria-label="${esc(this.t(L.close))}"></button>`; }
  langButton() { return `<button class="win-lang" data-act="lang"><kbd>L</kbd> ${esc(NEXT[this.state.lang])}</button>`; }

  // The reference photograph `i` beside the thing (`show`: opened; a second pick of the same one puts it away).
  setImage(i, show = true) {
    const imgs = this.images[this.current] || [], fig = this.card.querySelector('.st-fig');
    if (!fig || !imgs.length) return;
    const photo = this.kind === 'photo';
    i = (i + imgs.length) % imgs.length;
    if (show && this.pic && i === this.img && !photo && this.card.classList.contains('pic')) show = false;
    this.img = i; this.pic = show;
    const im = imgs[i], lang = this.state.lang, cap = im.caption?.[lang] || im.caption?.en || '';
    const credit = [im.credit, im.license && (im.url ? `<a href="${esc(im.url)}" target="_blank" rel="noopener">${esc(im.license)}</a>` : esc(im.license))].filter(Boolean);
    const hero = this.card.querySelector('.st-hero');
    if (hero) hero.src = imgSrc(im.src);
    fig.innerHTML = show ? `${photo ? '' : `<button class="hero"><img src="${esc(imgSrc(im.src))}" ${im.w ? `width="${im.w}" height="${im.h}"` : ''} alt="${esc(cap)}"></button>`}
      <figcaption>${esc(cap)}${credit.length ? `<span class="credit">${credit.map((c, k) => k ? c : esc(c)).join(' · ')}</span>` : ''}</figcaption>` : '';
    this.card.classList.toggle('pic', show && !photo);
    for (const b of this.card.querySelectorAll('.st-strip button')) b.classList.toggle('on', show && +b.dataset.img === i);
    this.layout();
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
      box.innerHTML = this.marks.map((m, k) => `<button class="st-mark" data-mark="${k}"><i></i>${esc(m.label ? this.t(m.label) : head(BY_ID[m.entry]))}</button>`).join('');
      this.markEls = [...box.children];
    }
    const f = this.free, o = {};
    for (let k = 0; k < this.marks.length; k++) {
      const el = this.markEls[k], p = st.s?.t >= 1 && !st.closing && st.project(this.marks[k].p, o);
      const on = !!p && p.x > f.l + 12 && p.x < f.r - 40 && p.y > f.t + 8 && p.y < f.b - 16;
      if (on !== el._on) { el._on = on; el.classList.toggle('on', on); }
      if (on) el.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;
    }
  }
  enlarge() {
    const im = (this.images[this.current] || [])[this.img];
    if (!im) return;
    const fig = this.card.querySelector('.st-fig figcaption');
    this.lightbox.innerHTML = `<img src="${esc(imgSrc(im.src))}" alt=""><div class="cap">${fig ? fig.innerHTML : ''}</div>`;
    this.lightbox.classList.add('show');
  }

  showJournal() {
    const groups = {};
    for (const e of ENTRIES) (groups[e.category] ||= []).push(e);
    const n = this.state.found.size;
    let html = `<div class="win glass"><div class="win-head">${this.closeButton()}<span class="orb"></span><h2>${esc(this.t(L.journal))}</h2>
      <div class="count"><div class="bar"><i style="--p:${n / ENTRIES.length}"></i></div>${n} / ${ENTRIES.length} ${esc(this.t(L.found))}</div>${this.langButton()}</div><div class="client">
      ${n < ENTRIES.length ? `<p class="jhow">${esc(this.t(L.guideHow))}</p>` : ''}`;
    for (const cat of Object.keys(CATS)) {
      const list = groups[cat];
      if (!list) continue;
      html += `<h4>${esc(this.t(CATS[cat]))}</h4><div class="grid">`;
      for (const e of list) {
        const k = this.state.found.has(e.id);
        const on = !k && this.guided === e.id;
        html += k ? `<button class="tile" data-entry="${e.id}"><b>${esc(head(e))}</b><small>${esc(this.t(e.title).split(' — ')[1] || '')}</small></button>`
          : `<button class="tile unknown hint${on ? ' on' : ''}" data-entry="${e.id}"><b>${on ? `<i class="gmark"></i>${esc(this.t(L.guiding))}` : '?'}</b><small>${esc(this.t(HINTS[e.id]))}</small></button>`;
      }
      html += '</div>';
    }
    // the work log: what the hands have done (counts from the save), or where a job waits
    const w = this.state.work || {};
    html += `<h4>${esc(this.t(L.work))}</h4><div class="grid">`;
    for (const job of WORKS) {
      const done = job.done(w);
      html += `<div class="tile work${done ? '' : ' unknown'}"><b>${esc(this.t(job.name))}</b><small>${esc(this.t(done ? job.stat(w) : job.where))}</small></div>`;
    }
    html += '</div>';
    html += `<div class="foot"><span><kbd>J</kbd> ${esc(this.t(L.close))}</span></div></div></div>`;
    this.journal.innerHTML = html;
    this.card.classList.remove('show');
    this.journal.classList.add('show');
    this.open = 'journal';
    this.cursor.sync();
  }

  setMenu(on) { this.menu = on; this.cursor.sync(); }

  close() {
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

  // A Messenger-style pop-up, bottom right. `html` is the body (a <small> line and a <b> line).
  toast(html, ms = 3600) {
    const d = document.createElement('div');
    d.className = 'toast glass';
    d.innerHTML = `<div class="t-head"><span class="orb"></span>Алаас</div><div class="t-body">${html}</div>`;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 800);
  }

  discovered(id) {
    const e = BY_ID[id];
    this.toast(`<small>${esc(this.t(L.newEntry))}</small><b>${esc(head(e))}</b>`);
  }
}
