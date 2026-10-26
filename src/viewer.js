// Model viewer for building and checking one model module in isolation.
// viewer.html?m=<model>[&variant=winter][&cam=x,y,z][&look=x,y,z][&sun=elev,az][&nopost][&webgl][&ground=0]
// Sets window.ready once the model is built and has rendered a few frames (for tools/shot.mjs).
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from './engine/engine.js';
import { pbr, maps, tex } from './engine/materials.js';
import { mulberry32, strHash } from './util.js';

const q = new URLSearchParams(location.search);
const v3 = (s, d) => (s ? s.split(',').map(Number) : d);
const models = import.meta.glob('./models/*.js');

const engine = await new Engine(document.getElementById('c'), { webgl: q.has('webgl'), post: !q.has('nopost') }).init();
const sun = v3(q.get('sun'), [38, 200]);
engine.setSun(sun[0], sun[1]);
engine.haze.density.value = 0.0002;
const { scene, camera } = engine;

if (q.get('ground') !== '0') {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), pbr('sparse_grass', { repeat: [60, 60] }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
}

const name = q.get('m') || 'serge';
const info = document.getElementById('info');
const fakeWorld = { terrain: { height: () => 0, water: () => null }, interactables: [], engine };
const ctx = { THREE, TSL, pbr, maps, tex, rng: mulberry32(strHash(name)), terrain: fakeWorld.terrain, world: fakeWorld };
const res = await (await models[`./models/${name}.js`]()).default(ctx, { x: 0, y: 0, z: 0, yaw: 0, variant: q.get('variant') });
res.object.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }); // casting is the model's call, as in world.js
scene.add(res.object);

let tris = 0, meshes = 0;
res.object.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.count || 1); } });
info.textContent = `${name} · ${meshes} meshes · ${Math.round(tris / 1000)}k tris · ${engine.backend} · interactables: ${(res.interactables || []).map((i) => i.entry).join(', ')}`;

const box = new THREE.Box3().setFromObject(res.object);
const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
camera.position.fromArray(v3(q.get('cam'), [c.x + size * 0.8, c.y + size * 0.35, c.z + size * 0.8]));
const controls = new OrbitControls(camera, engine.canvas);
controls.target.fromArray(v3(q.get('look'), c.toArray()));
controls.update();

const timer = new THREE.Timer();
let frames = 0;
engine.renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  res.update?.(dt, { dt, time: timer.getElapsed(), camera, game: null });
  controls.update();
  engine.update(dt);
  engine.render();
  if (++frames === 40) window.ready = true;
});
window.viewer = { engine, res, camera, controls };
