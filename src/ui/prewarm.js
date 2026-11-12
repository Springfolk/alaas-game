// A browser compiles the 2D shaders for each kind of paint (a glass panel's gradient in a rounded clip, a picture in
// a rounded frame, a blurred shadow, a layer drawn through a rounded clip…) the first time it draws one, in the GPU
// process the game's frames go through too: the first prompt, toast, card, menu or gauge held them up 80–420 ms
// (headless Chrome, a fresh profile). So every interface surface is drawn once while loading, in each of its states,
// a few per pair of frames, from the start of the load (the GPU process has little else to do then).
// Drawn for real, under the key art (`.prewarm`, index.html: the key art a shade short of opaque, or what it hides
// is not drawn at all); opacity on the surfaces themselves would change which shaders they need. Without the key
// art (?auto) they are shown at 1% instead, which covers most.
import { BY_ID } from './ui.js';
import { LESSONS } from './teach.js';

export async function prewarmUI(game) {
  const ui = game.ui, root = document.documentElement, undo = [];
  const frames = (n = 2) => new Promise((ok) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : ok()); f(); });
  // classes put on for the pass (and taken off after it, unless they were there)
  const on = (sel, ...cls) => {
    for (const el of document.querySelectorAll(sel)) for (const c of cls) if (!el.classList.contains(c)) { el.classList.add(c); undo.push(() => el.classList.remove(c)); }
  };
  const touch = game.touch; // its controls: one set at a time (`show` overrides what its own sync picks)
  // a card with a gallery; its pictures are swapped for the key art (in the cache already: nothing is fetched)
  const ids = Object.keys(BY_ID), id = ids.find((k) => ui.images[k]?.length > 1 && BY_ID[k].related?.length) || ids[0];
  const keyart = document.getElementById('keyart'), covered = !!keyart && getComputedStyle(keyart).display !== 'none';
  const art = keyart?.querySelector('img')?.currentSrc;
  const pictures = (el) => { for (const im of el.querySelectorAll('img')) { if (art) { im.loading = 'eager'; im.src = art; } else im.remove(); } };
  root.classList.add('prewarm');
  if (!covered) root.classList.add('bare');
  // names mid-fade (src/ui/names.js): a language that fades, both names part-way
  const lang = ui.state.lang;
  if (lang === 'sah') ui.state.lang = 'en';
  root.style.setProperty('--nm', '.25');
  try {
    // each surface at rest first, then its other states (the stick at rest and pushed are different gradients)
    on('#fps', 'on'); on('#vcursor', 'on');
    if (touch) touch.show = 'play';
    ui.setPrompt(BY_ID[id], { act: { id: 'strike', label: { en: 'Алаас' } }, read: true, put: { id: 'down' } }); // with every part it can have
    ui.toast('<b>Алаас</b><small>Алаас</small>', 1e9);
    ui.discovered(id);
    await frames(3);
    on('#dot', 'on'); on('.tc-btn', 'down'); on('.tc-stick', 'on');
    on('.toast', 'out'); // a beat fading: a layer of its own
    await frames();
    on('#dot', 'do');
    root.style.setProperty('--nm', '.75');
    const choice = document.getElementById('choice'); // the ribbon choice (yard/bits.js)
    choice.innerHTML = '<button style="--c:#f1efe8"><i></i><span>Алаас</span></button><button class="on" style="--c:#8fb9e6"><i></i><span>Алаас</span></button><button class="x">✕</button>';
    on('#choice', 'show'); undo.push(() => { choice.innerHTML = ''; });
    on('.tc-stick', 'run');
    // the inspect stage: its type on the scrim, the strip, a photograph beside the thing, the names on it, the
    // reading sheet, a photograph-led card, the dip of a cut, the enlarged photograph
    on('#dip', 'on');
    ui.showEntry(id, { mode: 'peek', kind: 'near', fresh: true });
    ui.card.querySelector('.st-marks').innerHTML = '<button class="st-mark on" style="transform:translate(40px,40px)"><i></i>Алаас</button>';
    pictures(ui.card);
    await frames(3);
    ui.setImage(0, true);
    if (touch) touch.show = 'ui';
    pictures(ui.card);
    await frames(3);
    ui.showEntry(id, { mode: 'full', kind: 'near' });
    on('#card .sel', 'open');
    await frames(3);
    ui.showEntry(id, { mode: 'peek', kind: 'photo' });
    pictures(ui.card);
    await frames(3);
    ui.enlarge();
    pictures(ui.lightbox);
    await frames(3);
    ui.showJournal('map'); // the journal: its map with a marker of every kind, then its two lists
    ui.j.demo();
    if (touch) touch.show = 'choice';
    await frames(3);
    for (const tab of ['finds', 'work']) { ui.showJournal(tab); pictures(ui.journal.querySelector('.j-leaf.on')); await frames(3); }
    ui.j.reset();
    ui.close();
    for (const L of LESSONS) { game.teach.show(L); on('.tc-btn, .tc-stick', 'tc-teach'); on('#teach-ghost', 'on'); await frames(2); } // each lesson's drawing, the ring on a button
    game.teach.show(null);
    on('#pause', 'show'); on('#tab-settings .settings', 'adv'); // with the advanced video options open
    await frames();
    on('#pause .sel', 'open'); // the selects' lists
    await frames();
    for (const tab of document.querySelectorAll('#pause .tab')) { on('#pause .menu', 'paged'); on(`#${tab.id}`, 'on'); await frames(); }
    document.getElementById('pause').classList.remove('show');
    // what is made once the world is built: the journal's finder marker
    for (const t = performance.now(); !game.guide && performance.now() - t < 60000;) await frames(6);
    on('#guide', 'on'); on('#gshimmer', 'on');
    await frames(14);
    on('#guide', 'edge');
    await frames(3);
  } finally {
    for (const u of undo.reverse()) u();
    ui.state.lang = lang; root.style.removeProperty('--nm');
    if (touch) touch.show = null;
    ui.close(); ui.setPrompt(null); ui.toasts.replaceChildren();
    ui.card.innerHTML = ui.lightbox.innerHTML = '';
    ui.current = undefined; ui.kind = undefined; ui.marks = null;
    root.classList.remove('prewarm', 'bare');
  }
}
