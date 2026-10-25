// Sitting on a bench (орон): the view turns from the bench to the room and lowers to a sitting eye;
// you keep looking around. E (with nothing in focus), a step or a jump stands you up again.
import * as THREE from 'three/webgpu';
import { clamp, damp, yawTo, angleDiff, ease } from '../util.js';

const SIT_EYE = 0.74; // seated eye height above the bench top
const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

export class Seat {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.k = 0; // 0 standing … 1 seated (camera blend)
    this.eye = new THREE.Vector3();
    this.stand = new THREE.Vector3();
    this.act = {
      id: 'sit', label: { sah: 'олор', en: 'sit down', ru: 'сесть' }, thenCard: false, freeze: true,
      run: (g, it) => this.sit(it),
    };
    this.standAct = { id: 'stand', label: { sah: 'тур', en: 'stand up', ru: 'встать' }, thenCard: false, run: async () => this.up() };
    this.label = { sah: 'олорор', en: 'sitting', ru: 'сидя' };
  }

  async sit(it) {
    const g = this.game, pl = g.player, hit = g.focusHit;
    if (this.on || !hit || hit.it !== it) return;
    // the bench top under the point looked at, a hand's width in from the edge
    const box = new THREE.Box3().setFromObject(hit.object);
    const p = hit.point.clone();
    const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
    p.x += dx / d * 0.14; p.z += dz / d * 0.14;
    p.x = clamp(p.x, box.min.x + 0.12, box.max.x - 0.12);
    p.z = clamp(p.z, box.min.z + 0.12, box.max.z - 0.12);
    this.eye.set(p.x, Math.min(box.max.y, pl.pos.y + 0.6) + SIT_EYE, p.z);
    this.stand.copy(pl.pos);
    // turn round to face where you came from
    const y0 = pl.yaw, y1 = y0 + angleDiff(y0, yawTo(pl.pos.x - p.x, pl.pos.z - p.z));
    const p0 = pl.pitch;
    g.audio?.play('bench', this.eye);
    this.on = true;
    const t0 = performance.now(), dur = 900;
    await new Promise((res) => {
      const f = () => {
        const k = Math.min(1, (performance.now() - t0) / dur), e = ease(k);
        pl.yaw = pl.aimYaw = y0 + (y1 - y0) * e;
        pl.pitch = pl.aimPitch = p0 + (-0.05 - p0) * e;
        this.k = e;
        if (k < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
  }

  up() {
    if (!this.on) return;
    this.on = false;
    this.game.promptKey = null;
  }

  // after the player's own update: hold the body still and blend the camera to the seat
  update(dt) {
    const g = this.game, pl = g.player, inp = g.input;
    if (this.on && !pl.frozen) {
      if (MOVE.some((c) => inp.down(c)) || Math.hypot(inp.stickX || 0, inp.stickY || 0) > 0.3) this.up();
    }
    if (this.on) {
      pl.pos.copy(this.stand);
      pl.vel?.set(0, 0);
    } else if (this.k > 0) this.k = Math.max(0, damp(this.k, 0, 7, dt) - 0.002);
    if (this.k > 0) {
      const cam = g.engine.camera;
      cam.position.lerp(this.eye, this.k);
    }
  }
}
