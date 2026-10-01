// First-person wading controller: pointer-lock mouse look, WASD, sprint, head bob,
// collision against the world's colliders, stairs via ground height.
import * as THREE from 'three';
import { settings } from '../core/Settings.js';

const EYE = 1.62;
const RADIUS = 0.38;
const STEP_UP = 0.42;

export class PlayerController {
  constructor(camera, world, events, dom) {
    this.camera = camera;
    this.world = world;
    this.events = events;
    this.dom = dom;

    this.feet = new THREE.Vector3(-0.1, world.layout.floorY, 3.7);
    this.vel = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.accelLocal = new THREE.Vector3();
    this.yaw = 0.2;
    this.pitch = -0.08;
    this.yawRate = 0;
    this.pitchRate = 0;
    this._mouse = { dx: 0, dy: 0 };
    this.keys = new Set();
    this.locked = false;
    this.sprinting = false;
    this.bobPhase = 0;
    this.bob = new THREE.Vector3();
    this.bobAmount = 0;
    this.roll = 0;
    this.fovBoost = 0;
    this.enabled = true;

    camera.rotation.order = 'YXZ';

    dom.addEventListener('click', () => {
      if (!this.locked) dom.requestPointerLock?.();
      else events.emit('focusToggle');
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      events.emit('pointerlock', this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this._mouse.dx += e.movementX || 0;
      this._mouse.dy += e.movementY || 0;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') events.emit('focusToggle');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get inWater() {
    return this.feet.y < this.world.layout.waterLevel - 0.02;
  }

  update(dt) {
    const p = settings.player;
    // ---- look ----
    const sens = 0.0021 * p.sensitivity;
    const dYaw = -this._mouse.dx * sens;
    const dPitch = -this._mouse.dy * sens;
    this._mouse.dx = this._mouse.dy = 0;
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -1.45, 1.45);
    const rateK = 1 - Math.exp(-dt * 12);
    this.yawRate += (dYaw / Math.max(dt, 1e-4) - this.yawRate) * rateK;
    this.pitchRate += (dPitch / Math.max(dt, 1e-4) - this.pitchRate) * rateK;

    // ---- move ----
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && fz < 0;
    let speed = p.walkSpeed * (this.sprinting ? p.sprintMultiplier : 1);
    if (this.inWater) speed *= 0.88;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = (fx * cos + fz * sin) * speed;
    const tz = (-fx * sin + fz * cos) * speed;
    // Wading inertia: slow to start, slow to stop.
    const accel = 1 - Math.exp(-dt * (len > 0 ? 5.5 : 4.0));
    this.prevVel.copy(this.vel);
    this.vel.x += (tx - this.vel.x) * accel;
    this.vel.z += (tz - this.vel.z) * accel;

    const feetY = this.feet.y;
    const tryMove = (nx, nz) => {
      if (this.world.blocked(nx, nz, RADIUS, feetY)) return false;
      const g = this.world.groundHeight(nx, nz);
      return g - feetY <= STEP_UP;
    };
    const nx = this.feet.x + this.vel.x * dt;
    if (tryMove(nx, this.feet.z)) this.feet.x = nx; else this.vel.x *= 0.2;
    const nz = this.feet.z + this.vel.z * dt;
    if (tryMove(this.feet.x, nz)) this.feet.z = nz; else this.vel.z *= 0.2;
    const ground = this.world.groundHeight(this.feet.x, this.feet.z);
    this.feet.y += (ground - this.feet.y) * (1 - Math.exp(-dt * 14));

    // local-space acceleration (for lantern sway)
    const ax = (this.vel.x - this.prevVel.x) / Math.max(dt, 1e-4);
    const az = (this.vel.z - this.prevVel.z) / Math.max(dt, 1e-4);
    this.accelLocal.set(ax * cos - az * sin, 0, ax * sin + az * cos);

    // ---- head bob + footsteps ----
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const moving = hs > 0.15;
    this.bobAmount += ((moving ? Math.min(hs / 2.0, 1.4) : 0) - this.bobAmount) * (1 - Math.exp(-dt * 6));
    const prevPhase = this.bobPhase;
    this.bobPhase += dt * (hs * 2.6 + (moving ? 0.6 : 0));
    const stepIdx = Math.floor(this.bobPhase / Math.PI);
    if (moving && stepIdx !== Math.floor(prevPhase / Math.PI)) {
      this.events.emit('footstep', {
        x: this.feet.x + Math.cos(this.yaw) * (stepIdx & 1 ? 0.15 : -0.15),
        z: this.feet.z - Math.sin(this.yaw) * (stepIdx & 1 ? 0.15 : -0.15),
        wet: this.inWater, speed: hs, sprint: this.sprinting, side: stepIdx & 1,
      });
    }
    const b = this.bobAmount * p.bob;
    this.bob.set(
      Math.cos(this.bobPhase) * 0.028 * b,
      -Math.abs(Math.sin(this.bobPhase)) * 0.045 * b + 0.02 * b,
      0,
    );
    this.roll += ((-fx * 0.018 + Math.cos(this.bobPhase) * 0.006 * b) - this.roll) * (1 - Math.exp(-dt * 5));

    // ---- camera ----
    const cam = this.camera;
    cam.position.set(this.feet.x, this.feet.y + EYE, this.feet.z);
    cam.position.x += this.bob.x * cos;
    cam.position.z -= this.bob.x * sin;
    cam.position.y += this.bob.y;
    cam.rotation.set(this.pitch + Math.sin(this.bobPhase * 2) * 0.004 * b, this.yaw, this.roll);
    this.fovBoost += ((this.sprinting && hs > 2.5 ? 5 : 0) - this.fovBoost) * (1 - Math.exp(-dt * 4));
    const fov = p.fov + this.fovBoost;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
