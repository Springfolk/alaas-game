// The interface's drawn glyphs (24 px grid, stroked in the current colour) and which one shows an act: the look
// prompt, the touch hand button and the journal draw the act of the moment by its own tool, not a generic hand.
const P = {
  hand: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V13m0-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.7-2.3L4 14.5a1.6 1.6 0 0 1 2.4-2L8 14',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
  put: 'M12 4v10M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14',
  back: 'M8.5 4.5L4 9l4.5 4.5M4 9h10.5a5 5 0 0 1 0 10H9',
  up: 'M12 20V5M6 11l6-6 6 6',
  down: 'M12 4v15M6 13l6 6 6-6',
  axe: 'M4.5 20.5L14 8M11.5 5.5l6.5 6c2.4-1.7 3.3-4.6 2.4-8-3.5-.8-6.6-.2-8.9 2z',
  scythe: 'M5 21L15.5 4.5M15.5 4.5c3.6-1.3 6 .9 6 5.5-1.3-2.4-3.6-3.4-7.3-3.2',
  hammer: 'M5 20.5l8.5-10.5M10.5 6.5l4.6-3.7 5.6 6.9-4.6 3.7z',
  flame: 'M12 3c1 3.6 5 5.6 5 10.2a5 5 0 0 1-10 0c0-2 .9-3.3 2-4.1.2 1.7 1 2.5 1.8 2.7C10.6 9 11 6 12 3z',
  drop: 'M12 3.5c3 4 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6 5.5-10z',
  pail: 'M5.5 9h13L17 20H7zM6 9c0-5 12-5 12 0',
  log: 'M17 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM14.7 5.6L4.7 13.4a3 3 0 0 0 3.8 4.7l10.3-8',
  stack: 'M8 13a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM16 13a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  round: 'M8 4h8v8H8zM4.5 12h15v7.5h-15zM12 4v4',
  berry: 'M12 10a5.2 5.2 0 1 0 0 10.4A5.2 5.2 0 0 0 12 10zM12 10c-1-3.2-3-4.6-5.5-4.6C7.5 8 9 9.7 12 10zm0 0c1-3.2 3-4.6 5.5-4.6C16.5 8 15 9.7 12 10z',
  sit: 'M4 15h16M6 15v5.5M18 15v5.5M12 3v8M8.5 7.5L12 11l3.5-3.5',
  stand: 'M4 20h16M12 16V4M7.5 8.5L12 4l4.5 4.5',
  door: 'M6.5 21V4h11v17M4 21h16M14.5 12.5v.01',
  gate: 'M5 4v16M19 4v16M5 8.5h14M5 13h14M5 17.5h9',
  lid: 'M5 13h14M7 13v7h10v-7M8 9.5h8M12 9.5V5',
  ribbon: 'M12 3v5M12 8a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 12 8zM11 11c-2.5 2-3.3 5.5-2.5 10M13 11c2.5 2 3.3 5.5 2.5 10',
  tree: 'M12 21v-8M12 13.5a5.3 5.3 0 1 0 0-10.6 5.3 5.3 0 0 0 0 10.6zM9 21h6',
  ladle: 'M6 3l6.5 10M9 13h11a5.5 5.5 0 0 1-11 0z',
  cup: 'M7 4h10c0 5.5-2 8.5-5 8.5S7 9.5 7 4zM12 12.5V17M8 20.5l4-3.5 4 3.5',
  khomus: 'M9.2 4.5a4 4 0 1 0 5.6 0M10.3 10.3V20M13.7 10.3V20M12 6.5V21l2.2 1',
  trap: 'M3.5 12L18 5.5v13zM18 5.5c2.3 2 2.3 11 0 13M9 9.5v5M13.5 7.5v9',
  fish: 'M3 12c3-4.3 9-5.3 13-1l4.5-3.3v8.6L16 13c-4 4.3-10 3.3-13-1zM7.5 11.2v.01',
  fold: 'M3.5 18h17M6 18l1.5-9M18 18l-1.5-9M10 6l2-2.5L14 6',
  peg: 'M12 3v11M8.5 6.5h7M12 14l-2 6.5h4z',
  bellows: 'M3.5 8.5l10.5-3v13l-10.5-3zM14 10h6.5v4H14zM7 9.5v5',
  tongs: 'M6.5 3l5 9-3 9M17.5 3l-5 9 3 9M9.8 9.3h4.4',
  churn: 'M12 2.5v13M7 15.5h10M12 15.5V21M8.5 6L12 2.5 15.5 6',
  book: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
  pause: 'M9 6v12M15 6v12',
  close: 'M6 6l12 12M18 6L6 18',
  jump: 'M12 19V6M6 11l6-6 6 6',
  crouch: 'M12 5v13M6 13l6 6 6-6',
  play: 'M8 5.5v13l11-6.5z',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.01',
  exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c-3 2.5-3 15.5 0 18M12 3c3 2.5 3 15.5 0 18',
  map: 'M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chev: 'M9 5l7 7-7 7',
  caret: 'M6 9l6 6 6-6',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0 .01M9 21l2.5-6.5L9.5 11l1.5-4 4 1 2 3.5M11.5 14.5l3 2 1 4.5M10.5 8L7 10v3',
  pin: 'M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  me: 'M12 3l7 17-7-4-7 4z',
  look: 'M4 9a8.5 8.5 0 0 1 16 0M20 4.5V9h-4.5M20 15a8.5 8.5 0 0 1-16 0M4 19.5V15h4.5',
  fovN: 'M12 20L8.5 4M12 20l3.5-16', fovW: 'M12 20L2.5 8M12 20l9.5-12',
  still: 'M3 12h18', wave: 'M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0 2.5-3.5 5-3.5',
  zig: 'M3 16l4-8 4 8 4-8 4 8', curve: 'M3 16c5-10.5 13-10.5 18 0',
  vol0: 'M4 9.5h4l5-4v13l-5-4H4z', vol: 'M4 9.5h4l5-4v13l-5-4H4zM16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
  battery: 'M3 8h15v8H3zM18 10.5h3v3h-3M6.5 10.5v3M9.5 10.5v3',
  flip: 'M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5',
  quality: 'M3 17l5-7 4 4 3-5 6 8zM16.5 5.5a1.5 1.5 0 1 0 0 .01',
};
export const icon = (k, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k] || P.hand}"/></svg>`;

// act id → its glyph (an act may also carry its own `icon`)
const OF = {
  take: 'hand', 'take-log': 'log', down: 'put', back: 'back', stack: 'stack', 'stack-all': 'stack', fill: 'pail', pour: 'drop', lay: 'flame',
  feed: 'flame', pick: 'berry', sit: 'sit', stand: 'stand', door: 'door', gate: 'gate', lid: 'lid', ribbon: 'ribbon',
  choron: 'cup', 'fill-choron': 'ladle', milk: 'drop', play: 'khomus',
  strike: 'axe', 'strike-again': 'axe', 'free-axe': 'up', 'stick-axe': 'axe', 'place-round': 'round', 'stand-half': 'round',
  'set-tuu': 'trap', 'lift-tuu': 'up', 'pour-tuu': 'fish', mow: 'scythe', 'hang-scythe': 'back',
  'warm-bark': 'flame', 'lay-bark': 'put', 'fold-bark': 'fold', 'pin-bark': 'peg', 'try-bark': 'hand',
  bellows: 'bellows', 'to-anvil': 'tongs', 'to-fire': 'flame', quench: 'drop', churn: 'churn',
};
export const actIcon = (act) => (act ? act.icon || OF[act.id] || (/^hammer/.test(act.id) ? 'hammer' : 'hand') : 'hand');
// acts whose motion lasts for as long as the do input is held (the prompt and the touch button show a hold)
const HELD = new Set(['take-log', 'stack', 'fill', 'pour', 'pick', 'gate', 'choron', 'milk', 'play', 'strike', 'strike-again', 'lift-tuu', 'pour-tuu', 'mow',
  'warm-bark', 'fold-bark', 'pin-bark', 'try-bark', 'bellows', 'churn']);
export const actHeld = (act) => !!act && (act.hold ?? (HELD.has(act.id) || /^hammer/.test(act.id)));

// the mouse with one button lit, or moved (the prompt, the hints, the controls page)
const mouse = (d) => `<svg class="mouse" viewBox="0 0 14 20" aria-hidden="true"><rect x="1" y="1" width="12" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="${d}" fill="currentColor"/></svg>`;
export const MOUSE = { left: mouse('M7 1.2A5.8 5.8 0 0 0 1.2 7v2.2H7z'), right: mouse('M7 1.2A5.8 5.8 0 0 1 12.8 7v2.2H7z'), move: mouse('M6.3 3.5h1.4v3.4H6.3z') };
// a control as it is drawn: its keys, or the touch control that does it (`c`: a row of CONTROLS, src/ui/i18n.js)
export function glyph(c, touch = false) {
  if (touch) {
    const t = c.touch;
    if (!t) return '';
    if (t === 'stick' || t === 'rim') return `<svg class="ic stick" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="${t === 'rim' ? 17.5 : 12}" cy="12" r="4.2" fill="currentColor"/></svg>`;
    if (t === 'drag') return icon('look');
    return `<span class="tbtn${t === 'hand' ? ' do' : t === 'eye' ? ' read' : ''}">${icon(t)}</span>`;
  }
  return c.keys.map((k) => (k === 'mouse' ? MOUSE.move : k === 'mouseL' ? MOUSE.left : k === 'mouseR' ? MOUSE.right : `<kbd>${k}</kbd>`)).join('');
}
