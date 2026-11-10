// A browser compiles the 2D shaders for each kind of paint (a glass panel's gradient in a rounded clip, a blurred
// shadow, a backdrop blur…) the first time it draws one, in the GPU process the game's frames go through too: the
// first prompt, toast, card or menu held them up 100–300 ms (headless Chrome, a fresh profile: the first step into
// the urasa, five frames up to 150 ms late). So, while loading, every interface surface is painted once at 1%
// opacity (`.prewarm`, index.html), a few states per pair of frames, from the start of the load (the GPU process
// has little else to do then; later it costs the load ~1 s).
import { BY_ID } from './ui.js';

export async function prewarmUI(game) {
  const ui = game.ui, root = document.documentElement, undo = [];
  const frames = (n = 2) => new Promise((ok) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : ok()); f(); });
  // classes put on for the pass (and taken off after it, unless they were there)
  const on = (sel, ...cls) => {
    for (const el of document.querySelectorAll(sel)) for (const c of cls) if (!el.classList.contains(c)) { el.classList.add(c); undo.push(() => el.classList.remove(c)); }
  };
  const off = (sel, c) => { for (const el of document.querySelectorAll(sel)) if (el.classList.contains(c)) { el.classList.remove(c); undo.push(() => el.classList.add(c)); } };
  const touch = document.querySelector('.tc-root'), mode = touch?.dataset.mode;
  // a card with a gallery; its pictures are swapped for the key art (in the cache already: nothing is fetched)
  const ids = Object.keys(BY_ID), id = ids.find((k) => ui.images[k]?.length > 1 && BY_ID[k].related?.length) || ids[0];
  const art = document.querySelector('#keyart img')?.currentSrc;
  const pictures = (el) => { for (const im of el.querySelectorAll('img')) { if (art) { im.loading = 'eager'; im.src = art; } else im.remove(); } };
  root.classList.add('prewarm');
  try {
    on('#dot', 'on'); on('#fps', 'on'); on('#vcursor', 'on');
    off('#hints', 'off');
    if (touch) { touch.dataset.mode = 'play'; on('.tc-btn', 'down'); on('.tc-stick', 'on', 'run'); }
    ui.setPrompt('Алаас', 'Алаас');
    ui.toast('<small>Алаас</small><b>Алаас</b>', 1e9);
    await frames();
    ui.showEntry(id, { mode: 'peek' });
    pictures(ui.card);
    await frames(3);
    ui.showEntry(id, { mode: 'full' });
    if (touch) touch.dataset.mode = 'ui';
    pictures(ui.card);
    await frames(3);
    ui.enlarge();
    pictures(ui.lightbox);
    await frames(3);
    ui.showJournal();
    await frames();
    ui.close();
    on('#pause', 'show');
    for (const tab of document.querySelectorAll('#pause .tab')) { on(`#${tab.id}`, 'on'); await frames(); }
    document.getElementById('pause').classList.remove('show');
    // what is made once the world is built: the work gauge, the journal's finder marker
    for (const t = performance.now(); !game.guide && performance.now() - t < 60000;) await frames(6);
    on('#guide', 'on', 'edge'); on('#gshimmer', 'on'); on('#gauge', 'on', 'good');
    await frames();
  } finally {
    for (const u of undo.reverse()) u();
    if (touch) touch.dataset.mode = mode;
    ui.close(); ui.setPrompt(null); ui.toasts.replaceChildren();
    ui.card.innerHTML = ui.journal.innerHTML = ui.lightbox.innerHTML = '';
    ui.current = undefined;
    root.classList.remove('prewarm');
  }
}
