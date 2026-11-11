// A select drawn by the game (index.html `.sel`): the current choice on a button, the choices in a list that
// drops from it, the current one ticked. A native <select> cannot be opened by the drawn cursor that stands in
// for the mouse while the pointer is locked (src/ui/cursor.js). Markup: <span class="sel" data-sel="name">.
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// options: [[value, label]]
export function selectHTML(options, value) {
  const cur = options.find(([v]) => v === value) || options[0];
  return `<button class="sel-btn" type="button" aria-haspopup="listbox"><span class="cur">${esc(cur[1])}</span>${icon('caret')}</button>`
    + `<div class="sel-menu" role="listbox">${options.map(([v, l]) => `<button type="button" role="option" data-v="${esc(v)}"${v === value ? ' class="on" aria-selected="true"' : ''}>${icon('check')}${esc(l)}</button>`).join('')}</div>`;
}
// every select of that name in the page
export function fillSelects(name, options, value, root = document) {
  for (const el of root.querySelectorAll(`.sel[data-sel="${name}"]`)) { el.classList.remove('open'); el.innerHTML = selectHTML(options, value); }
}
// one listener for all of them: `pick(name, value)`
export function watchSelects(pick) {
  addEventListener('click', (e) => {
    if (e.isTrusted && document.pointerLockElement) return; // the locked mouse's own click: the drawn cursor sends its own
    const opt = e.target.closest?.('.sel-menu [data-v]'), sel = e.target.closest?.('.sel'), btn = e.target.closest?.('.sel-btn');
    for (const o of document.querySelectorAll('.sel.open')) if (o !== sel || opt) o.classList.remove('open');
    if (opt) pick(sel.dataset.sel, opt.dataset.v);
    else if (btn) sel.classList.toggle('open');
  }, true);
  addEventListener('keydown', (e) => { if (e.code === 'Escape') for (const o of document.querySelectorAll('.sel.open')) o.classList.remove('open'); }, true);
}
