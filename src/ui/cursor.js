// A drawn mouse cursor for the windows that open during play (full card, journal, image viewer, the pause menu).
// Browsers show their "Press Esc to return the mouse" banner every time pointer lock is granted, so
// the game keeps the lock for the whole session: while a window is up, mouse movement (movementX/Y)
// moves this cursor instead of the view, and presses, clicks, scrollbar drags and the wheel are
// delivered to the DOM element under it (elementFromPoint). Without pointer lock (touch, a free
// pointer) it stays hidden and the real pointer works as usual.
const CLICKABLE = 'button, a, summary, label, select, input, [data-entry], [data-img], [data-act]';
const ARROW = '<svg width="20" height="24" viewBox="0 0 20 24"><path d="M1.5 1.5v18l4.6-4.3 3 7 3.2-1.4-3-6.8h6.4z" fill="#fff" stroke="#0b1520" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const HAND = '<svg width="22" height="24" viewBox="0 0 22 24"><path d="M7 11V3.2a1.6 1.6 0 0 1 3.2 0V10l.1-1.6a1.6 1.6 0 0 1 3.1.2v1.3a1.6 1.6 0 0 1 3.1.1v1.2a1.6 1.6 0 0 1 3 .6v4.7c0 3.7-2.4 6.3-6 6.3h-1.6c-2.2 0-3.6-.9-4.9-2.6L2.4 14.4a1.6 1.6 0 0 1 2.5-2z" fill="#fff" stroke="#0b1520" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export class VirtualCursor {
  // wanted(): is a window up that the cursor should drive?
  constructor(wanted) {
    this.wanted = wanted;
    this.x = innerWidth / 2; this.y = innerHeight / 2;
    this.el = document.createElement('div');
    this.el.id = 'vcursor';
    this.el.innerHTML = ARROW;
    document.body.appendChild(this.el);
    this.hover = null; this.down = null; this.drag = null; this.hand = false;
    const on = () => this.sync();
    addEventListener('mousemove', (e) => {
      if (!on()) return;
      this.move(e.movementX, e.movementY);
    });
    addEventListener('mousedown', (e) => { if (e.button === 0 && e.isTrusted && on()) this.press(); });
    addEventListener('mouseup', (e) => { if (e.button === 0 && e.isTrusted && on()) this.release(); });
    addEventListener('wheel', (e) => { if (on()) this.scrollAt(e.deltaY * (e.deltaMode === 1 ? 32 : 1)); }, { passive: true });
    document.addEventListener('pointerlockchange', on);
  }

  get active() { return !!document.pointerLockElement && this.wanted(); }
  // show or hide; a window that just opened puts the cursor back in the middle of the screen
  sync() {
    const a = this.active;
    if (a !== this.shown) {
      this.shown = a;
      this.el.classList.toggle('on', a);
      if (a) { this.x = innerWidth / 2; this.y = innerHeight / 2; this.move(0, 0); } else this.setHover(null);
    }
    return a;
  }
  at() { return document.elementFromPoint(this.x, this.y); } // #vcursor itself has pointer-events: none
  move(dx, dy) {
    this.x = Math.min(innerWidth - 1, Math.max(0, this.x + dx));
    this.y = Math.min(innerHeight - 1, Math.max(0, this.y + dy));
    this.el.style.transform = `translate(${this.x}px,${this.y}px)`;
    if (this.drag) { this.dragTo(); return; }
    this.setHover(this.at());
  }
  setHover(t) {
    const c = t?.closest?.(CLICKABLE) || null;
    if (c !== this.hover) { this.hover?.classList.remove('vh'); c?.classList.add('vh'); this.hover = c; }
    const hand = !!c && !c.disabled;
    if (hand !== this.hand) { this.hand = hand; this.el.innerHTML = hand ? HAND : ARROW; this.el.classList.toggle('hand', hand); }
  }
  click(t) {
    // a synthetic click can't open a <select>: it steps to the next option instead
    const sel = t.closest('select') || t.closest('label')?.querySelector('select');
    if (sel) { sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length; sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: this.x, clientY: this.y, button: 0 }));
  }

  press() {
    const t = this.at();
    if (!t) return;
    const sc = scroller(t);
    if (sc && this.onScrollbar(sc)) { this.startDrag(sc); return; }
    if (t.matches('input[type=range]')) { this.drag = { range: t }; this.dragTo(); return; }
    this.down = t;
    this.hover?.classList.add('vdown');
  }
  release() {
    this.hover?.classList.remove('vdown');
    if (this.drag) { this.drag = null; return; }
    const t = this.at(), d = this.down;
    this.down = null;
    if (!t || !d) return;
    // a click needs the press and release on the same control (or the same element)
    const c = t.closest(CLICKABLE), cd = d.closest(CLICKABLE);
    if (c ? c === cd : t === d) (c || t).disabled || this.click(t);
  }

  // the classic scrollbar along the right edge of a scrolling window (12 px, styled in index.html)
  onScrollbar(sc) {
    const r = sc.getBoundingClientRect(), cs = getComputedStyle(sc);
    const bar = Math.max(12, sc.offsetWidth - sc.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth));
    return this.x >= r.right - bar - 1 && this.x <= r.right;
  }
  thumb(sc) {
    const r = sc.getBoundingClientRect(), h = sc.clientHeight, max = sc.scrollHeight - h;
    const th = Math.max(24, h * h / sc.scrollHeight), top = r.top + sc.clientTop + (max ? sc.scrollTop / max : 0) * (h - th);
    return { top, th, h, max };
  }
  startDrag(sc) {
    const { top, th, h } = this.thumb(sc);
    if (this.y < top || this.y > top + th) { sc.scrollBy({ top: Math.sign(this.y - top) * h * 0.85 }); return; } // the track: a page
    this.drag = { sc, grab: this.y - top };
  }
  dragTo() {
    if (this.drag.range) { slide(this.drag.range, this.x); return; }
    const { sc, grab } = this.drag, r = sc.getBoundingClientRect(), { th, h, max } = this.thumb(sc);
    const f = (this.y - grab - r.top - sc.clientTop) / Math.max(1, h - th);
    sc.scrollTop = Math.min(1, Math.max(0, f)) * max;
  }
  scrollAt(dy) {
    const t = this.at(), sc = t && scroller(t);
    if (sc) sc.scrollBy({ top: dy });
  }
}

// a range input set from the cursor's x, as a real drag would
function slide(r, x) {
  const b = r.getBoundingClientRect(), min = +r.min || 0, max = r.max === '' ? 100 : +r.max, step = +r.step || 1;
  const f = Math.min(1, Math.max(0, (x - b.left) / Math.max(1, b.width)));
  const v = String(+(min + Math.round(f * (max - min) / step) * step).toFixed(6));
  if (v !== r.value) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }
}

// the nearest element under `t` that can scroll vertically
function scroller(t) {
  for (let e = t; e && e !== document.body; e = e.parentElement) {
    if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) return e;
  }
  return null;
}
