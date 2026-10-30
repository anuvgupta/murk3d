import * as THREE from 'three';
import { ROADS, PLAZA, WELL, HOUSES, BRIDGE, nearestRoad } from '../world/plan.js';

// Fairy lights: timber poles every few yards along the village street and
// around the plaza, strung with sagging wires of small glass bulbs. The bulbs
// are beads by day and glow (each with its own colour and twinkle) by night.
// One day they will carry the town's mana; for now they are just pretty.

const POLE_H = 3.6;

// A bulb whose centre rides along in `aux`, so the glass shader can give each
// one its own colour and twinkle.
function bulb() {
  const g = new THREE.IcosahedronGeometry(0.058, 1);
  const n = g.attributes.position.count;
  const aux = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) aux[i * 4 + 3] = 1;
  g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 4));
  return g;
}

export function fairyLights(kit, m, terrain, colliders) {
  const pole = (x, z, h = POLE_H) => {
    const y = terrain.heightAt(x, z);
    kit.frame({ x, y, z }, () => {
      kit.cylinder(m.timber, 0.07, 0.1, h, { y: h / 2 }, { segments: 7, metres: 1.5 });
      kit.cylinder(m.iron, 0.1, 0.1, 0.05, { y: h - 0.01 }, { segments: 7 });
      kit.cylinder(m.iron, 0.085, 0.085, 0.04, { y: h - 0.22 }, { segments: 7 });
    });
    colliders.push({ cx: x, cz: z, hx: 0.12, hz: 0.12, rot: 0 });
    return new THREE.Vector3(x, y + h - 0.05, z);
  };

  // A wire from a to b hanging in a shallow curve, bulbs every half metre.
  const string = (a, b, sag = 0.45) => {
    const len = a.distanceTo(b);
    const at = (t, out) => {
      out.lerpVectors(a, b, t);
      out.y -= sag * 4 * t * (1 - t);
      return out;
    };
    const n = Math.max(6, Math.round(len * 1.2));
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      at(i / n, p0);
      at((i + 1) / n, p1);
      const d = p1.clone().sub(p0);
      const l = d.length();
      kit.add(m.iron, new THREE.BoxGeometry(0.014, 0.014, l + 0.01), { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2, ry: Math.atan2(d.x, d.z), rx: -Math.asin(d.y / l) });
    }
    const count = Math.max(2, Math.round(len / 0.55));
    for (let k = 1; k < count; k++) {
      at(k / count, p0);
      kit.box(m.iron, 0.02, 0.07, 0.02, { x: p0.x, y: p0.y - 0.04, z: p0.z });
      kit.add(m.fairy, bulb(), { x: p0.x, y: p0.y - 0.13, z: p0.z });
    }
  };

  const nearHouse = (x, z) => HOUSES.some((h) => Math.hypot(h.x - x, h.z - z) < Math.max(h.footprint.hx, h.footprint.hz) + 1.2);

  // Street: poles alternate sides of the main road through the village, so
  // the strings zig-zag across the way overhead.
  const road = ROADS[0];
  const p = new THREE.Vector2();
  const q = new THREE.Vector2();
  let prev = null;
  let side = 1;
  for (let s = 4; s < road.path.length - 4; s += 8.5) {
    road.path.pointAt(s, p);
    const dPlaza = Math.hypot(p.x - PLAZA.x, p.y - PLAZA.z);
    if (dPlaza < PLAZA.radius + 3.5 || dPlaza > 92) {
      prev = null;
      continue;
    }
    if (Math.abs(s - BRIDGE.roadS) < BRIDGE.length / 2 + 5) {
      prev = null;
      continue;
    }
    road.path.pointAt(s + 1, q).sub(p).normalize();
    const off = road.width / 2 + 0.9;
    const x = p.x - q.y * off * side;
    const z = p.y + q.x * off * side;
    side = -side;
    if (nearHouse(x, z)) {
      prev = null;
      continue;
    }
    const top = pole(x, z);
    if (prev && prev.distanceTo(top) < 13) string(prev, top, 0.4);
    prev = top;
  }

  // Around the plaza: a ring of poles just outside the kerb.
  const ring = (cx, cz, r, n, h, a0, sag) => {
    const tops = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      let rr = r;
      let x;
      let z;
      // Step outward off the road and clear of the houses.
      for (let k = 0; k < 6; k++) {
        x = cx + Math.cos(a) * rr;
        z = cz + Math.sin(a) * rr;
        const nr = nearestRoad(x, z, 6);
        if (!(nr && nr.edge < 0.6) && !nearHouse(x, z)) break;
        rr += 0.6;
      }
      tops.push(pole(x, z, h));
    }
    for (let i = 0; i < n; i++) string(tops[i], tops[(i + 1) % n], sag);
    return tops;
  };
  ring(PLAZA.x, PLAZA.z, PLAZA.radius + 1.7, 8, POLE_H, Math.PI / 8, 0.5);
  // Around the well: a tighter, taller ring, with strings crossing above it.
  const inner = ring(WELL.x, WELL.z, 4.7, 6, 4.3, 0.3, 0.35);
  for (let i = 0; i < 3; i++) string(inner[i], inner[i + 3], 0.55);
}
