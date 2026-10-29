import * as THREE from 'three';
import { WORLD_HALF } from '../world/plan.js';

const EYE_HEIGHT = 1.68;
const RADIUS = 0.35;
const WALK_SPEED = 4.2;
const SPRINT_SPEED = 8.0;
const ACCEL_GROUND = 12;
const ACCEL_AIR = 2.5;
const GRAVITY = 24;
const JUMP_SPEED = 7.2;
const SWIM_DEPTH = 1.25; // feet this far below the surface when afloat
const MOUSE_SENSITIVITY = 0.0022;
const MAX_WALK_SLOPE = 0.62; // normal.y below this is too steep to climb
const WORLD_MARGIN = 20;

// First-person walker: mouse look, WASD, sprint, jump, terrain following and
// simple collision against oriented boxes on the ground plane.
export class Player {
  constructor(camera, input, terrain, colliders = []) {
    this.camera = camera;
    this.input = input;
    this.terrain = terrain;
    this.colliders = colliders;
    // Functions (x, z) -> height | null for walkable things above the terrain.
    this.surfaces = [];
    this.waterLevelAt = null; // set by the game: water surface height at (x, z), or -Infinity
    this.swimming = false;

    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.fovKick = 0;

    this._wish = new THREE.Vector3();
    this._normal = new THREE.Vector3();
  }

  spawn(x, z, yaw = 0) {
    this.position.set(x, this.groundAt(x, z, Infinity), z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.updateCamera(0);
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dt) {
    const input = this.input;

    // Look.
    this.yaw -= input.mouseDX * MOUSE_SENSITIVITY;
    this.pitch -= input.mouseDY * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

    // Movement intent in the horizontal plane.
    let fx = 0;
    let fz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;

    const wish = this._wish.set(fx, 0, fz);
    if (wish.lengthSq() > 0) wish.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);

    const sprinting = (input.down('ShiftLeft') || input.down('ShiftRight')) && fz < 0;
    const targetSpeed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * (this.swimming ? 0.45 : 1);
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wish.x * targetSpeed - this.velocity.x) * k;
    this.velocity.z += (wish.z * targetSpeed - this.velocity.z) * k;

    if (this.onGround && input.wasPressed('Space')) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;

    // Integrate horizontally, refusing to walk up cliffs.
    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // The slope rule is about the terrain; on a bridge deck or porch the ground
    // beneath (a riverbed, say) must not block the way.
    const n = this.terrain.normalAt(this.position.x, this.position.z, this._normal);
    if (n.y < MAX_WALK_SLOPE && !this.onSurface) {
      const uphill = this.velocity.x * n.x + this.velocity.z * n.z < 0;
      if (uphill) {
        // Slide along the slope instead of climbing it.
        this.position.x = prevX;
        this.position.z = prevZ;
        const len = Math.hypot(n.x, n.z) || 1;
        const nx = n.x / len;
        const nz = n.z / len;
        const into = this.velocity.x * nx + this.velocity.z * nz;
        this.velocity.x -= nx * into;
        this.velocity.z -= nz * into;
      }
    }

    this.resolveCollisions();

    const lim = WORLD_HALF - WORLD_MARGIN;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -lim, lim);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -lim, lim);

    // Vertical: gravity, ground contact and sticking to downhill slopes.
    this.position.y += this.velocity.y * dt;
    let ground = this.groundAt(this.position.x, this.position.z, this.position.y);
    // Deep water: float with the head above the surface instead of walking the bed.
    const water = this.waterLevelAt ? this.waterLevelAt(this.position.x, this.position.z) : -Infinity;
    this.swimming = water - ground > SWIM_DEPTH;
    if (this.swimming) {
      ground = water - SWIM_DEPTH;
      if (this.velocity.y < -2) this.velocity.y = -2; // no plunging
    }
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.velocity.y <= 0 && this.position.y - ground < 0.45) {
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    this.updateCamera(dt);
  }

  // Highest walkable height at (x, z) that the feet at y can step onto.
  groundAt(x, z, y) {
    let h = this.terrain.heightAt(x, z);
    this.onSurface = false;
    for (const surface of this.surfaces) {
      const s = surface(x, z);
      if (s !== null && s > h && s <= y + 0.6) {
        h = s;
        this.onSurface = true;
      }
    }
    return h;
  }

  resolveCollisions() {
    const p = this.position;
    for (const b of this.colliders) {
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const dx = p.x - b.cx;
      const dz = p.z - b.cz;
      // World -> box local (inverse of the yaw rotation).
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      const qx = THREE.MathUtils.clamp(lx, -b.hx, b.hx);
      const qz = THREE.MathUtils.clamp(lz, -b.hz, b.hz);
      let ox = lx - qx;
      let oz = lz - qz;
      let d2 = ox * ox + oz * oz;
      if (d2 >= RADIUS * RADIUS) continue;

      let nlx;
      let nlz;
      let push;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nlx = ox / d;
        nlz = oz / d;
        push = RADIUS - d;
      } else {
        // Centre is inside the box: leave by the nearest face.
        const px = b.hx - Math.abs(lx);
        const pz = b.hz - Math.abs(lz);
        if (px < pz) {
          nlx = Math.sign(lx) || 1;
          nlz = 0;
          push = px + RADIUS;
        } else {
          nlx = 0;
          nlz = Math.sign(lz) || 1;
          push = pz + RADIUS;
        }
      }
      // Box local -> world.
      const nx = c * nlx + s * nlz;
      const nz = -s * nlx + c * nlz;
      p.x += nx * push;
      p.z += nz * push;
      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into < 0) {
        this.velocity.x -= nx * into;
        this.velocity.z -= nz * into;
      }
    }
  }

  updateCamera(dt) {
    // Gentle head bob while walking on the ground.
    const speed = this.speed;
    const moving = this.onGround && speed > 0.5;
    this.bobAmount += ((moving ? Math.min(1, speed / SPRINT_SPEED) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * (6 + speed * 0.9);
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.03 * this.bobAmount;

    const cam = this.camera;
    cam.position.set(this.position.x, this.position.y + EYE_HEIGHT + bobY, this.position.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.translateX(bobX);

    // Widen the view a little when sprinting.
    const targetKick = speed > WALK_SPEED + 0.5 ? 6 : 0;
    this.fovKick += (targetKick - this.fovKick) * Math.min(1, dt * 4);
    const fov = 70 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
