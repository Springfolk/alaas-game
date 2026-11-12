// A sun glint at the empty winter place (кыстык), the one hint that it is there: now and then, seen from
// 60–400 m, a brief star flickers on the winter balagan's west window, as off a mica pane (or a watch face).
// Only while the sun lights that wall and the window faces you; it fades out closer than ~40 m and never
// shows again once the place is found. One additive sprite, added before the warm-up; only its opacity
// uniform and transform change (userData.dynamic keeps it out of the merge).
import * as THREE from 'three/webgpu';
import { uniform, uv, vec3, vec4, float, abs, exp, max, mix } from 'three/tsl';

const ENTRY = 'sayylyk-kystyk';
const PX = 34; // sprite size on screen, rays included

// A sun glint's star (core, halo, four rays, faint diagonals) as an additive sprite material: `op` its opacity,
// `col` its colour node (HDR). Also the job hints' glint (src/interact/hints.js).
export function glintMaterial(op, col) {
  const m = new THREE.SpriteNodeMaterial({ name: 'glint', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const p = uv().sub(0.5).mul(2), a = abs(p);
  const core = exp(p.dot(p).mul(-60)), halo = exp(p.dot(p).mul(-9)).mul(0.25);
  const rays = max(exp(a.x.mul(-26)).mul(exp(a.y.mul(-4.5))), exp(a.y.mul(-26)).mul(exp(a.x.mul(-4.5))));
  const diag = exp(abs(a.x.sub(a.y)).mul(-30)).mul(exp(p.dot(p).mul(-14))).mul(0.4);
  const shape = core.add(halo).add(rays).add(diag).min(float(1));
  m.colorNode = vec4(col, shape.mul(op));
  return m;
}

// Soft light as an additive sprite material (the job hints' bloom, halo, light shaft and the glare at the view's
// edge, src/interact/hints.js): `op` opacity, `col` colour (HDR), `ring` a faint ring of light round the bloom
// (a halo in haze), `shaft` 0 → 1 a round bloom → a shaft of sunlight falling on the sprite's foot, wider aloft
// (stretch the sprite tall for it, `rot` leans it towards the sun). `edge`: drawn over everything (no depth test).
export function lightMaterial(op, col, ring, shaft, edge = false, rot = null) {
  const m = new THREE.SpriteNodeMaterial({ name: edge ? 'glare' : 'halo', transparent: true, depthWrite: false, depthTest: !edge, blending: THREE.AdditiveBlending, fog: false });
  const p = uv().sub(0.5).mul(2), r2 = p.dot(p);
  const bloom = exp(r2.mul(-5)).mul(0.35).add(exp(r2.mul(-40)).mul(0.65)), r = r2.sqrt();
  const halo = exp(r.sub(0.6).pow(2).mul(-16)).mul(0.16).mul(ring);
  const foot = p.y.add(1).mul(0.5); // 0 at the foot, 1 at the top
  const xw = p.x.div(foot.mul(0.4).add(0.6));
  const column = exp(xw.mul(xw).mul(-2.6)).mul(foot.mul(8).min(1)).mul(foot.oneMinus().pow(1.3));
  const shape = mix(bloom.add(halo), column, shaft).min(float(1));
  m.colorNode = vec4(col, shape.mul(op));
  if (rot) m.rotationNode = rot;
  return m;
}

export class Glint {
  constructor(game) {
    this.game = game;
    const w = game.world;
    // the west window of the winter balagan: the 'muus-tunnuk' proxy nearest to the winter placement
    const home = w.placed.find((p) => p.variant === 'winter');
    const near = (i) => { const q = i.target.getWorldPosition(new THREE.Vector3()); return Math.hypot(q.x - home.x, q.z - home.z) < 12; };
    const wins = home && w.interactables.find((i) => i.entry === 'muus-tunnuk' && i.target && near(i));
    if (!wins?.target.children.length) return;
    wins.target.updateWorldMatrix(true, true);
    const win = wins.target.children.map((c) => c.getWorldPosition(new THREE.Vector3())).sort((a, b) => a.x - b.x)[0]; // westmost
    this.normal = new THREE.Vector3(win.x - home.x, 0, win.z - home.z).normalize();
    this.pos = win.clone().addScaledVector(this.normal, 0.25); // just proud of the mica pane

    this.op = uniform(0);
    const m = glintMaterial(this.op, vec3(1, 0.95, 0.84).mul(14));
    this.sprite = new THREE.Sprite(m);
    this.sprite.position.copy(this.pos);
    this.sprite.castShadow = this.sprite.receiveShadow = false;
    this.sprite.renderOrder = 10;
    this.sprite.userData.dynamic = true;
    game.engine.scene.add(this.sprite);
    this.next = 3; this.t = -1; this.v = new THREE.Vector3();
  }

  update(dt) {
    if (!this.sprite) return;
    const g = this.game, cam = g.engine.camera;
    const d = cam.position.distanceTo(this.pos);
    const sun = g.engine.sun.position, to = this.v.subVectors(cam.position, this.pos).normalize();
    const can = !g.state.found.has(ENTRY) && d > 40 && d < 400 && sun.y > 0.05 && this.normal.dot(sun) > 0.05 && this.normal.dot(to) > 0.15;
    if (this.t < 0) { // waiting for the next glint
      if ((this.next -= dt) <= 0) { this.next = 5 + Math.random() * 7; if (can) this.t = 0; }
      this.op.value = 0;
    } else { // ~0.45 s: a quick rise, a flicker, and out
      this.t += dt;
      const k = this.t / 0.45;
      if (k >= 1 || !can) { this.t = -1; this.op.value = 0; } else {
        const near = Math.min(1, (d - 40) / 25) * Math.min(1, (400 - d) / 60);
        this.op.value = Math.sin(Math.PI * k) ** 2 * (0.75 + 0.25 * Math.sin(this.t * 70)) * near;
      }
    }
    // a constant size on screen
    const s = d * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * PX / innerHeight;
    this.sprite.scale.set(s, s, 1);
  }
}
