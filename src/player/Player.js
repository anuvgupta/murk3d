import * as THREE from 'three';
import { WORLD_HALF } from '../world/plan.js';

const EYE_HEIGHT = 1.68;
const RADIUS = 0.35;
const WALK_SPEED = 4.2;
const SPRINT_SPEED = 8.0;
const ACCEL_GROUND = 12;
const ACCEL_AIR = 3.5;
const GRAVITY = 24;
// Jumps: lighter gravity while rising with Space held (a held jump peaks
// ~1.6 m up, ~0.85 s in the air), heavier once Space is let go (a tap is a
// short hop), and a little quicker falling than rising so landings feel solid.
const JUMP_SPEED = 7.4;
const GRAVITY_RISE = 17;
const GRAVITY_CUT = 32;
const GRAVITY_FALL = 21;
const SPRINT_TAP = 0.25; // a Shift press shorter than this is a tap (locks sprint)
const SPRINT_IDLE = 0.25; // a sprint lock ends after this long without moving
const COYOTE = 0.12; // a jump still counts this long after running off an edge
const JUMP_BUFFER = 0.12; // and a press this long before landing is kept
const BOUNCE_SPEED = 10.5; // thrown up off a mushroom cap
const SWIM_DEPTH = 1.25; // feet this far below the surface when afloat
const MOUSE_SENSITIVITY = 0.0022;
const MAX_WALK_SLOPE = 0.62; // normal.y below this is too steep to climb
const MAX_CLIMB = Math.sqrt(1 - MAX_WALK_SLOPE ** 2) / MAX_WALK_SLOPE; // the same as rise per metre
const PROBE = 0.3; // how far ahead the slope rule looks
const STEP_UP = 0.5; // a ledge this high can be stepped onto
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
    this.bouncers = []; // (x, z) => true where landing throws you back up
    this.waterLevelAt = null; // set by the game: water surface height at (x, z), or -Infinity
    this.swimming = false;

    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.airTime = 0; // since last on the ground
    this.jumpQueued = 0; // seconds left on a buffered jump press
    this.jumping = false; // rising from a jump (not a bounce)
    // Sprint: hold Shift to sprint while it's held; tap it to lock sprint
    // on until it's tapped again or you stop moving.
    this.sprintLock = false;
    this.clock = 0;
    this.shiftDownAt = 0;
    this.lockAtPress = false;
    this.idle = 0;
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

    this.clock += dt;
    const shift = input.down('ShiftLeft') || input.down('ShiftRight');
    if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) {
      this.shiftDownAt = this.clock;
      this.lockAtPress = this.sprintLock;
    }
    if ((input.wasReleased('ShiftLeft') || input.wasReleased('ShiftRight')) && !shift) {
      // A tap flips the lock; letting go of a hold just ends the sprint.
      this.sprintLock = this.clock - this.shiftDownAt < SPRINT_TAP ? !this.lockAtPress : false;
    }
    if (fx === 0 && fz === 0) {
      this.idle += dt;
      if (this.idle > SPRINT_IDLE) this.sprintLock = false;
    } else {
      this.idle = 0;
    }
    const sprinting = (shift || this.sprintLock) && fz < 0;
    const targetSpeed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * (this.swimming ? 0.45 : 1);
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wish.x * targetSpeed - this.velocity.x) * k;
    this.velocity.z += (wish.z * targetSpeed - this.velocity.z) * k;

    if (input.wasPressed('Space')) this.jumpQueued = JUMP_BUFFER;
    else this.jumpQueued = Math.max(0, this.jumpQueued - dt);
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    if (this.jumpQueued > 0 && (this.onGround || (this.airTime < COYOTE && this.velocity.y <= 0)) && !this.swimming) {
      this.velocity.y = JUMP_SPEED;
      // Commit to the way you're heading: take off at full speed along the
      // keys you're holding (a sprinting jump carries a little extra).
      if (wish.lengthSq() > 0) {
        const along = this.velocity.x * wish.x + this.velocity.z * wish.z;
        const takeoff = Math.max(along, targetSpeed * (sprinting ? 1.08 : 1));
        this.velocity.x = wish.x * takeoff;
        this.velocity.z = wish.z * takeoff;
      }
      this.onGround = false;
      this.jumping = true;
      this.jumpQueued = 0;
      this.airTime = COYOTE;
    }
    const held = input.down('Space');
    let g = GRAVITY;
    if (this.jumping && this.velocity.y > 0) g = held ? GRAVITY_RISE : GRAVITY_CUT;
    else if (this.jumping) g = GRAVITY_FALL;
    this.velocity.y -= g * dt;

    // Integrate horizontally, refusing to walk up cliffs.
    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // The slope rule is about the terrain; on a bridge deck or porch the ground
    // beneath (a riverbed, say) must not block the way. It looks at the rise
    // just ahead in the direction of travel: a smoothed normal would call the
    // flat ground at a cliff's lip a cliff and refuse every step back from
    // the edge. A short step up onto level ground is fine (back over a lip
    // you slipped off), and in the air you can land on a ledge below your
    // feet, as long as it is level enough to stand on (not more cliff face
    // to hop up).
    const mx = this.position.x - prevX;
    const mz = this.position.z - prevZ;
    const moved = Math.hypot(mx, mz);
    if (moved > 1e-5 && !this.onSurface) {
      const ax = prevX + (mx / moved) * PROBE;
      const az = prevZ + (mz / moved) * PROBE;
      const ahead = this.terrain.heightAt(ax, az);
      const rise = ahead - this.terrain.heightAt(prevX, prevZ);
      const reach = Math.max(this.position.y, this.terrain.heightAt(prevX, prevZ) + STEP_UP);
      // Level enough: the ground carries on no steeper than walkable beyond it.
      const ledge = () => ahead <= reach && this.terrain.heightAt(ax + (mx / moved) * PROBE, az + (mz / moved) * PROBE) - ahead <= PROBE * MAX_CLIMB;
      if (rise > PROBE * MAX_CLIMB && !ledge()) {
        // Slide along the slope instead of climbing it.
        this.position.x = prevX;
        this.position.z = prevZ;
        const n = this.terrain.normalAt(prevX, prevZ, this._normal, 0.3);
        const len = Math.hypot(n.x, n.z) || 1;
        const nx = n.x / len;
        const nz = n.z / len;
        const into = this.velocity.x * nx + this.velocity.z * nz;
        if (into < 0) {
          this.velocity.x -= nx * into;
          this.velocity.z -= nz * into;
        }
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
      if (this.velocity.y < -1.5 && this.bouncers.some((b) => b(this.position.x, this.position.z))) {
        // A mushroom cap: back up you go, a little higher the harder you hit.
        this.velocity.y = Math.max(BOUNCE_SPEED, -this.velocity.y * 0.85);
        this.onGround = false;
        this.jumping = false;
      } else {
        this.velocity.y = 0;
        this.onGround = true;
        this.jumping = false;
      }
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
      // Something you can get on top of (a fallen log) stops blocking once
      // your feet are up at its top.
      if (b.top !== undefined && this.position.y >= b.top - 0.15) continue;
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const dx = p.x - b.cx;
      const dz = p.z - b.cz;
      // World -> box local (inverse of the yaw rotation).
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      if (b.round) {
        // Elliptical collider (boulders): grow it by the body radius, and if
        // inside, move out to its rim and slide along the rim's normal.
        const ex = b.hx + RADIUS;
        const ez = b.hz + RADIUS;
        const e2 = (lx * lx) / (ex * ex) + (lz * lz) / (ez * ez);
        if (e2 >= 1) continue;
        const e = Math.sqrt(e2);
        const rx = e > 1e-4 ? lx / e : ex;
        const rz = e > 1e-4 ? lz / e : 0;
        const mlx = rx - lx;
        const mlz = rz - lz;
        p.x += c * mlx + s * mlz;
        p.z += -s * mlx + c * mlz;
        let gx = rx / (ex * ex);
        let gz = rz / (ez * ez);
        const gl = Math.hypot(gx, gz) || 1;
        gx /= gl;
        gz /= gl;
        const nx = c * gx + s * gz;
        const nz = -s * gx + c * gz;
        const into = this.velocity.x * nx + this.velocity.z * nz;
        if (into < 0) {
          this.velocity.x -= nx * into;
          this.velocity.z -= nz * into;
        }
        continue;
      }
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
