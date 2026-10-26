// First-person body: look (optional smoothing), momentum walk/run/crouch, jump with a gather and
// landing compression, vault over low obstacles, ground following, circle-vs-collider sliding,
// footfall-synced camera (bob, sway, roll, strafe lean, run FOV) and step events for footsteps.
// All camera motion scales with settings.motion (0 = steady camera, 1 = full).
import * as THREE from 'three/webgpu';
import { clamp, damp, lerp, smooth, angleDiff, fwdX, fwdZ, rightX, rightZ } from './util.js';

const EYE = 1.62, CROUCH_EYE = 1.05, RADIUS = 0.28;
const WALK = 1.67, RUN = 3.03, CROUCH = WALK * 0.8, BACK = 0.72;   // m/s (walk 10:00, run 5:30 min/km)
const WALK_SPM = 130, RUN_SPM = 180;                          // steps per minute: a brisk walk, a real run's cadence
const GRAVITY = 15, JUMP_V = 3.5, STEP_DOWN = 0.42;          // m/s², m/s (≈0.4 m hop), m
const LOOK = 0.0022, TOUCH_LOOK = 0.0058;                     // rad per mouse / touch pixel at sens 1
const _ray = new THREE.Raycaster(), _o = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

export class Player {
  constructor(camera, world, input) {
    this.camera = camera; this.world = world; this.input = input;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;          // the view
    this.aimYaw = 0; this.aimPitch = 0;    // where look input points (the view follows, smoothed or not)
    this.vel = new THREE.Vector2();
    this.vy = 0; this.grounded = true;
    this.eye = EYE; this.camY = 0;
    this.crouch = false;
    this.stepPhase = 0; this.bob = 0; this.runK = 0;
    this.spring = 0; this.springV = 0;     // camera compression (footfalls, jumps, landings)
    this.roll = 0; this.lead = 0; this.nod = 0; this.fovKick = 0;
    this.jumpT = -1;                       // >= 0 while gathering for a jump
    this.vault = null;                     // { t, dur, from, to, top, roll }
    // motion: 0..1 camera motion (bob, sway, roll, FOV kick); smooth: 0..1 mouse-look smoothing; fov: base degrees
    this.settings = { sens: 1, invertY: false, motion: 1, smooth: 0, fov: camera.fov };
    this.frozen = false;
    this.onStep = null; // (surface, speed) => void; speed > 2.6 plays the heavy (run / jump / landing) step
    this.speed = 0;
  }
  place(x, z, yaw = 0) {
    this.pos.set(x, this.world.groundAt(x, z), z);
    this.camY = this.pos.y;
    this.yaw = this.aimYaw = yaw; this.pitch = this.aimPitch = 0;
    this.vel.set(0, 0); this.vy = 0; this.grounded = true; this.vault = null;
  }
  surface() { return this.world.surfaceAt(this.pos.x, this.pos.z, this.pos.y); }

  update(dt) {
    const inp = this.input, S = this.settings, M = clamp(S.motion ?? 1, 0, 1);
    const live = inp.active && !this.frozen;

    // ── look ──
    if (this.frozen) { this.aimYaw = this.yaw; this.aimPitch = this.pitch; }
    else if (inp.active) {
      const inv = S.invertY ? -1 : 1;
      this.aimYaw -= (inp.mdx * LOOK + inp.lookX * TOUCH_LOOK) * S.sens;
      this.aimPitch = clamp(this.aimPitch - (inp.mdy * LOOK + inp.lookY * TOUCH_LOOK) * S.sens * inv, -1.45, 1.45);
    }
    const prevYaw = this.yaw;
    const sm = Math.max(S.smooth || 0, inp.touchMode ? 0.3 : 0);
    if (sm <= 0.001 || dt <= 0) { this.yaw = this.aimYaw; this.pitch = this.aimPitch; }
    else { const k = lerp(60, 9, sm); this.yaw = damp(this.yaw, this.aimYaw, k, dt); this.pitch = damp(this.pitch, this.aimPitch, k, dt); }

    // ── intent ──
    let mx = 0, mz = 0, wantRun = false;
    if (live) {
      if (inp.down('KeyW') || inp.down('ArrowUp')) mz += 1;
      if (inp.down('KeyS') || inp.down('ArrowDown')) mz -= 1;
      if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
      if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
      wantRun = inp.down('ShiftLeft') || inp.down('ShiftRight');
      if (inp.stickX || inp.stickY) { // touch stick: analog; pushed to the rim = run
        mx = inp.stickX; mz = inp.stickY;
        wantRun = Math.hypot(mx, mz) > 0.92;
      }
      if (inp.hit('KeyC') || inp.hit('ControlLeft') || inp.hit('Crouch')) this.crouch = !this.crouch;
      if ((inp.hit('Space') || inp.hit('Jump')) && this.grounded && !this.vault && this.jumpT < 0) {
        if (this.crouch) this.crouch = false; // from a crouch, the first press stands up
        else this.startJump();
      }
    }
    const mag = Math.min(1, Math.hypot(mx, mz));
    const run = wantRun && !this.crouch && mz > 0.35 && this.grounded;
    this.runK = damp(this.runK, run ? 1 : 0, run ? 2.4 : 5, dt); // a run builds up, eases off quicker
    const top = this.crouch ? CROUCH : lerp(WALK, RUN, this.runK);
    const speed = top * (mz < -0.1 ? BACK : 1) * (mag > 0.05 ? Math.max(0.3, mag) : 0);
    const dl = Math.hypot(mx, mz) || 1;
    const tx = (fwdX(this.yaw) * mz + rightX(this.yaw) * mx) / dl * speed;
    const tz = (fwdZ(this.yaw) * mz + rightZ(this.yaw) * mx) / dl * speed;

    // momentum: quick to start a walk, slower to build a run, brakes over ~2 steps, little air control
    const cur = Math.hypot(this.vel.x, this.vel.y);
    const k = !this.grounded ? 1.0 : speed < 0.05 ? 7 : speed > cur + 0.05 && cur > WALK * 0.9 ? 3.2 : 6;
    const pvx = this.vel.x, pvz = this.vel.y;
    if (!this.vault) {
      this.vel.x = damp(this.vel.x, tx, k, dt);
      this.vel.y = damp(this.vel.y, tz, k, dt);
      this.move(dt);
    } else this.updateVault(dt);

    // ── vertical: ground following, falls, landings ──
    if (!this.vault) {
      const g = this.world.groundAt(this.pos.x, this.pos.z);
      if (this.grounded) {
        if (g < this.pos.y - STEP_DOWN) { this.grounded = false; this.vy = 0; } // walked off an edge
        else this.pos.y = g;
      }
      if (!this.grounded && dt > 0) {
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= g) this.land(g);
      }
    }
    if (this.jumpT >= 0) { // the gather before take-off: knees bend, then the push
      this.jumpT += dt;
      if (this.jumpT > 0.075) { this.jumpT = -1; this.vy = JUMP_V; this.grounded = false; this.springV += 0.5; }
    }

    // ── camera body ──
    const sp = Math.hypot(this.vel.x, this.vel.y);
    this.speed = sp;
    // step up onto a rise smoothly; in the air the camera follows the body exactly
    this.camY = this.grounded && !this.vault ? damp(this.camY, this.pos.y, 13, dt) : this.pos.y;
    this.camY = clamp(this.camY, this.pos.y - 0.5, this.pos.y + 0.5);
    // stoop under low lintels and ceilings (world.lows): the eye stays ~14 cm below the beam
    const room = (this.world.headroomAt?.(this.pos.x, this.pos.z, 0.45) ?? Infinity) - this.pos.y - 0.14;
    const eyeTo = Math.max(CROUCH_EYE, Math.min(this.crouch ? CROUCH_EYE : EYE, room));
    this.eye = damp(this.eye, eyeTo, eyeTo < this.eye ? 12 : 7, dt);

    // footfalls: the stride lengthens with speed; the camera is lowest at heel strike (phase 0)
    const stride = this.crouch ? 0.52 : lerp(WALK / WALK_SPM, RUN / RUN_SPM, smooth(WALK, RUN, sp)) * 60;
    const prev = this.stepPhase;
    if (this.grounded && !this.vault) this.stepPhase += sp * dt / stride;
    if (Math.floor(this.stepPhase) !== Math.floor(prev) && sp > 0.35) {
      this.onStep?.(this.surface(), sp);
      this.springV -= (0.06 + 0.1 * smooth(WALK, RUN, sp)) * M; // weight onto the foot
    } else if (this.grounded && sp < 0.25) {
      this.stepPhase = damp(this.stepPhase, Math.round(this.stepPhase), 5, dt); // settle onto both feet
    }
    const amp = (this.crouch ? 0.012 : lerp(0.016, 0.042, smooth(WALK * 0.6, RUN, sp))) * clamp(sp / 0.8, 0, 1) * (this.grounded ? 1 : 0);
    this.bob = damp(this.bob, amp * M, 7, dt);
    const ph = this.stepPhase;
    const bobY = -this.bob * Math.pow(0.5 + 0.5 * Math.cos(ph * Math.PI * 2), 1.6) + this.bob * 0.35;
    const sway = Math.sin(ph * Math.PI) * this.bob * 0.55; // weight shifts foot to foot: one cycle per two steps
    // spring: compression from footfalls / jumps / landings (slightly under-damped)
    if (dt > 0) {
      const SK = 150, SC = 2 * Math.sqrt(SK) * 0.62;
      this.springV += (-SK * this.spring - SC * this.springV) * dt;
      this.spring = clamp(this.spring + this.springV * dt, -0.22, 0.08);
    }

    // lean and lead: roll into strafes and turns, head turns toward the strafe, nods on speed changes
    const vr = this.vel.x * rightX(this.yaw) + this.vel.y * rightZ(this.yaw);
    const vf = this.vel.x * fwdX(this.yaw) + this.vel.y * fwdZ(this.yaw);
    const turn = dt > 0 ? angleDiff(prevYaw, this.yaw) / dt : 0;
    const af = dt > 0 ? ((this.vel.x - pvx) * fwdX(this.yaw) + (this.vel.y - pvz) * fwdZ(this.yaw)) / dt : 0;
    this.roll = damp(this.roll, (-vr * 0.0075 + clamp(turn, -4, 4) * 0.004 * smooth(0.5, RUN, vf)) * M, 5, dt);
    this.lead = damp(this.lead, -vr * 0.012 * M, 3.5, dt);
    this.nod = damp(this.nod, clamp(-af * 0.006, -0.03, 0.03) * M + this.spring * 0.25 * M, 6, dt);
    const fovT = 7.5 * smooth(WALK + 0.4, RUN, sp) * M;
    this.fovKick = damp(this.fovKick, fovT, fovT > this.fovKick ? 2 : 3.5, dt);

    const cam = this.camera;
    cam.position.set(
      this.pos.x + rightX(this.yaw) * sway,
      this.camY + this.eye + bobY + this.spring * M,
      this.pos.z + rightZ(this.yaw) * sway,
    );
    const vaultRoll = this.vault ? this.vault.roll * M : 0;
    cam.rotation.set(this.pitch + this.nod, this.yaw + this.lead, this.roll - sway * 0.12 + vaultRoll, 'YXZ');
    const fov = (S.fov || 72) + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.view) { // ?cam=x,y,z,yaw°,pitch°,fov° (key art)
      const [x, y, z, yaw = 0, pitch = 0, f = fov] = this.view, d = Math.PI / 180;
      cam.position.set(x, y, z); cam.rotation.set(pitch * d, yaw * d, 0, 'YXZ');
      if (cam.fov !== f) { cam.fov = f; cam.updateProjectionMatrix(); }
    }
  }

  // Horizontal move with collider sliding; the lake stops you at knee depth (slide along the shore).
  move(dt) {
    if (dt <= 0) return;
    const ox = this.pos.x, oz = this.pos.z;
    const tryAt = (nx, nz) => {
      const r = this.world.collide(nx, nz, RADIUS, this.pos.y);
      const g = this.world.groundAt(r.x, r.z);
      const w = this.world.terrain.water(r.x, r.z, g);
      return w === null || w - g < 0.45 ? r : null;
    };
    const dx = this.vel.x * dt, dz = this.vel.y * dt;
    const r = tryAt(ox + dx, oz + dz) || tryAt(ox + dx, oz) || tryAt(ox, oz + dz);
    if (!r) { this.vel.set(0, 0); return; }
    this.pos.x = r.x; this.pos.z = r.z;
    // momentum into a wall is lost, along it kept: a slide, never a stick
    const ax = (r.x - ox) / dt, az = (r.z - oz) / dt;
    if (Math.hypot(ax - this.vel.x, az - this.vel.y) > 0.05) {
      const m = Math.hypot(this.vel.x, this.vel.y), am = Math.hypot(ax, az);
      const s = am > m && am > 0 ? m / am : 1;
      this.vel.set(ax * s, az * s);
    }
  }

  land(g) {
    const impact = -this.vy;
    this.pos.y = g; this.vy = 0; this.grounded = true;
    const M = clamp(this.settings.motion ?? 1, 0, 1);
    this.springV -= clamp(impact * 0.16, 0.2, 1.4) * (0.4 + 0.6 * M);
    if (impact > 2.2) this.vel.multiplyScalar(clamp(1.15 - impact * 0.06, 0.6, 1)); // a hard landing eats momentum
    const s = this.surface();
    this.onStep?.(s, 4.6);
    setTimeout(() => this.onStep?.(s, impact > 3 ? 4.4 : 2.2), 70); // the second foot
    this.stepPhase = Math.floor(this.stepPhase) + 0.02;
  }

  // Jump, or vault when a low obstacle (0.3–1.3 m) is right ahead with room behind it.
  startJump() {
    const v = this.findVault(fwdX(this.yaw), fwdZ(this.yaw));
    this.onStep?.(this.surface(), 4.5); // the push-off
    if (v) { this.vault = v; this.springV -= 0.35; return; }
    this.jumpT = 0;
    this.springV -= 0.45; // gather
  }

  findVault(fx, fz) {
    const p = this.pos, y = p.y;
    // blocked straight ahead, and by what?
    const ax = p.x + fx * 0.45, az = p.z + fz * 0.45;
    const probe = this.world.collide(ax, az, RADIUS, y);
    if (Math.hypot(probe.x - ax, probe.z - az) < 0.05) return null;
    const hit = this.contact(ax, az, y);
    if (!hit) return null;
    // how tall: a few rays down onto solid model meshes along the obstacle's middle line
    const near = this.solids().filter((o) => o.s.center.distanceToSquared(_o.set(hit.x, y + 0.7, hit.z)) < (o.s.radius + 0.8) ** 2).map((o) => o.m);
    if (!near.length) return null;
    _ray.layers.set(0); _ray.far = 2.2; _ray.camera = this.camera; // sprites need it
    let top = -Infinity;
    for (const o of [-0.07, -0.035, 0, 0.035, 0.07]) {
      _ray.set(_o.set(hit.x + hit.nx * o, y + 2.1, hit.z + hit.nz * o), _down);
      const h = _ray.intersectObjects(near, false)[0];
      if (h) top = Math.max(top, h.point.y);
    }
    const rise = top - y;
    if (!(rise > 0.3 && rise < 1.3)) return null;
    // a free spot behind it, about level, not in the lake
    for (const d of [0.95, 1.2, 1.5, 1.8]) {
      const tx = p.x + fx * d, tz = p.z + fz * d;
      const g = this.world.groundAt(tx, tz);
      if (Math.abs(g - y) > 0.7) continue;
      const r = this.world.collide(tx, tz, RADIUS, g);
      if (Math.hypot(r.x - tx, r.z - tz) > 0.02) continue;
      const w = this.world.terrain.water(tx, tz, g);
      if (w !== null && w - g > 0.3) continue;
      return { t: 0, dur: 0.42 + rise * 0.22, from: p.clone(), to: new THREE.Vector3(tx, g, tz), top: top + 0.12, roll: 0, side: Math.random() < 0.5 ? -1 : 1 };
    }
    return null;
  }

  // The collider a circle at (x, z) overlaps: the middle of it under the contact, and the push normal.
  contact(x, z, y) {
    for (const k of this.world.colliders) {
      if (k.y0 !== undefined && (y + 1.6 < k.y0 || y > k.y1)) continue;
      if (k.kind === 'circle') {
        const dx = x - k.x, dz = z - k.z, d = Math.hypot(dx, dz);
        if (d < k.r + RADIUS && d > 1e-6) return { x: k.x, z: k.z, nx: dx / d, nz: dz / d };
      } else {
        const dx = x - k.x, dz = z - k.z, lx = dx * k.c - dz * k.s, lz = dx * k.s + dz * k.c;
        if (Math.abs(lx) > k.hw + RADIUS || Math.abs(lz) > k.hd + RADIUS) continue;
        // the middle line of the thin side; normal across it (local → world: x·(c, −s) + z·(s, c))
        const thinX = k.hw < k.hd;
        const mx = thinX ? 0 : clamp(lx, -k.hw, k.hw), mz = thinX ? clamp(lz, -k.hd, k.hd) : 0;
        const nlx = thinX ? 1 : 0, nlz = thinX ? 0 : 1;
        return { x: k.x + mx * k.c + mz * k.s, z: k.z - mx * k.s + mz * k.c, nx: nlx * k.c + nlz * k.s, nz: -nlx * k.s + nlz * k.c };
      }
    }
    return null;
  }

  // Opaque meshes of the placed models with world bounding spheres (built once; grass and cards left out).
  solids() {
    if (this._solids?.n === this.world.placed.length) return this._solids.list;
    const list = [];
    for (const q of this.world.placed) q.object.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (/grass|tuft|flower|leaf|leaves|lashing|rope/i.test(m.name) || mat?.alphaTest > 0 || mat?.transparent) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (m.isInstancedMesh && !m.boundingSphere) m.computeBoundingSphere();
      const s = (m.isInstancedMesh ? m.boundingSphere : m.geometry.boundingSphere).clone().applyMatrix4(m.matrixWorld);
      list.push({ m, s });
    });
    this._solids = { n: this.world.placed.length, list };
    return list;
  }

  // Scripted arc over the obstacle: hands on top, legs swing over to one side, drop on the far side.
  updateVault(dt) {
    const v = this.vault;
    v.t = Math.min(1, v.t + dt / v.dur);
    const t = v.t, e = t * t * (3 - 2 * t);
    this.pos.x = lerp(v.from.x, v.to.x, e);
    this.pos.z = lerp(v.from.z, v.to.z, e);
    const base = lerp(v.from.y, v.to.y, e);
    const lift = Math.sin(Math.min(1, t * 1.25) * Math.PI); // up fast, over, down
    this.pos.y = base + Math.max(0.12, v.top - base - 0.55) * lift;
    v.roll = Math.sin(t * Math.PI) * 0.07 * v.side;
    this.vel.set((v.to.x - v.from.x) / v.dur * 0.7, (v.to.z - v.from.z) / v.dur * 0.7);
    if (t >= 1) { this.vault = null; this.vy = -2.6; this.land(v.to.y); }
  }
}
