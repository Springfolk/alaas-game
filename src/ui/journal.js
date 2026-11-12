// The journal (docs/ui.md): a glass window with three leaves. The map: the alaas drawn from above (baked by
// tools/bake-map.mjs), dragged and zoomed (finger, pinch, wheel, the drawn cursor), with the buildings, the player's
// place and facing, a blue dot where a found thing is, a gold ring where one waits, a green square where a job is
// done, the names of the found houses and places; choosing a marker shows what it is, with a button to look at it
// closer (found) and one to be led there (the finder, src/ui/guide.js); a tap on the bare map puts the gold marker there. Finds: the entries as pictures,
// by kind. Work: each job as a picture with what the hands have made. DOM only; built once, filled when shown.
import ENTRIES from '../data/entries.json';
import JOURNAL from '../data/journal.json';
import { versioned } from '../load/assetv.js';
import { WORKS } from '../interact/work/list.js';
import { VIEWS } from './stage.js';
import { icon } from './icons.js';
import { nameHTML } from './names.js';
import { MapTiles } from './maptiles.js';

const BY_ID = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));
const M = JOURNAL.map; // { size, cx, cz, half }: the world square the picture covers
const U = 1000; // the map layer's own size, px
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const src = (s) => versioned(import.meta.env.BASE_URL + s);
const pic = (name) => esc(src(`assets/ui/journal/${name}.webp`));
const TABS = [
  ['map', 'map', { sah: 'Хаарта', en: 'Map', ru: 'Карта' }],
  ['finds', 'book', { sah: 'Булумньу', en: 'Finds', ru: 'Находки' }],
  ['work', 'hand', { sah: 'Үлэ', en: 'Work', ru: 'Работа' }],
];
const JOB_PICS = { split: 'work-split', hay: 'work-hay', tuos: 'work-tuos', gather: 'work-gather' }; // a job's own picture; the others show their entry's
// how a placed model is drawn on the map (its footprint from its bounds)
const SHAPES = { urasa: 'round', balagan: 'box', ampaar: 'box', kuruo: 'pen', sele: 'pen', hayfield: 'pen', serge: 'post', 'sacred-birch': 'tree' };

export const toMap = (x, z) => [(x - (M.cx - M.half)) / (2 * M.half), (z - (M.cz - M.half)) / (2 * M.half)];

export class Journal {
  constructor(ui, cats, title) {
    this.ui = ui; this.cats = cats; this.title = title;
    this.el = ui.journal;
    this.tab = 'map';
    this.view = null; // { sc, tx, ty }: the map layer's scale and shift
    this.sel = null;  // the chosen marker
    this.pins = [];
    this.el.innerHTML = `<div class="jw glass win">
      <div class="win-head"><span class="orb"></span><h2></h2><div class="j-count"><div class="bar"><i></i></div><span></span></div><span class="j-lang"></span></div>
      <button class="win-close" data-act="close"></button>
      <nav class="j-tabs">${TABS.map(([id, ic]) => `<button data-tab="${id}">${icon(ic)}<span></span></button>`).join('')}</nav>
      <div class="j-body">
        <div class="j-leaf j-map" data-leaf="map" data-map>
          <div class="j-world"><img alt="" draggable="false"><div class="j-tiles"></div><svg viewBox="0 0 ${U} ${U}"></svg><div class="j-pins"></div></div>
          <div class="j-ctl"><button data-zoom="1">${icon('plus')}</button><button data-zoom="-1">${icon('minus')}</button><button data-zoom="0">${icon('me')}</button></div>
          <div class="j-sel pane"></div>
        </div>
        <div class="j-leaf j-list client" data-leaf="finds"></div>
        <div class="j-leaf j-list client" data-leaf="work"></div>
      </div>
    </div>`;
    const $ = (s) => this.el.querySelector(s);
    this.map = $('.j-map'); this.world = $('.j-world'); this.pinBox = $('.j-pins'); this.selBox = $('.j-sel'); this.svg = $('.j-world svg');
    $('.j-world img').src = src('assets/ui/journal/map.webp');
    this.tiles = new MapTiles($('.j-tiles'), M); // close up: drawn squares over it
    this.wire();
  }
  t(o) { return this.ui.t(o); }

  // Once the world stands: where everything is. `game.guide` gives the entries' places.
  init(game) {
    this.game = game;
    this.tiles.init(game.world.terrain.pads);
    const its = game.world.interactables;
    this.places = {};
    for (const e of ENTRIES) { const p = game.guide.places(e.id)[0]; if (p) this.places[e.id] = p; }
    this.named = new Set(['alaas', ...game.world.placed.map((p) => p.model)]);
    this.jobAt = {};
    for (const j of WORKS) { const it = its.find(j.find); if (it?.target) this.jobAt[j.id] = game.guide.pos(it); }
    // the buildings, from their bounds
    const shapes = [];
    for (const p of game.world.placed) {
      const kind = SHAPES[p.model];
      if (!kind || !p.object) continue;
      const b = game.guide.box(p.object), [u0, v0] = toMap(b.min.x, b.min.z), [u1, v1] = toMap(b.max.x, b.max.z);
      const x = u0 * U, y = v0 * U, w = (u1 - u0) * U, h = (v1 - v0) * U, cx = x + w / 2, cy = y + h / 2;
      if (kind === 'round') shapes.push(`<circle class="m-house" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(Math.min(w, h) / 2).toFixed(2)}"/><circle class="m-dot" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r=".6"/>`);
      else if (kind === 'box') shapes.push(`<rect class="m-house" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx=".8"/>`);
      else if (kind === 'pen') shapes.push(`<rect class="m-pen" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx=".5"/>`);
      else if (kind === 'post') shapes.push(`<circle class="m-post" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r=".9"/>`);
      else shapes.push(`<circle class="m-tree" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${Math.max(3, Math.min(w, h) / 2).toFixed(2)}"/>`);
    }
    this.svg.innerHTML = shapes.join('');
  }

  // ── the window ──
  // `here`: the map comes up round the player (at the scale it was left at)
  show(tab = this.tab, here = false) {
    const ui = this.ui, found = ui.state.found, n = found.size;
    this.tab = tab;
    if (here && this.view && this.game) { this.sel = null; this.centre(this.game.player.pos, null); }
    const $ = (s) => this.el.querySelector(s);
    $('h2').textContent = this.t(this.title);
    $('.j-count i').style.setProperty('--p', n / ENTRIES.length);
    $('.j-count span').innerHTML = `<b>${n}</b> / ${ENTRIES.length}`;
    $('.j-lang').innerHTML = ui.langSelect(false);
    TABS.forEach(([id, , label], k) => { const b = this.el.querySelectorAll('.j-tabs button')[k]; b.classList.toggle('on', id === tab); b.lastChild.textContent = this.t(label); });
    for (const l of this.el.querySelectorAll('.j-leaf')) l.classList.toggle('on', l.dataset.leaf === tab);
    if (tab !== 'map') this.tiles.clear();
    if (tab === 'map') this.drawMap();
    else if (tab === 'finds') this.drawFinds($('[data-leaf=finds]'));
    else this.drawWork($('[data-leaf=work]'));
  }
  thumb(id, known) {
    const v = VIEWS[id] || {}, im = this.ui.images[id]?.[0];
    if (v.photo) return known && im ? `<img src="${esc(src(im.src.replace(/^(\.\/|public\/)/, '')))}" alt="" loading="lazy" decoding="async">` : '';
    return `<img src="${pic(known ? id : id + '.s')}" alt="" loading="lazy" decoding="async">`;
  }
  drawFinds(box) {
    const found = this.ui.state.found, groups = {};
    for (const e of ENTRIES) (groups[e.category] ||= []).push(e);
    const tile = (e) => (found.has(e.id) ? `<button class="jt" data-entry="${e.id}">${this.thumb(e.id, true)}<b>${nameHTML(e, this.ui.state.lang)}</b></button>`
      : `<button class="jt q" data-entry="${e.id}" aria-label="?">${this.thumb(e.id, false)}<i>?</i></button>`);
    const top = box.scrollTop;
    box.innerHTML = Object.keys(this.cats).filter((c) => groups[c]).map((c) => `<h4>${esc(this.t(this.cats[c]))}</h4><div class="jg">${groups[c].map(tile).join('')}</div>`).join('');
    box.scrollTop = top;
  }
  drawWork(box) {
    const w = this.ui.state.work || {};
    box.innerHTML = `<div class="jg work">${WORKS.map((job) => {
      const done = job.done(w), name = JOB_PICS[job.id] || job.entry;
      const got = done ? job.made(w).filter(([, n]) => n > 0).map(([ic, n, unit]) => `<span>${icon(ic)}${n}${unit || ''}</span>`).join('') : '';
      return `<button class="jt job${done ? '' : ' q'}" data-job="${job.id}"><img src="${pic(done ? name : name + '.s')}" alt="" loading="lazy" decoding="async"><b>${esc(this.t(job.name))}${got ? `<small>${got}</small>` : ''}</b></button>`;
    }).join('')}</div>`;
  }

  // ── the map ──
  // every marker: { key, kind: 'found' | 'q' | 'job', id, p (world), rank }
  collect() {
    const found = this.ui.state.found, out = [];
    for (const j of WORKS) if (this.jobAt?.[j.id]) out.push({ key: 'job:' + j.id, kind: 'job', id: j.id, p: this.jobAt[j.id], rank: 1, icon: j.icon });
    for (const e of ENTRIES) {
      const p = this.places?.[e.id];
      if (!p) continue;
      const k = found.has(e.id), big = this.named?.has(e.id); // a house or a place of its own: before what is in it
      out.push({ key: e.id, kind: k ? 'found' : 'q', id: e.id, p, rank: (k ? 2 : 4) + (big ? 0 : 1) });
    }
    return out;
  }
  drawMap() {
    const g = this.game;
    this.pins = this.collect();
    const dest = g?.guide.dest;
    this.pinBox.innerHTML = this.pins.map((m, k) => {
      const [u, v] = toMap(m.p.x, m.p.z);
      const name = m.kind === 'found' && m.rank === 2 ? `<span>${nameHTML(BY_ID[m.id], this.ui.state.lang)}</span>` : ''; // a found house or place is named
      return `<button class="j-pin ${m.kind}" data-pin="${k}" style="left:${(u * 100).toFixed(3)}%;top:${(v * 100).toFixed(3)}%">${m.kind === 'job' ? icon(m.icon) : m.kind === 'q' ? '?' : ''}${name}</button>`;
    }).join('') + '<i class="j-pin dest"></i><i class="j-pin me"></i>';
    this.pinEls = [...this.pinBox.children];
    this.destEl = this.pinEls[this.pins.length]; this.meEl = this.pinEls[this.pins.length + 1];
    if (g) {
      const [u, v] = toMap(g.player.pos.x, g.player.pos.z);
      this.meEl.style.left = `${u * 100}%`; this.meEl.style.top = `${v * 100}%`;
      this.meEl.style.setProperty('--r', `${-g.player.yaw}rad`);
    }
    this.placeDest(dest);
    if (!this.view) this.centre(g ? g.player.pos : { x: M.cx, z: M.cz }, 190);
    this.apply(true);
    this.select(this.sel && this.pins.find((m) => m.key === this.sel.key) || null);
  }
  placeDest(dest) {
    const p = dest?.at;
    this.destEl.classList.toggle('on', !!p);
    if (p) { const [u, v] = toMap(p.x, p.z); this.destEl.style.left = `${u * 100}%`; this.destEl.style.top = `${v * 100}%`; }
  }
  size() { return { w: this.map.clientWidth || 1, h: this.map.clientHeight || 1 }; }
  // local px per px of the screen (the window is zoomed on a big screen)
  ratio() { const r = this.map.getBoundingClientRect(); return r.width ? this.map.clientWidth / r.width : 1; }
  limits() { const { w, h } = this.size(); return { min: Math.min(w, h) / U, max: (2 * M.half / U) / 0.1 }; } // from the whole alaas to 10 cm a pixel
  // show `span` metres across (null: the scale as it is), centred on a world point
  centre(p, span) {
    const { w, h } = this.size(), L = this.limits(), [u, v] = toMap(p.x, p.z);
    const sc = span ? Math.min(L.max, Math.max(L.min, Math.min(w, h) / (span / (2 * M.half) * U))) : this.view.sc;
    this.view = { sc, tx: w / 2 - u * U * sc, ty: h / 2 - v * U * sc };
  }
  zoom(f, x, y) {
    const v = this.view, { w, h } = this.size(), L = this.limits();
    x ??= w / 2; y ??= h / 2;
    const sc = Math.min(L.max, Math.max(L.min, v.sc * f)), k = sc / v.sc;
    v.tx = x - (x - v.tx) * k; v.ty = y - (y - v.ty) * k; v.sc = sc;
    this.apply();
  }
  pan(dx, dy) { this.view.tx += dx; this.view.ty += dy; this.apply(); }
  apply(force = false) {
    const v = this.view, { w, h } = this.size(), S = U * v.sc;
    // the map fills the window; where it is smaller it sits in the middle
    v.tx = S < w ? (w - S) / 2 : Math.min(0, Math.max(w - S, v.tx)); v.ty = S < h ? (h - S) / 2 : Math.min(0, Math.max(h - S, v.ty));
    this.world.style.transform = `translate(${v.tx.toFixed(1)}px,${v.ty.toFixed(1)}px) scale(${v.sc.toFixed(4)})`;
    const step = Math.round(Math.log2(v.sc) * 4);
    if (step !== this.step || force) { this.step = step; this.world.style.setProperty('--k', (1 / v.sc).toFixed(4)); this.thin(); }
    // a layer of its own while it moves (cheap to move, drawn at the scale it had); at rest drawn again at its own
    // scale, and the close squares for what is in view
    this.world.classList.add('moving');
    clearTimeout(this.settleT);
    this.settleT = setTimeout(() => this.settle(), 180);
  }
  settle() {
    const v = this.view;
    if (!v || this.ui.open !== 'journal' || this.tab !== 'map') return;
    this.world.classList.remove('moving');
    const { w, h } = this.size(), S = U * v.sc, span = 2 * M.half, m = (px) => px / S * span;
    const dev = Math.min(2, devicePixelRatio || 1) / this.ratio(); // device px per local px
    this.tiles.update(span / S / dev, { x0: m(-v.tx), x1: m(w - v.tx), z0: m(-v.ty), z1: m(h - v.ty) });
  }
  // Markers that would sit on one another: the more important one stays, the others wait for a closer look.
  thin() {
    const sc = this.view.sc, kept = [], order = this.pins.map((m, k) => k).sort((a, b) => this.rankOf(this.pins[a]) - this.rankOf(this.pins[b]));
    for (const k of order) {
      const m = this.pins[k], [u, v] = toMap(m.p.x, m.p.z), x = u * U * sc, y = v * U * sc;
      const hide = kept.some(([kx, ky]) => Math.abs(kx - x) < 24 && Math.abs(ky - y) < 24);
      if (!hide) kept.push([x, y, k]);
      this.pinEls[k].classList.toggle('off', hide);
    }
    this.label(kept);
  }
  // The names of the kept markers: below, above, right or left of their marker, wherever they cover no marker and
  // no other name (the more important first); with no room, none until a closer look.
  label(kept) {
    const sc = this.view.sc, R = 2, boxes = kept.map(([x, y, k]) => { const h = this.pins[k].kind === 'job' ? 13 : 10; return [x - h, y - h, x + h, y + h]; });
    for (const el of [this.meEl, this.destEl]) if (el && (el === this.meEl || el.classList.contains('on'))) { const x = parseFloat(el.style.left) / 100 * U * sc, y = parseFloat(el.style.top) / 100 * U * sc; if (x === x) boxes.push([x - 12, y - 14, x + 12, y + 12]); }
    const hit = (a) => boxes.some((b) => a[0] < b[2] + R && a[2] > b[0] - R && a[1] < b[3] + R && a[3] > b[1] - R);
    for (const [x, y, k] of kept) {
      const m = this.pins[k], el = this.pinEls[k], sp = el.querySelector(':scope > span');
      if (!sp) continue;
      if (!m.lw) { m.lw = sp.offsetWidth; m.lh = sp.offsetHeight; }
      const w = m.lw || 60, h = m.lh || 16, r = m.kind === 'job' ? 12 : 9;
      const at = [['b', x - w / 2, y + r + 3], ['t', x - w / 2, y - r - 3 - h], ['r', x + r + 4, y - h / 2], ['l', x - r - 4 - w, y - h / 2]]
        .map(([s, l, t]) => [s, [l, t, l + w, t + h]]).find(([, a]) => !hit(a));
      el.classList.toggle('nolab', !at);
      if (at) { el.dataset.lp = at[0]; boxes.push(at[1]); }
    }
  }
  rankOf(m) { return this.sel?.key === m.key ? 0 : m.rank; }
  // choose a marker (null: none): what it is, and what can be done with it
  select(m) {
    this.sel = m;
    this.pins.forEach((x, k) => this.pinEls[k]?.classList.toggle('on', x === m));
    this.selBox.classList.toggle('on', !!m);
    if (!m) return;
    const g = this.game, going = g?.guide.dest?.key === m.key;
    let name, img = '', read = '';
    if (m.kind === 'job') {
      const j = WORKS.find((x) => x.id === m.id), w = this.ui.state.work || {}, done = j.done(w);
      name = `<b>${esc(this.t(j.name))}</b>${done ? `<small>${j.made(w).filter(([, n]) => n > 0).map(([ic, n, unit]) => `<span>${icon(ic)}${n}${unit || ''}</span>`).join('')}</small>` : ''}`;
      img = `<img src="${pic(done ? JOB_PICS[j.id] || j.entry : (JOB_PICS[j.id] || j.entry) + '.s')}" alt="">`;
    } else {
      const e = BY_ID[m.id], k = m.kind === 'found';
      name = k ? `<b>${nameHTML(e, this.ui.state.lang)}</b><small>${esc(this.t(this.cats[e.category]))}</small>` : '<b>?</b>';
      img = this.thumb(m.id, k);
      if (k) read = `<button class="j-do read" data-open="${m.id}">${icon('eye')}</button>`;
    }
    this.selBox.innerHTML = `<span class="j-thumb">${img}</span><span class="j-name">${name}</span>${read}<button class="j-do go${going ? ' on' : ''}" data-go="${esc(m.key)}"><i class="gmark"></i>${icon('walk')}</button>`;
    this.thin();
  }
  // show a marker on the map (from the lists): the map leaf, centred on it, chosen
  find(key) {
    this.show('map');
    const m = this.pins.find((x) => x.key === key);
    if (!m) return;
    this.centre(m.p, 70);
    this.apply(true);
    this.select(m);
  }
  // be led to the chosen marker (again: no longer)
  go(key) {
    const g = this.game, m = this.pins.find((x) => x.key === key);
    if (!g || !m) return;
    if (g.guide.dest?.key === key) g.guide.clear(); else if (m.kind === 'q' || m.kind === 'found') g.guide.go({ key, id: m.id, at: m.p }); else g.guide.go({ key, at: m.p });
    this.placeDest(g.guide.dest);
    this.select(m);
  }
  // a tap on the bare map: the gold marker there (on it: taken away); with a marker chosen: only lets it go
  tapAt(x, y) {
    const g = this.game, v = this.view;
    if (this.sel) { this.select(null); return; }
    if (!g) return;
    const u = (x - v.tx) / (U * v.sc), w = (y - v.ty) / (U * v.sc);
    if (u < 0 || u > 1 || w < 0 || w > 1) return;
    const wx = M.cx - M.half + u * 2 * M.half, wz = M.cz - M.half + w * 2 * M.half, d = g.guide.dest;
    if (d?.at && Math.hypot(d.at.x - wx, d.at.z - wz) * (U * v.sc) / (2 * M.half) < 22) g.guide.clear();
    else g.guide.go({ key: 'spot', at: new g.player.pos.constructor(wx, g.world.groundAt(wx, wz) + 1, wz) });
    this.placeDest(g.guide.dest);
  }

  // src/ui/prewarm.js: a marker of every kind and the chosen marker's pane, to be painted once while loading
  demo() {
    const at = (x, y) => `style="left:${x}%;top:${y}%"`;
    this.pins = []; this.pinEls = [];
    this.pinBox.innerHTML = `<button class="j-pin found" ${at(40, 40)}><span><span class="nm"><span class="nm-s">Алаас</span><span class="nm-l">Alaas</span></span></span></button><button class="j-pin q" ${at(45, 45)}>?</button><button class="j-pin job on" ${at(50, 50)}>${icon('axe')}</button>
      <i class="j-pin dest on" ${at(55, 55)}></i><i class="j-pin me" ${at(60, 60)}></i>`;
    this.selBox.className = 'j-sel pane on';
    this.selBox.innerHTML = `<span class="j-thumb"></span><span class="j-name"><b><span class="nm"><span class="nm-s">Алаас</span><span class="nm-l">Alaas</span></span></b><small><span>${icon('log')}1</span></small></span><button class="j-do read">${icon('eye')}</button>
      <button class="j-do go"><i class="gmark"></i>${icon('walk')}</button><button class="j-do go on"><i class="gmark"></i>${icon('walk')}</button>`;
    this.view = { sc: 0.6, tx: 0, ty: 0 };
    this.world.style.transform = 'translate(0px,0px) scale(.6)';
    this.world.style.setProperty('--k', '1.6667');
  }
  reset() { this.tiles.clear(); this.view = null; this.sel = null; this.pins = []; this.pinEls = []; this.pinBox.innerHTML = ''; this.selBox.className = 'j-sel pane'; this.selBox.innerHTML = ''; this.tab = 'map'; }

  wire() {
    const ui = this.ui;
    this.el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.sel')) return;
      if (t.closest('[data-act=close]') || t === this.el) { ui.onAction?.('close'); return; }
      const tab = t.closest('[data-tab]'), z = t.closest('[data-zoom]'), pin = t.closest('[data-pin]'), go = t.closest('[data-go]'), open = t.closest('[data-open]');
      const job = t.closest('[data-job]'), entry = t.closest('[data-entry]');
      if (tab) this.show(tab.dataset.tab);
      else if (z) { if (+z.dataset.zoom) this.zoom(+z.dataset.zoom > 0 ? 1.6 : 1 / 1.6); else if (this.game) { this.centre(this.game.player.pos, 120); this.apply(true); } }
      else if (pin) { if (e.isTrusted) return; this.select(this.pins[+pin.dataset.pin]); } // (the drawn cursor's click; a real pointer's tap is taken on the map below)
      else if (go) this.go(go.dataset.go);
      else if (open) ui.onAction?.('open', open.dataset.open, null, 'journal');
      else if (job) this.find('job:' + job.dataset.job);
      else if (entry) { if (ui.state.found.has(entry.dataset.entry)) ui.onAction?.('open', entry.dataset.entry, null, 'journal'); else this.find(entry.dataset.entry); }
    });
    // a free pointer or fingers on the map: one drags, two pinch; a short still touch is a tap
    const pts = new Map();
    let moved = 0, pinch = 0, t0 = 0, onPin = null;
    const local = (e) => { const r = this.map.getBoundingClientRect(), k = this.ratio(); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    this.map.addEventListener('pointerdown', (e) => {
      if (document.pointerLockElement || e.target.closest('.j-ctl, .j-sel')) return;
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { moved = 0; t0 = performance.now(); onPin = e.target.closest('[data-pin]'); } // (a drag may start on a marker)
      pinch = 0;
      this.map.setPointerCapture?.(e.pointerId);
    });
    this.map.addEventListener('pointermove', (e) => {
      const a = pts.get(e.pointerId);
      if (!a) return;
      const p = local(e);
      if (pts.size === 1) { this.pan(p[0] - a[0], p[1] - a[1]); moved += Math.abs(p[0] - a[0]) + Math.abs(p[1] - a[1]); }
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [p1, p2] = [...pts.values()], d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
        if (pinch) this.zoom(d / pinch, (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
        pinch = d; moved += 99;
      }
    });
    const up = (e) => {
      const a = pts.get(e.pointerId);
      if (!a) return;
      pts.delete(e.pointerId); pinch = 0;
      if (pts.size || moved >= 8 || performance.now() - t0 > 400 || e.type !== 'pointerup') return;
      if (onPin) this.select(this.pins[+onPin.dataset.pin]); else this.tapAt(a[0], a[1]);
    };
    this.map.addEventListener('pointerup', up); this.map.addEventListener('pointercancel', up);
    this.map.addEventListener('wheel', (e) => {
      if (document.pointerLockElement) return;
      const p = local(e);
      this.zoom(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)), p[0], p[1]);
    }, { passive: true });
    addEventListener('resize', () => { if (ui.open === 'journal' && this.tab === 'map' && this.view) this.apply(true); });
  }
  // the drawn cursor (pointer locked): a drag, the wheel, a click on the bare map, at screen px
  cursorPan(dx, dy) { const k = this.ratio(); this.pan(dx * k, dy * k); }
  cursorZoom(dy, x, y) { const r = this.map.getBoundingClientRect(), k = this.ratio(); this.zoom(Math.exp(-dy * 0.0016), (x - r.left) * k, (y - r.top) * k); }
  cursorTap(x, y) { const r = this.map.getBoundingClientRect(), k = this.ratio(); this.tapAt((x - r.left) * k, (y - r.top) * k); }
}
