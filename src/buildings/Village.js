import * as THREE from 'three';
import { Kit } from './Kit.js';
import { buildHouse, HOUSE_NAMES } from './houses.js';
import { BARRELS, crate, well } from './props.js';
import { Bridge } from './Bridge.js';
import { Smoke } from './Smoke.js';
import { HOUSES, PLAZA, WELL } from '../world/plan.js';
import { mulberry32 } from '../util/noise.js';

// Transform a footprint-local box into a world-space oriented box.
function worldBox(b, ox, oz, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { cx: ox + b.cx * c + b.cz * s, cz: oz - b.cx * s + b.cz * c, hx: b.hx, hz: b.hz, rot, y: b.y };
}

// The village: every house, prop, the well and the bridge, merged into one
// mesh per material. Also collects colliders, walkable surfaces (bridge deck,
// porches), chimney smoke and the night-time glow of windows and lanterns.
export class Village {
  constructor({ terrain, materials }) {
    const m = materials;
    this.materials = m;
    this.group = new THREE.Group();
    this.group.name = 'village';
    this.colliders = [];
    this.decks = [];
    this.landmarks = [];
    const kit = new Kit();
    const chimneys = [];
    const random = mulberry32(77);

    for (const h of HOUSES) {
      let info;
      kit.frame({ x: h.x, y: h.y, z: h.z, ry: h.rotationY }, () => {
        info = buildHouse(kit, m, h.design, h.seed);
        for (const lamp of info.lamps) this.lantern(kit, m, lamp);
        this.scatterProps(kit, m, h, random);
      });
      const toWorld = (v) => v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rotationY).add(new THREE.Vector3(h.x, h.y, h.z));
      for (const c of info.chimneys) chimneys.push(toWorld(c));
      for (const b of info.colliders) this.colliders.push(worldBox(b, h.x, h.z, h.rotationY));
      for (const d of info.decks || []) this.decks.push({ ...worldBox(d, h.x, h.z, h.rotationY), y: h.y + d.y });
      this.landmarks.push({ name: HOUSE_NAMES[h.design], x: h.x, z: h.z, r: Math.max(h.footprint.hx, h.footprint.hz) + 1 });
    }

    // The well in the middle of the plaza.
    const wy = terrain.plazaHeight;
    kit.frame({ x: WELL.x, y: wy, z: WELL.z, ry: 0.3 }, () => well(kit, m));
    this.colliders.push({ cx: WELL.x, cz: WELL.z, hx: 1.2, hz: 1.2, rot: 0.3 });
    this.landmarks.push({ name: 'well', x: WELL.x, z: WELL.z, r: 1.5 });
    // A few barrels and crates about the plaza.
    for (let i = 0; i < 4; i++) {
      const a = 0.6 + i * 1.6 + random() * 0.4;
      const x = PLAZA.x + Math.cos(a) * (PLAZA.radius - 1.2);
      const z = PLAZA.z + Math.sin(a) * (PLAZA.radius - 1.2);
      this.prop(kit, m, i % 4 === 3 ? 'crate' : i % 3, x, terrain.heightAt(x, z), z, random() * 6);
    }

    this.bridge = new Bridge();
    this.bridge.build(kit, m);
    this.colliders.push(...this.bridge.colliders());
    this.landmarks.push({ name: 'bridge', x: this.bridge.L ? 0 : 0, z: 0, r: 0 });

    for (const mesh of kit.build()) this.group.add(mesh);

    this.smoke = new Smoke(chimneys);
    this.group.add(this.smoke.points);
  }

  // Barrels and crates by a house: against a side wall, clear of the door.
  scatterProps(kit, m, h, random) {
    const n = 1 + Math.floor(random() * 3);
    const side = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const x = side * (h.footprint.hx + 0.35);
      const z = h.footprint.hz * (0.6 - i * 0.55);
      const kind = random() < 0.25 ? 'crate' : Math.floor(random() * 3);
      // Props stand on the plot, which is level at the house's height.
      this.prop(kit, m, kind, x, 0, z, random() * 6, h);
    }
  }

  prop(kit, m, kind, x, y, z, rot, house = null) {
    let radius;
    kit.frame({ x, y, z, ry: rot }, () => {
      radius = kind === 'crate' ? crate(kit, m, 0.6 + (rot % 0.2)) : BARRELS[kind](kit, m);
    });
    if (house) {
      // Local to the house frame -> world.
      const c = Math.cos(house.rotationY);
      const s = Math.sin(house.rotationY);
      this.colliders.push({ cx: house.x + x * c + z * s, cz: house.z - x * s + z * c, hx: radius, hz: radius, rot: house.rotationY });
    } else {
      this.colliders.push({ cx: x, cz: z, hx: radius, hz: radius, rot });
    }
  }

  lantern(kit, m, p) {
    kit.frame({ x: p.x, y: p.y, z: p.z }, () => {
      kit.box(m.iron, 0.04, 0.04, 0.32, { y: 0.25, z: -0.15 });
      kit.box(m.iron, 0.22, 0.03, 0.22, { y: -0.15 });
      const cap = new THREE.ConeGeometry(0.17, 0.14, 4);
      kit.add(m.iron, cap, { y: 0.2, ry: Math.PI / 4 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(m.iron, 0.02, 0.28, 0.02, { x: sx * 0.1, z: sz * 0.1 });
      kit.box(m.lamp, 0.17, 0.25, 0.17);
    });
  }

  // Walkable surfaces above the terrain at (x, z), or null.
  surfaceAt(x, z) {
    let best = this.bridge.surfaceAt(x, z);
    for (const d of this.decks) {
      const c = Math.cos(d.rot);
      const s = Math.sin(d.rot);
      const dx = x - d.cx;
      const dz = z - d.cz;
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      if (Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz && (best === null || d.y > best)) best = d.y;
    }
    return best;
  }

  setViewport(heightPx, fov) {
    this.smoke.setViewport(heightPx, fov);
  }

  update(dt, time, wind, nightFactor, lightLevel) {
    const flicker = 0.85 + 0.1 * Math.sin(time * 13.1) + 0.05 * Math.sin(time * 27.3);
    this.materials.glass.emissiveIntensity = 0.12 + nightFactor * 2.2 * flicker;
    this.materials.lamp.emissiveIntensity = 0.2 + nightFactor * 4 * flicker;
    this.smoke.update(dt, wind, lightLevel);
  }
}
