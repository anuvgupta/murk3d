import * as THREE from 'three';
import { BRIDGE, RIVER } from '../world/plan.js';

// Stone arch bridge carrying the main road over the river. Built in a frame
// whose local z axis runs along the road. Exposes the deck height for walking
// and colliders for the parapets.
export class Bridge {
  constructor() {
    this.L = BRIDGE.length;
    this.W = BRIDGE.width;
    this.hump = 1.3;
    this.yA = BRIDGE.startHeight - 0.08;
    this.yB = BRIDGE.endHeight - 0.08;
    this.water = BRIDGE.waterLevel;
    const riverW = RIVER.widthAt(BRIDGE.riverS);
    this.archHalf = riverW / 2 + 0.6;
    this.spring = this.water - 0.4;
    this.crown = Math.min(this.water + 2.5, this.deckY(0) - 0.9);
    this.cos = Math.cos(BRIDGE.rotationY);
    this.sin = Math.sin(BRIDGE.rotationY);
  }

  // Deck surface height at local z along the bridge.
  deckY(z) {
    const t = THREE.MathUtils.clamp(z / this.L + 0.5, 0, 1);
    return this.yA + (this.yB - this.yA) * t + this.hump * Math.sin(Math.PI * t);
  }

  archY(z) {
    const k = Math.min(1, Math.abs(z) / this.archHalf);
    return this.spring + (this.crown - this.spring) * Math.sqrt(1 - k * k);
  }

  build(kit, m) {
    const L = this.L;
    const W = this.W;
    const bottom = this.water - 3;
    const a = this.archHalf;
    const steps = 32;

    kit.frame({ x: BRIDGE.x, z: BRIDGE.z, ry: BRIDGE.rotationY }, () => {
      // Main body: side profile with the arch cut out, extruded across the width.
      const body = new THREE.Shape();
      body.moveTo(-L / 2, bottom);
      for (let i = 0; i <= steps; i++) {
        const z = -L / 2 + (i / steps) * L;
        body.lineTo(z, this.deckY(z));
      }
      body.lineTo(L / 2, bottom);
      body.lineTo(a, bottom);
      for (let i = 0; i <= steps; i++) {
        const z = a - (i / steps) * 2 * a;
        body.lineTo(z, this.archY(z));
      }
      body.lineTo(-a, bottom);
      body.closePath();
      this.extrudeAcross(kit, m.ashlar, body, W - 0.2, 0, 2.2);

      // Voussoirs: a ring of dressed stone standing proud of each face.
      const ring = new THREE.Shape();
      const outerR = 0.6;
      for (let i = 0; i <= steps; i++) {
        const z = -a + (i / steps) * 2 * a;
        const k = Math.abs(z) / a;
        const lift = outerR * Math.sqrt(Math.max(0, 1 - k * k * 0.85)) + 0.25;
        if (i === 0) ring.moveTo(z - 0.35, this.archY(z));
        ring.lineTo(z + (i === 0 ? -0.35 : i === steps ? 0.35 : 0), this.archY(z) + lift);
      }
      for (let i = steps; i >= 0; i--) {
        const z = -a + (i / steps) * 2 * a;
        ring.lineTo(z, this.archY(z));
      }
      ring.closePath();
      this.extrudeAcross(kit, m.stone, ring, W + 0.06, 0, 1.6);

      // Parapets with a coping course.
      for (const sx of [-1, 1]) {
        const wall = new THREE.Shape();
        wall.moveTo(-L / 2, this.deckY(-L / 2) - 0.2);
        for (let i = 0; i <= steps; i++) {
          const z = -L / 2 + (i / steps) * L;
          wall.lineTo(z, this.deckY(z) + 0.8);
        }
        for (let i = steps; i >= 0; i--) {
          const z = -L / 2 + (i / steps) * L;
          wall.lineTo(z, this.deckY(z) - 0.2);
        }
        wall.closePath();
        this.extrudeAcross(kit, m.stone, wall, 0.34, sx * (W / 2 - 0.17), 2.4);
        const cap = new THREE.Shape();
        cap.moveTo(-L / 2 - 0.1, this.deckY(-L / 2) + 0.8);
        for (let i = 0; i <= steps; i++) {
          const z = -L / 2 + (i / steps) * L;
          cap.lineTo(z, this.deckY(z) + 0.95);
        }
        for (let i = steps; i >= 0; i--) {
          const z = -L / 2 + (i / steps) * L;
          cap.lineTo(z, this.deckY(z) + 0.8);
        }
        cap.closePath();
        this.extrudeAcross(kit, m.ashlar, cap, 0.44, sx * (W / 2 - 0.17), 1.5);
      }

      // Cobbled deck surface.
      const positions = [];
      const uvs = [];
      const indices = [];
      const half = W / 2 - 0.3;
      for (let i = 0; i <= steps; i++) {
        const z = -L / 2 + (i / steps) * L;
        const y = this.deckY(z) + 0.03;
        positions.push(-half, y, z, half, y, z);
        uvs.push(0, z / 1.6, (half * 2) / 1.6, z / 1.6);
        if (i < steps) {
          const b = i * 2;
          indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
      }
      const deck = new THREE.BufferGeometry();
      deck.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      deck.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      deck.setIndex(indices);
      deck.computeVertexNormals();
      kit.add(m.cobble, deck);
    });
  }

  // Extrude a side-profile shape (x = along the bridge, y = height) across the
  // bridge, centred at local x = offset.
  extrudeAcross(kit, material, shape, width, offset, metres) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -width / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / metres, uv.getY(i) / metres);
    // Shape x -> local z (along the road), extrusion z -> local x.
    kit.add(material, g, { x: offset, ry: -Math.PI / 2 });
  }

  toLocal(x, z) {
    const dx = x - BRIDGE.x;
    const dz = z - BRIDGE.z;
    return [this.cos * dx - this.sin * dz, this.sin * dx + this.cos * dz];
  }

  // Walkable deck height at world (x, z), or null off the deck.
  surfaceAt(x, z) {
    const [lx, lz] = this.toLocal(x, z);
    if (Math.abs(lx) > this.W / 2 - 0.25 || Math.abs(lz) > this.L / 2) return null;
    return this.deckY(lz) + 0.03;
  }

  colliders() {
    return [-1, 1].map((sx) => {
      const lx = sx * (this.W / 2 - 0.17);
      return {
        cx: BRIDGE.x + lx * this.cos,
        cz: BRIDGE.z - lx * this.sin,
        hx: 0.17,
        hz: this.L / 2,
        rot: BRIDGE.rotationY,
      };
    });
  }
}
