// DOM overlay: look prompt, the inspect stage's type and photographs (the thing itself is the live view:
// src/ui/stage.js), journal (Бэлиэтээһин), Messenger-style toasts, and the title's loading bar. Styles live in
// index.html. The windows take the mouse through a drawn cursor while pointer lock stays on (cursor.js).
import ENTRIES from '../data/entries.json';
import HINTS from '../data/hints.json';
import { versioned } from '../load/assetv.js';
import { T, LANGS, LANG_NAMES } from './i18n.js';
import { icon, actIcon, actHeld, MOUSE } from './icons.js';
import { selectHTML } from './select.js';
import { VirtualCursor } from './cursor.js';
import { WORKS } from '../interact/work/list.js';
import { VIEWS } from './stage.js';
import JOURNAL from '../data/journal.json';

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
const JOB_PICS = { split: 'work-split', hay: 'work-hay', tuos: 'work-tuos', gather: 'work-gather' }; // a job's own picture; the others show their entry's
const L = {
  journal: { sah: 'Бэлиэтээһин', en: 'Journal', ru: 'Дневник' }, found: { sah: 'булулунна', en: 'found', ru: 'найдено' },
  close: { sah: 'сап', en: 'close', ru: 'закрыть' },
  related: { sah: 'Сибээстээх', en: 'Related', ru: 'См. также' }, sources: { sah: 'Сигэлэр', en: 'Sources', ru: 'Источники' },
  guideHow: { sah: '«?» тал — бэлиэ онно сирдиэ.', en: 'Pick a “?” and a marker will lead you there.', ru: 'Выберите «?», и метка приведёт вас туда.' },
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
      if (e.target.closest('.sel')) return;
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
      if (e.target.closest('.sel') || winAct(e)) return;
      const job = e.target.closest('[data-job]');
      if (job) { const j = WORKS.find((x) => x.id === job.dataset.job); this.keepScroll(() => this.showJournal(j.done(this.state.work || {}) ? j.stat(this.state.work) : j.where)); return; } // where a job waits, in words, only when asked
      const r = e.target.closest('[data-entry]');
      if (r && this.state.found.has(r.dataset.entry)) this.onAction?.('open', r.dataset.entry, null, 'journal');
      else if (r) { this.jsay = null; this.onAction?.('guide', r.dataset.entry); }
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
  client() { return this.open === 'journal' ? this.journal.querySelector('.jr-scroll') : this.card.querySelector('.client'); }
  keepScroll(fn) { const top = this.client()?.scrollTop; fn(); const c = this.client(); if (c && top) c.scrollTop = top; }
  scroll(dy, smooth = true) { this.client()?.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' }); }

  // The interface's scale on a big screen (`--ui`, index.html): a desktop larger than 1600×900 gets everything
  // larger by as much; phones stay at 1.
  fit() {
    const k = matchMedia('(pointer: coarse)').matches ? 1 : Math.max(1, Math.min(2.4, innerWidth / 1600, innerHeight / 900));
    document.documentElement.style.setProperty('--ui', k.toFixed(3));
  }

  // The look prompt (index.html `#prompt`): the thing's name under the dot; to the dot's left the blue lens (E) when
  // it can be looked at closer; to its right the green plate with the tool and the verb of what the hands would do
  // now (`act`; a bar by the mouse glyph: the motion lasts while held). `put`: what is carried can be put down.
  // Its parts stay in the page and only change their content: the touch controls take touches on them.
  setPrompt(label, { act = null, read = false, put = null } = {}) {
    const on = !!(label || act);
    this.prompt.className = `${on ? 'show' : ''}${act ? ' has-act' : ''}${read ? ' has-read' : ''}${actHeld(act) ? ' held' : ''}`;
    if (on) {
      this.pName.textContent = label || '';
      const k = act ? actIcon(act) : '';
      if (k !== this.pIcon) { this.pIcon = k; this.pTool.innerHTML = k ? icon(k) : ''; }
      this.pVerb.textContent = act ? this.t(act.label) : '';
      if (!this.pKey.firstChild) this.pKey.innerHTML = `${MOUSE.left}<i class="hold"></i>`;
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
      if (told) return `<button class="chip told" data-entry="${r}" data-learn="1">${esc(head(BY_ID[r]))}</button>`;
      return `<button class="chip${known ? '' : ' unknown'}" ${known ? `data-entry="${r}"` : 'disabled'}>${esc(known ? head(BY_ID[r]) : '· · ·')}</button>`;
    }).join('');
    const facts = (e.facts[lang] || e.facts.en || []).map((f) => `<li>${esc(f)}</li>`).join('');
    const rest = e.sah.slice(head(e).length).replace(/^[;\s]+/, '');
    this.card.innerHTML = `
      <div class="st-orbit" data-orbit>${photo && imgs.length ? '<img class="st-hero" alt="">' : ''}</div>
      <div class="st-marks"></div>
      <div class="st-col"><div class="st-pane glass win">
        <button class="win-close" data-act="close" title="${esc(this.t(L.close))}" aria-label="${esc(this.t(L.close))}"></button>
        <div class="st-head win-head">
          <div class="cat">${this.fresh ? '<i class="gmark"></i>' : ''}${esc(this.t(CATS[e.category]) || e.category)}</div>
          <h2>${esc(head(e))}</h2>
          <div class="sub">${rest ? `<span class="more">${esc(rest)}</span> ` : ''}${esc(e.translit || '')}${e.ru ? ` · <span class="ru">${esc(e.ru)}</span>` : ''}</div>
        </div>
        <div class="st-body st-show">
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
          ${this.langSelect()}
        </div>
      </div></div>`;
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

  // The journal (docs/ui.md): what was found, as pictures of the things themselves (baked from the game:
  // tools/bake-journal.mjs; an idea: its photograph) on the homestead seen from above and in rows by kind. What is not
  // found yet is a dim blur with a "?": choosing one starts the finder (src/ui/guide.js) and shows where to look.
  // The work log: a picture per job with what the hands have done.
  showJournal(say = this.jsay) {
    const n = this.state.found.size, found = this.state.found, pic = (name) => esc(imgSrc(`assets/ui/journal/${name}.webp`));
    const thumb = (id, known) => {
      const v = VIEWS[id] || {}, im = this.images[id]?.[0];
      if (v.photo) return known && im ? `<img src="${esc(imgSrc(im.src))}" alt="" loading="lazy">` : '';
      return `<img src="${pic(known ? id : id + '.s')}" alt="" loading="lazy">`;
    };
    const tile = (e) => {
      const k = found.has(e.id), on = !k && this.guided === e.id;
      return k ? `<button class="jt" data-entry="${e.id}">${thumb(e.id, true)}<b>${esc(head(e))}</b></button>`
        : `<button class="jt q${on ? ' on' : ''}" data-entry="${e.id}" aria-label="?">${thumb(e.id, false)}<i>${on ? '<span class="gmark"></span>' : '?'}</i></button>`;
    };
    // the homestead from above: a dot where a found thing is, a "?" where one waits (places out of the picture sit on its edge)
    const m = JOURNAL.map, pins = [];
    for (const e of ENTRIES) {
      const p = this.placeOf?.(e.id);
      if (!p) continue;
      const v = m.vp, w = v[3] * p.x + v[7] * p.y + v[11] * p.z + v[15];
      let x = (v[0] * p.x + v[4] * p.y + v[8] * p.z + v[12]) / Math.abs(w), y = (v[1] * p.x + v[5] * p.y + v[9] * p.z + v[13]) / Math.abs(w);
      if (w < 0) { x = -x * 9; y = 9; }
      const far = Math.abs(x) > 0.94 || Math.abs(y) > 0.9, k = far ? Math.min(0.94 / Math.abs(x || 1e-6), 0.9 / Math.abs(y || 1e-6)) : 1;
      const kn = found.has(e.id), on = !kn && this.guided === e.id;
      pins.push(`<button class="jp${kn ? '' : ' q'}${on ? ' on' : ''}${far ? ' far' : ''}" data-entry="${e.id}" style="left:${((x * k + 1) * 50).toFixed(1)}%;top:${((1 - y * k) * 50).toFixed(1)}%" aria-label="${esc(kn ? head(e) : '?')}">${on ? '<span class="gmark"></span>' : kn ? '' : '?'}</button>`);
    }
    const groups = {};
    for (const e of ENTRIES) (groups[e.category] ||= []).push(e);
    let rows = '';
    for (const cat of Object.keys(CATS)) if (groups[cat]) rows += `<h4>${esc(this.t(CATS[cat]))}</h4><div class="jg">${groups[cat].map(tile).join('')}</div>`;
    // the work log: what the hands have done (counts from the save)
    const w = this.state.work || {};
    rows += `<h4>${esc(this.t(L.work))}</h4><div class="jg work">${WORKS.map((job) => {
      const done = job.done(w), name = JOB_PICS[job.id] || job.entry;
      return `<button class="jt job${done ? '' : ' q'}" data-job="${job.id}"><img src="${pic(done ? name : name + '.s')}" alt="" loading="lazy"><b>${esc(this.t(job.name))}${done ? `<small>${esc(this.t(job.stat(w)))}</small>` : ''}</b></button>`;
    }).join('')}</div>`;
    const g = this.guided && BY_ID[this.guided];
    const line = say ? esc(this.t(say)) : g ? `<span class="gmark"></span>${esc(this.t(HINTS[g.id]))}` : n < ENTRIES.length ? esc(this.t(L.guideHow)) : '';
    this.journal.innerHTML = `<div class="jr">
      <div class="jr-head"><h2>${esc(this.t(L.journal))}</h2>
        <div class="count"><div class="bar"><i style="--p:${n / ENTRIES.length}"></i></div><span><b>${n}</b> / ${ENTRIES.length}</span></div>
        ${this.langSelect(false)}</div>
      <button class="win-close" data-act="close" title="${esc(this.t(L.close))}" aria-label="${esc(this.t(L.close))}"></button>
      <div class="jr-main">
        <div class="jr-map"><img src="${pic('map')}" alt="">${pins.join('')}</div>
        <div class="jr-scroll">${rows}</div>
      </div>
      <div class="jr-say">${line}</div>
    </div>`;
    this.jsay = say;
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
    this.jsay = null;
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
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 700);
  }
  // found by doing: the thing's own picture (the journal's) and its name, by the journal's corner
  discovered(id) {
    const e = BY_ID[id], v = VIEWS[id] || {}, im = this.images[id]?.[0];
    const src = v.photo ? im && imgSrc(im.src) : imgSrc(`assets/ui/journal/${id}.webp`);
    this.toast(`<b>${esc(head(e))}</b>${src ? `<img src="${esc(src)}" alt="">` : '<span class="gmark"></span>'}`, 2600, 'found');
  }
}
