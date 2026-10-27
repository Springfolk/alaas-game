// DOM overlay: look prompt, explainer card (peek = side panel, full = centred window with a reference-image
// gallery), journal (Бэлиэтээһин), Messenger-style toasts, and the title's loading bar. Styles live in
// index.html. The windows take the mouse through a drawn cursor while pointer lock stays on (cursor.js).
import ENTRIES from '../data/entries.json';
import HINTS from '../data/hints.json';
import { T } from './i18n.js';
import { VirtualCursor } from './cursor.js';

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
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const head = (e) => e.sah.split(/[;(]/)[0].trim();
const imgSrc = (s) => /^(https?:|data:|\/)/.test(s) ? s : import.meta.env.BASE_URL + s.replace(/^(\.\/|public\/)/, '');

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
    // window buttons (close, language) and a click on the dim backdrop round a centred window
    const winAct = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act || (e.target === e.currentTarget && 'close');
      if (a) this.onAction?.(a); // set by main.js: 'close' | 'lang'
      return !!a;
    };
    this.card.addEventListener('click', (e) => {
      if (winAct(e)) return;
      const t = e.target.closest('[data-entry],[data-img],.hero');
      if (!t) return;
      if (t.dataset.learn) this.onAction?.('learn', t.dataset.entry); // told of only in cards: reading the link finds it
      if (t.dataset.entry) this.showEntry(t.dataset.entry, { mode: 'full' });
      else if (t.dataset.img) this.setImage(+t.dataset.img);
      else this.enlarge();
    });
    // a missing reference image just drops out
    this.card.addEventListener('error', (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG') return;
      (img.closest('.thumbs button') || img.closest('.gal') || img).remove();
    }, true);
    this.journal.addEventListener('click', (e) => {
      if (winAct(e)) return;
      const r = e.target.closest('[data-entry]');
      if (r && this.state.found.has(r.dataset.entry)) this.showEntry(r.dataset.entry, { mode: 'full' });
      else if (r) this.onAction?.('guide', r.dataset.entry);
    });
    this.lightbox.addEventListener('click', () => this.lightbox.classList.remove('show'));
    // the card is read while walking: the wheel and PageUp/PageDown scroll it without freeing the pointer
    addEventListener('wheel', (e) => {
      if (this.open !== 'card' || this.cursor.active || e.target.closest?.('#card .client')) return;
      this.scroll(e.deltaY * (e.deltaMode === 1 ? 32 : 1), false);
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (this.lightbox.classList.contains('show')) this.lightbox.classList.remove('show');
      if (!this.open) return;
      if (e.code === 'PageDown' || e.code === 'PageUp') {
        e.preventDefault();
        const c = this.client();
        this.scroll((e.code === 'PageDown' ? 1 : -1) * (c ? c.clientHeight * 0.85 : 300));
      } else if (this.modal && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
        e.preventDefault();
        this.scroll(e.code === 'ArrowDown' ? 80 : -80);
      } else if (this.open === 'card' && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        this.setImage(this.img + (e.code === 'BracketRight' ? 1 : -1));
      }
    });
  }
  t(o) { return o?.[this.state.lang] || o?.en || ''; }
  get isOpen() { return !!this.open; }
  // a centred window is up (journal or full card): the player stands still and the mouse drives a cursor
  get modal() { return this.open === 'journal' || (this.open === 'card' && this.mode === 'full'); }
  client() { return (this.open === 'journal' ? this.journal : this.card).querySelector('.client'); }
  scroll(dy, smooth = true) { this.client()?.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' }); }

  setPrompt(label, action) {
    if (!label) { this.prompt.classList.remove('show'); return; }
    this.prompt.innerHTML = `<span class="key">E</span><span class="what">${esc(label)}</span>${action ? `<span class="act">${esc(action)}</span>` : ''}`;
    this.prompt.classList.add('show');
  }

  // mode 'peek': category, headword, title and lead (a glance while walking); 'full': everything, scrollable.
  showEntry(id, { mode = 'full' } = {}) {
    const e = BY_ID[id];
    if (!e) return;
    const lang = this.state.lang, peek = mode === 'peek';
    const again = this.open === 'card' && this.mode === mode; // re-render in place (language, related link)
    if (this.current !== id) this.img = 0;
    const imgs = this.images[id] || [];
    const kb = (k) => `<kbd>${k}</kbd>`;
    let body;
    if (peek) {
      const im = imgs[0];
      body = `<div class="peek-row">${im ? `<img src="${esc(imgSrc(im.src))}" alt="">` : ''}<div>
          <h3>${esc(this.t(e.title))}</h3><p class="lead">${esc(this.t(e.short))}</p></div></div>
        <div class="foot"><span>${kb('E')} ${esc(this.t(T.readMore))}</span></div>`;
    } else {
      const rel = (e.related || []).filter((r) => BY_ID[r]).map((r) => {
        const known = this.state.found.has(r), told = !known && !this.placed.has(r);
        if (told) return `<button class="chip told" data-entry="${r}" data-learn="1">${esc(head(BY_ID[r]))}</button>`;
        return `<button class="chip${known ? '' : ' unknown'}" ${known ? `data-entry="${r}"` : 'disabled'}>${esc(known ? head(BY_ID[r]) : '· · ·')}</button>`;
      }).join('');
      const facts = (e.facts[lang] || e.facts.en || []).map((f) => `<li>${esc(f)}</li>`).join('');
      body = `${imgs.length ? `<div class="gal">${this.galleryHTML(imgs)}</div>` : ''}
        <h3>${esc(this.t(e.title))}</h3>
        <p class="lead">${esc(this.t(e.short))}</p>
        <p>${esc(this.t(e.body))}</p>
        ${facts ? `<ul class="facts">${facts}</ul>` : ''}
        ${rel ? `<div class="rel"><span>${esc(this.t(L.related))}</span>${rel}</div>` : ''}
        <details class="src"><summary>${esc(this.t(L.sources))}</summary>${(e.sources || []).map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\//, '').slice(0, 70))}</a>`).join('')}</details>
        <div class="foot"><span>${kb('E')} ${esc(this.t(L.close))}</span><span class="kb">${kb('PgUp')} ${kb('PgDn')}</span>${imgs.length > 1 ? `<span class="kb">${kb('[')} ${kb(']')}</span>` : ''}</div>`;
    }
    this.card.innerHTML = `
      <div class="win glass">
        <div class="win-head">${peek ? '' : this.closeButton()}
          <div class="cat">${esc(this.t(CATS[e.category]) || e.category)}</div>
          <h2>${esc(e.sah)}</h2>
          <div class="sub">${esc(e.translit || '')}${e.ru ? ` · <span class="ru">${esc(e.ru)}</span>` : ''}</div>${peek ? '' : this.langButton()}
        </div>
        <div class="client">${body}</div>
      </div>`;
    this.card.classList.toggle('peek', peek);
    this.card.classList.toggle('full', !peek);
    this.card.classList.toggle('again', again);
    this.card.classList.add('show');
    this.open = 'card';
    this.mode = peek ? 'peek' : 'full';
    this.current = id;
    this.cursor.sync();
  }
  closeButton() { return `<button class="win-close" data-act="close" title="${esc(this.t(L.close))}" aria-label="${esc(this.t(L.close))}"></button>`; }
  langButton() { return `<button class="win-lang" data-act="lang"><kbd>L</kbd> ${esc(NEXT[this.state.lang])}</button>`; }

  galleryHTML(imgs) {
    const i = Math.min(this.img, imgs.length - 1), im = imgs[i], lang = this.state.lang;
    const cap = im.caption?.[lang] || im.caption?.en || '';
    const credit = [im.credit, im.license && (im.url ? `<a href="${esc(im.url)}" target="_blank" rel="noopener">${esc(im.license)}</a>` : esc(im.license))].filter(Boolean);
    const nav = imgs.length > 1 ? `<button class="nav prev" data-img="${i - 1}" aria-label="‹"></button><button class="nav next" data-img="${i + 1}" aria-label="›"></button>` : '';
    return `<figure><div class="stage"><button class="hero" title=""><img src="${esc(imgSrc(im.src))}" ${im.w ? `width="${im.w}" height="${im.h}"` : ''} alt="${esc(cap)}"></button>${nav}</div>
      <figcaption>${esc(cap)}${credit.length ? `<span class="credit">${credit.map((c, k) => k ? c : esc(c)).join(' · ')}</span>` : ''}</figcaption></figure>
      ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((m, k) => `<button data-img="${k}" class="${k === i ? 'on' : ''}"><img src="${esc(imgSrc(m.src))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;
  }
  setImage(i) {
    const imgs = this.images[this.current] || [], gal = this.card.querySelector('.gal');
    if (!gal || imgs.length < 2) return;
    this.img = (i + imgs.length) % imgs.length;
    gal.innerHTML = this.galleryHTML(imgs);
  }
  enlarge() {
    const im = (this.images[this.current] || [])[this.img];
    if (!im) return;
    const fig = this.card.querySelector('.gal figcaption');
    this.lightbox.innerHTML = `<div class="win glass"><div class="client"><img src="${esc(imgSrc(im.src))}" alt=""><div class="cap">${fig ? fig.innerHTML : ''}</div></div></div>`;
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
