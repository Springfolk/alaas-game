// Offline play (docs/offline.md): registers the service worker (public/sw.js) in a production build served over
// http(s); the installed app then has it fetch every file play can ask for (textures at the sizes this
// device loads: 256, the tier's edge and half of it). `?offline`: the same in a browser tab (tests).
import SIZES from '../data/tex-sizes.json';
import { FIRST, sized } from './texsize.js';
import { textureMax } from '../engine/materials.js';

const BASE = import.meta.env.BASE_URL;

export function offline(game) {
  if (!import.meta.env.PROD || !navigator.serviceWorker || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register(BASE + 'sw.js').catch((e) => console.warn('offline: no service worker', e));
  const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
  if (!installed && !new URLSearchParams(location.search).has('offline')) return;
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.offline === 'done') game.offline = true; });
  game.sharpening.then(async () => {
    const [reg, { files }] = await Promise.all([navigator.serviceWorker.ready, fetch(BASE + 'offline.json', { cache: 'no-cache' }).then((r) => r.json())]);
    const tex = Object.keys(SIZES).flatMap((rel) => [FIRST, textureMax() / 2, textureMax()].map((max) => sized(`${BASE}assets/tex/${rel}`, max)));
    reg.active.postMessage({ offline: [...files.filter((f) => !f.startsWith('assets/tex/')), ...new Set(tex)] });
  }).catch((e) => console.warn('offline:', e));
}
