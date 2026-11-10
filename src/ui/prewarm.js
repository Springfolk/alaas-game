// A browser compiles the 2D shaders for each kind of paint (a glass panel's gradient in a rounded clip, a picture in
// a rounded frame, a blurred shadow, a layer drawn through a rounded clip…) the first time it draws one, in the GPU
// process the game's frames go through too: the first prompt, toast, card, menu or gauge held them up 80–420 ms
// (headless Chrome, a fresh profile). So every interface surface is drawn once while loading, in each of its states,
// a few per pair of frames, from the start of the load (the GPU process has little else to do then).
// Drawn for real, under the key art (`.prewarm`, index.html: the key art a shade short of opaque, or what it hides
// is not drawn at all); opacity on the surfaces themselves would change which shaders they need. Without the key
// art (?auto) they are shown at 1% instead, which covers most.
import { BY_ID } from './ui.js';

export async function prewarmUI(game) {
  const ui = game.ui, root = document.documentElement, undo = [];
  const frames = (n = 2) => new Promise((ok) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : ok()); f(); });
  // classes put on for the pass (and taken off after it, unless they were there)
  const on = (sel, ...cls) => {
    for (const el of document.querySelectorAll(sel)) for (const c of cls) if (!el.classList.contains(c)) { el.classList.add(c); undo.push(() => el.classList.remove(c)); }
  };
  const off = (sel, c) => { for (const el of document.querySelectorAll(sel)) if (el.classList.contains(c)) { el.classList.remove(c); undo.push(() => el.classList.add(c)); } };
  const touch = game.touch; // its controls: one set at a time (`show` overrides what its own sync picks)
  // a card with a gallery; its pictures are swapped for the key art (in the cache already: nothing is fetched)
  const ids = Object.keys(BY_ID), id = ids.find((k) => ui.images[k]?.length > 1 && BY_ID[k].related?.length) || ids[0];
  const keyart = document.getElementById('keyart'), covered = !!keyart && getComputedStyle(keyart).display !== 'none';
  const art = keyart?.querySelector('img')?.currentSrc;
  const pictures = (el) => { for (const im of el.querySelectorAll('img')) { if (art) { im.loading = 'eager'; im.src = art; } else im.remove(); } };
  root.classList.add('prewarm');
  if (!covered) root.classList.add('bare');
  try {
    // each surface at rest first, then its other states (the stick at rest and pushed are different gradients)
    on('#fps', 'on'); on('#vcursor', 'on');
    off('#hints', 'off');
    if (touch) touch.show = 'play';
    ui.setPrompt('Алаас', 'Алаас');
    ui.toast('<small>Алаас</small><b>Алаас</b>', 1e9);
    await frames(3);
    on('#dot', 'on'); on('.tc-btn', 'down'); on('.tc-stick', 'on');
    await frames();
    on('.tc-stick', 'run');
    ui.showEntry(id, { mode: 'peek' });
    pictures(ui.card);
    await frames(3);
    ui.showEntry(id, { mode: 'full' });
    if (touch) touch.show = 'ui';
    pictures(ui.card);
    await frames(3);
    ui.enlarge();
    pictures(ui.lightbox);
    await frames(3);
    ui.showJournal();
    if (touch) touch.show = 'choice';
    await frames();
    ui.close();
    on('#pause', 'show');
    for (const tab of document.querySelectorAll('#pause .tab')) { on(`#${tab.id}`, 'on'); await frames(); }
    document.getElementById('pause').classList.remove('show');
    // what is made once the world is built: the journal's finder marker, the work gauge (its fill at some height)
    for (const t = performance.now(); !game.guide && performance.now() - t < 60000;) await frames(6);
    const gauge = document.getElementById('gauge'), fill = gauge?.firstChild;
    if (fill) { fill.style.transform = 'scaleY(.4)'; undo.push(() => { fill.style.transform = ''; }); }
    on('#guide', 'on'); on('#gshimmer', 'on'); on('#gauge', 'on');
    await frames(14); // (the gauge fades in)
    on('#guide', 'edge'); on('#gauge', 'good');
    await frames(3);
  } finally {
    for (const u of undo.reverse()) u();
    if (touch) touch.show = null;
    ui.close(); ui.setPrompt(null); ui.toasts.replaceChildren();
    ui.card.innerHTML = ui.journal.innerHTML = ui.lightbox.innerHTML = '';
    ui.current = undefined;
    root.classList.remove('prewarm', 'bare');
  }
}
