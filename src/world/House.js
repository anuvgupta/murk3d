import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  stoneTextures,
  plasterTextures,
  woodTextures,
  plankTextures,
  shingleTextures,
  smokeTexture,
} from './textures.js';

// Ground-floor footprint (stone) and upper-floor jetty (timber frame).
const W = 8;
const D = 6;
const STONE_TOP = 3.0;
const BAND_H = 0.25;
const UW = W + 0.6;
const UD = D + 0.6;
const UPPER_BOTTOM = STONE_TOP + BAND_H;
const UPPER_TOP = UPPER_BOTTOM + 2.3;
const ROOF_PITCH = THREE.MathUtils.degToRad(52);
const RISE = (UD / 2) * Math.tan(ROOF_PITCH);
const APEX = UPPER_TOP + RISE;

// Scale a BoxGeometry's per-face UVs so textures keep a constant size in
// metres. With `alongLongest`, the texture's v axis follows each face's long
// edge (so wood grain runs along a beam).
function scaleBoxUVs(geometry, w, h, d, metres, alongLongest = false) {
  const uv = geometry.attributes.uv;
  // Face order in BoxGeometry: +x, -x, +y, -y, +z, -z (4 verts each).
  const faceDims = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fu, fv] = faceDims[f];
    const swap = alongLongest && fu > fv;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (swap) uv.setXY(i, (v * fv) / metres, (u * fu) / metres);
      else uv.setXY(i, (u * fu) / metres, (v * fv) / metres);
    }
  }
  uv.needsUpdate = true;
}

export class House {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'cottage';
    this.colliders = [];
    this.smoke = [];
    this.smokeTimer = 0;

    const stone = stoneTextures(1);
    const plaster = plasterTextures(2);
    const wood = woodTextures(3);
    const planks = plankTextures(4);
    const shingles = shingleTextures(5);

    this.mats = {
      stone: new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 2.5, roughness: 0.92 }),
      stoneLight: new THREE.MeshStandardMaterial({
        map: stone.map, bumpMap: stone.bump, bumpScale: 1.5, roughness: 0.9, color: 0xb3ab9c,
      }),
      plaster: new THREE.MeshStandardMaterial({
        map: plaster.map, bumpMap: plaster.bump, bumpScale: 0.6, roughness: 0.95, color: 0xd8ccb8,
      }),
      timber: new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.8, roughness: 0.85 }),
      door: new THREE.MeshStandardMaterial({ map: planks.map, bumpMap: planks.bump, bumpScale: 1.2, roughness: 0.8 }),
      roof: new THREE.MeshStandardMaterial({ map: shingles.map, bumpMap: shingles.bump, bumpScale: 3, roughness: 0.9 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: 0.55, metalness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x1a1410,
        emissive: 0xffa24a,
        emissiveIntensity: 0.2,
        roughness: 0.15,
        metalness: 0.1,
      }),
      barrel: new THREE.MeshStandardMaterial({ map: planks.map, roughness: 0.8, color: 0xb59a7a }),
      log: new THREE.MeshStandardMaterial({ map: wood.map, roughness: 0.9, color: 0xc8a882 }),
    };

    this.buildStoneFloor();
    this.buildUpperFloor();
    this.buildRoof();
    this.buildChimney();
    this.buildDoor();
    this.buildWindows();
    this.buildProps();
    this.buildLantern();
    this.mergeByMaterial();
    this.buildSmoke();
  }

  // The cottage is assembled from ~200 primitives. Bake them into one mesh
  // per material so it costs a handful of draw calls instead of one per beam.
  mergeByMaterial() {
    this.group.updateMatrixWorld(true);
    const toGroup = this.group.matrixWorld.clone().invert();
    const meshes = [];
    this.group.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });

    const buckets = new Map();
    const sources = new Set();
    const matrix = new THREE.Matrix4();
    for (const mesh of meshes) {
      matrix.multiplyMatrices(toGroup, mesh.matrixWorld);
      const geometry = mesh.geometry.clone().applyMatrix4(matrix);
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(geometry);
      sources.add(mesh.geometry);
      mesh.removeFromParent();
    }
    for (const g of sources) g.dispose();

    // Drop the now-empty helper groups used for positioning.
    const empty = [];
    this.group.traverse((o) => {
      if (o !== this.group && o.isGroup && o.children.length === 0) empty.push(o);
    });
    for (const o of empty) o.removeFromParent();

    for (const [material, geometries] of buckets) {
      const merged = mergeGeometries(geometries);
      for (const g of geometries) g.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = material !== this.flame.material;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  box(w, h, d, mat, x, y, z, { metres = 1, alongLongest = false, parent = this.group } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    scaleBoxUVs(g, w, h, d, metres, alongLongest);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  beam(w, h, d, x, y, z, opts = {}) {
    return this.box(w, h, d, this.mats.timber, x, y, z, { metres: 1.2, alongLongest: true, ...opts });
  }

  // Beam between two points lying in a wall plane.
  brace(ax, ay, bx, by, depth, place) {
    const len = Math.hypot(bx - ax, by - ay);
    const m = this.beam(0.16, len, depth, 0, 0, 0);
    m.rotation.z = -Math.atan2(bx - ax, by - ay);
    place(m, (ax + bx) / 2, (ay + by) / 2);
    return m;
  }

  buildStoneFloor() {
    // Foundation plinth, sunk well into the ground to hide any terrain mismatch.
    this.box(W + 0.4, 1.6, D + 0.4, this.mats.stoneLight, 0, -0.5, 0, { metres: 2.5 });
    this.box(W, STONE_TOP - 0.3, D, this.mats.stone, 0, 0.3 + (STONE_TOP - 0.3) / 2, 0, { metres: 2.5 });
    // Corner quoins.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const y = 0.55 + i * 0.52;
          const long = i % 2 === 0;
          this.box(long ? 0.7 : 0.45, 0.42, long ? 0.45 : 0.7, this.mats.stoneLight,
            sx * (W / 2 - (long ? 0.3 : 0.17)), y, sz * (D / 2 - (long ? 0.17 : 0.3)), { metres: 2.5 });
        }
      }
    }
    // Jetty band carrying the upper storey.
    this.beam(W + 0.7, BAND_H, D + 0.7, 0, STONE_TOP + BAND_H / 2, 0);
    this.colliders.push({ cx: 0, cz: 0, hx: W / 2 + 0.25, hz: D / 2 + 0.25 });
  }

  buildUpperFloor() {
    const h = UPPER_TOP - UPPER_BOTTOM;
    const yMid = UPPER_BOTTOM + h / 2;
    this.box(UW, h, UD, this.mats.plaster, 0, yMid, 0, { metres: 3 });

    const t = 0.1; // timber proud of the plaster
    const post = 0.17;

    // Long faces (front +z, back -z): 6 bays.
    const bays = 6;
    const bw = UW / bays;
    for (const sz of [-1, 1]) {
      const z = sz * (UD / 2 + t / 2 - 0.02);
      const place = (m, x, y) => m.position.set(x, y, z);
      this.beam(UW + 0.02, 0.2, t, 0, UPPER_BOTTOM + 0.1, z);
      this.beam(UW + 0.02, 0.2, t, 0, UPPER_TOP - 0.1, z);
      for (let i = 0; i <= bays; i++) {
        this.beam(post, h, t, -UW / 2 + i * bw, yMid, z);
      }
      // Corner braces and a mid rail in the plain bays.
      const y0 = UPPER_BOTTOM + 0.2;
      const y1 = UPPER_TOP - 0.2;
      this.brace(-UW / 2, y0, -UW / 2 + bw, y1, t, place);
      this.brace(UW / 2, y0, UW / 2 - bw, y1, t, place);
      for (const i of [2, 3]) {
        const x = -UW / 2 + (i + 0.5) * bw;
        this.beam(bw, 0.16, t, x, yMid, z);
        this.brace(x - bw / 2, y0, x + bw / 2, yMid, t, place);
        this.brace(x - bw / 2, y1, x + bw / 2, yMid, t, place);
      }
    }

    // Short faces (sides ±x): 4 bays, framed in the y–z plane.
    const sbays = 4;
    const sbw = UD / sbays;
    for (const sx of [-1, 1]) {
      const x = sx * (UW / 2 + t / 2 - 0.02);
      const side = new THREE.Group();
      side.position.x = x;
      side.rotation.y = Math.PI / 2;
      this.group.add(side);
      const place = (m, u, y) => m.position.set(u, y, 0);
      this.beam(UD + 0.02, 0.2, t, 0, UPPER_BOTTOM + 0.1, 0, { parent: side });
      this.beam(UD + 0.02, 0.2, t, 0, UPPER_TOP - 0.1, 0, { parent: side });
      for (let i = 0; i <= sbays; i++) {
        this.beam(post, h, t, -UD / 2 + i * sbw, yMid, 0, { parent: side });
      }
      const y0 = UPPER_BOTTOM + 0.2;
      const y1 = UPPER_TOP - 0.2;
      const b1 = this.brace(-UD / 2, y0, -UD / 2 + sbw, y1, t, place);
      const b2 = this.brace(UD / 2, y0, UD / 2 - sbw, y1, t, place);
      side.add(b1, b2);
    }

    // Gables.
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-UD / 2, 0);
      shape.lineTo(UD / 2, 0);
      shape.lineTo(0, RISE);
      shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
      const gable = new THREE.Mesh(g, this.mats.plaster);
      gable.position.set(sx * (UW / 2), UPPER_TOP, 0);
      gable.rotation.y = sx * (Math.PI / 2);
      this.group.add(gable);

      const frame = new THREE.Group();
      frame.position.set(sx * (UW / 2 + t / 2 - 0.02), UPPER_TOP, 0);
      frame.rotation.y = Math.PI / 2;
      this.group.add(frame);
      this.beam(post, RISE - 0.3, t, 0, (RISE - 0.3) / 2, 0, { parent: frame });
      const collarY = RISE * 0.38;
      const collarW = UD * (1 - collarY / RISE) - 0.1;
      this.beam(collarW, 0.18, t, 0, collarY, 0, { parent: frame });
      const place = (m, u, y) => {
        m.position.set(u, y, 0);
        frame.add(m);
      };
      this.brace(-collarW / 2 + 0.3, collarY, -0.08, RISE * 0.8, t, place);
      this.brace(collarW / 2 - 0.3, collarY, 0.08, RISE * 0.8, t, place);
    }
  }

  buildRoof() {
    const eave = 0.75;
    const overhang = 0.55;
    const thick = 0.2;
    const run = UD / 2 + eave;
    const slopeLen = run / Math.cos(ROOF_PITCH);
    const len = UW + overhang * 2;

    for (const side of [0, 1]) {
      const slope = new THREE.Group();
      slope.rotation.y = side * Math.PI;
      this.group.add(slope);

      const m = this.box(len, thick, slopeLen, this.mats.roof, 0, 0, 0, { metres: 2.2, parent: slope });
      // Shingle rows run along the eave with each course overlapping downslope.
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, -uv.getY(i));
      m.rotation.x = ROOF_PITCH;
      const dir = new THREE.Vector3(0, -Math.sin(ROOF_PITCH), Math.cos(ROOF_PITCH));
      const nrm = new THREE.Vector3(0, Math.cos(ROOF_PITCH), Math.sin(ROOF_PITCH));
      m.position
        .set(0, APEX, 0)
        .addScaledVector(dir, slopeLen / 2)
        .addScaledVector(nrm, thick / 2 + 0.02);

      // Barge boards along the gable edges and a fascia along the eave.
      for (const sx of [-1, 1]) {
        const b = this.beam(0.14, 0.32, slopeLen, sx * (len / 2 - 0.05), 0, 0, { parent: slope });
        b.rotation.x = ROOF_PITCH;
        b.position.copy(m.position).addScaledVector(nrm, -0.06);
        b.position.x = sx * (len / 2 - 0.05);
      }
      const fascia = this.beam(len, 0.28, 0.1, 0, 0, 0, { parent: slope });
      fascia.rotation.x = ROOF_PITCH;
      fascia.position.set(0, APEX, 0).addScaledVector(dir, slopeLen).addScaledVector(nrm, -0.02);
    }

    // Ridge cap.
    const ridge = this.beam(len + 0.1, 0.32, 0.32, 0, APEX + 0.2, 0);
    ridge.rotation.x = Math.PI / 4;
  }

  buildChimney() {
    const x0 = W / 2;
    const zc = 0.9;
    // Breast against the stone wall, stepping in to a slimmer stack above.
    this.box(1.3, UPPER_TOP + 0.2, 1.7, this.mats.stone, x0 + 0.6, (UPPER_TOP + 0.2) / 2, zc, { metres: 2.5 });
    const shoulder = this.box(1.3, 0.3, 1.7, this.mats.stoneLight, x0 + 0.6, UPPER_TOP + 0.35, zc, { metres: 2.5 });
    shoulder.scale.set(1.05, 1, 1.05);
    const stackTop = APEX + 1.4;
    const stackBottom = UPPER_TOP + 0.5;
    this.box(0.95, stackTop - stackBottom, 1.1, this.mats.stone, x0 + 0.75, (stackTop + stackBottom) / 2, zc, { metres: 2.5 });
    this.box(1.15, 0.22, 1.3, this.mats.stoneLight, x0 + 0.75, stackTop + 0.11, zc, { metres: 2.5 });
    this.box(0.5, 0.25, 0.5, this.mats.iron, x0 + 0.75, stackTop + 0.33, zc);

    this.chimneyTop = new THREE.Vector3(x0 + 0.75, stackTop + 0.5, zc);
    this.colliders.push({ cx: x0 + 0.6, cz: zc, hx: 0.65 + 0.15, hz: 0.85 + 0.15 });
  }

  buildDoor() {
    const dx = -1.2;
    const dw = 1.25;
    const dh = 2.25;
    const bottom = 0.3;
    const z = D / 2;

    this.box(dw, dh, 0.12, this.mats.door, dx, bottom + dh / 2, z + 0.01, { metres: 1.3 });
    // Strap hinges and a ring pull.
    for (const y of [bottom + 0.45, bottom + dh - 0.45]) {
      this.box(dw * 0.8, 0.06, 0.02, this.mats.iron, dx - dw * 0.05, y, z + 0.08);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 20), this.mats.iron);
    ring.position.set(dx + dw * 0.32, bottom + 1.05, z + 0.09);
    this.group.add(ring);

    // Dressed stone surround with a heavy lintel.
    const jw = 0.3;
    for (const s of [-1, 1]) {
      this.box(jw, dh + 0.05, 0.3, this.mats.stoneLight, dx + s * (dw / 2 + jw / 2), bottom + dh / 2, z + 0.06, { metres: 2.5 });
    }
    this.box(dw + jw * 2 + 0.2, 0.38, 0.34, this.mats.stoneLight, dx, bottom + dh + 0.19, z + 0.07, { metres: 2.5 });

    // Doorstep.
    this.box(dw + 0.8, 0.4, 0.8, this.mats.stoneLight, dx, 0.05, z + 0.45, { metres: 2.5 });

    this.doorPosition = new THREE.Vector3(dx, 0, z + 1.2);
  }

  window(parent, u, y, w, h, { shutters = false } = {}) {
    const g = new THREE.Group();
    g.position.set(u, y, 0);
    parent.add(g);

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mats.glass);
    pane.position.z = 0.02;
    g.add(pane);

    const f = 0.12;
    const depth = 0.16;
    this.beam(w + f * 2, f, depth, 0, h / 2 + f / 2, 0.05, { parent: g });
    this.beam(w + f * 2 + 0.15, f * 1.2, depth + 0.08, 0, -h / 2 - f / 2, 0.08, { parent: g }); // sill
    for (const s of [-1, 1]) this.beam(f, h, depth, s * (w / 2 + f / 2), 0, 0.05, { parent: g });
    // Mullion and transom.
    this.beam(0.06, h, 0.06, 0, 0, 0.06, { parent: g });
    this.beam(w, 0.06, 0.06, 0, h * 0.1, 0.06, { parent: g });

    if (shutters) {
      for (const s of [-1, 1]) {
        const sh = this.box(w / 2 + 0.05, h + 0.1, 0.06, this.mats.door, 0, 0, 0, { metres: 1.3, parent: g });
        sh.position.set(s * (w / 2 + f + w / 4 + 0.05), 0, 0.12);
        sh.rotation.y = s * 0.25;
      }
    }
    return g;
  }

  buildWindows() {
    const stoneZ = D / 2 + 0.02;
    const upperZ = UD / 2 + 0.03;
    const bw = UW / 6;
    const upperY = UPPER_BOTTOM + 1.2;

    for (const sz of [-1, 1]) {
      const face = new THREE.Group();
      face.rotation.y = sz > 0 ? 0 : Math.PI;
      this.group.add(face);
      const ground = new THREE.Group();
      ground.position.z = stoneZ;
      face.add(ground);
      const upper = new THREE.Group();
      upper.position.z = upperZ;
      face.add(upper);

      // Front: one ground window beside the door; back: two.
      if (sz > 0) {
        this.window(ground, 1.9, 1.75, 1.0, 1.05, { shutters: true });
      } else {
        this.window(ground, -2, 1.75, 1.0, 1.05, { shutters: true });
        this.window(ground, 1.6, 1.75, 1.0, 1.05, { shutters: true });
      }
      for (const i of [1, 4]) this.window(upper, -UW / 2 + (i + 0.5) * bw, upperY, 0.85, 1.0);
    }

    // West side, upper floor.
    const west = new THREE.Group();
    west.position.x = -(UW / 2 + 0.03);
    west.rotation.y = -Math.PI / 2;
    this.group.add(west);
    this.window(west, 0, upperY, 0.8, 1.0);

    // West side, ground floor.
    const westGround = new THREE.Group();
    westGround.position.x = -(W / 2 + 0.02);
    westGround.rotation.y = -Math.PI / 2;
    this.group.add(westGround);
    this.window(westGround, 0.6, 1.75, 0.9, 1.0, { shutters: true });
  }

  buildProps() {
    // Barrels by the front corner.
    const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.95, 18, 1);
    const bulge = barrelGeo.attributes.position;
    for (let i = 0; i < bulge.count; i++) {
      const y = bulge.getY(i);
      const k = 1 + 0.12 * (1 - (y / 0.475) ** 2);
      bulge.setX(i, bulge.getX(i) * k);
      bulge.setZ(i, bulge.getZ(i) * k);
    }
    barrelGeo.computeVertexNormals();
    const hoopGeo = new THREE.TorusGeometry(0.385, 0.018, 6, 24);
    const barrelSpots = [
      [3.2, 3.75, 0],
      [2.4, 3.95, 0.6],
    ];
    for (const [x, z, r] of barrelSpots) {
      const b = new THREE.Mesh(barrelGeo, this.mats.barrel);
      b.position.set(x, 0.47, z);
      b.rotation.y = r;
      this.group.add(b);
      for (const hy of [-0.3, 0.3]) {
        const hoop = new THREE.Mesh(hoopGeo, this.mats.iron);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(x, 0.47 + hy, z);
        this.group.add(hoop);
      }
      this.colliders.push({ cx: x, cz: z, hx: 0.42, hz: 0.42 });
    }

    // Woodpile along the west wall.
    const logGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.4, 10);
    logGeo.rotateX(Math.PI / 2);
    const rows = [6, 5, 4, 3];
    rows.forEach((n, r) => {
      for (let i = 0; i < n; i++) {
        const log = new THREE.Mesh(logGeo, this.mats.log);
        log.position.set(-W / 2 - 0.8, 0.13 + r * 0.23, -1.9 + (i + r * 0.5) * 0.27 - 0.6);
        log.rotation.y = Math.PI / 2;
        log.rotation.z = (Math.random() - 0.5) * 0.15;
        this.group.add(log);
      }
    });
    this.colliders.push({ cx: -W / 2 - 0.8, cz: -1.85, hx: 0.75, hz: 0.85 });
  }

  buildLantern() {
    const lantern = new THREE.Group();
    lantern.position.set(-2.4, 2.65, D / 2 + 0.3);
    this.group.add(lantern);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.35), this.mats.iron);
    bracket.position.set(0, 0.25, -0.15);
    lantern.add(bracket);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), this.mats.iron);
    base.position.y = -0.15;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.14, 4), this.mats.iron);
    cap.position.y = 0.2;
    cap.rotation.y = Math.PI / 4;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.02), this.mats.iron);
        bar.position.set(sx * 0.1, 0, sz * 0.1);
        lantern.add(bar);
      }
    }
    lantern.add(base, cap);
    this.flame = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.26, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x302418, emissive: 0xffb060, emissiveIntensity: 0.2, roughness: 0.2 })
    );
    lantern.add(this.flame);

    this.lanternLight = new THREE.PointLight(0xff9a40, 0, 14, 1.6);
    this.lanternLight.position.set(0, 0, 0.1);
    lantern.add(this.lanternLight);
  }

  // Chimney smoke as a single point cloud: one draw call for every puff.
  buildSmoke() {
    const count = 28;
    const geometry = new THREE.BufferGeometry();
    this.smokeAttrs = {
      position: new THREE.BufferAttribute(new Float32Array(count * 3), 3),
      size: new THREE.BufferAttribute(new Float32Array(count), 1),
      opacity: new THREE.BufferAttribute(new Float32Array(count), 1),
      spin: new THREE.BufferAttribute(new Float32Array(count), 1),
    };
    for (const [name, attr] of Object.entries(this.smokeAttrs)) {
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attr);
    }

    this.smokeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: smokeTexture() },
        color: { value: new THREE.Color(0xbab3aa) },
        // Converts a world-space size into pixels at distance 1.
        pixelScale: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float opacity;
        attribute float spin;
        uniform float pixelScale;
        varying float vOpacity;
        varying float vSpin;
        void main() {
          vOpacity = opacity;
          vSpin = spin;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_PointSize = size * pixelScale / -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 color;
        varying float vOpacity;
        varying float vSpin;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos( vSpin );
          float s = sin( vSpin );
          uv = mat2( c, -s, s, c ) * uv + 0.5;
          vec4 tex = texture2D( map, uv );
          gl_FragColor = vec4( color, tex.a * vOpacity );
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.smokePoints = new THREE.Points(geometry, this.smokeMaterial);
    this.smokePoints.frustumCulled = false;
    this.group.add(this.smokePoints);
    for (let i = 0; i < count; i++) {
      this.smoke.push({ position: new THREE.Vector3(), drift: new THREE.Vector3(), age: Infinity, life: 1, spin: 0 });
    }
  }

  // nightFactor: 0 in full daylight, 1 at night. lightLevel: rough ambient brightness 0..1.
  update(dt, time, nightFactor, lightLevel) {
    const flicker = 0.85 + 0.1 * Math.sin(time * 13.1) + 0.05 * Math.sin(time * 27.3);
    this.mats.glass.emissiveIntensity = 0.15 + nightFactor * 2.2 * flicker;
    this.lanternLight.intensity = nightFactor * 6 * flicker;
    this.flame.material.emissiveIntensity = 0.2 + nightFactor * 3 * flicker;

    // Chimney smoke: emit a puff every so often, rise, spread and fade.
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.35 + Math.random() * 0.25;
      const p = this.smoke.find((s) => s.age >= s.life);
      if (p) {
        p.age = 0;
        p.life = 5 + Math.random() * 3;
        p.position.copy(this.chimneyTop);
        p.drift.set(0.35 + Math.random() * 0.25, 0.9 + Math.random() * 0.4, 0.1 + (Math.random() - 0.5) * 0.3);
        // Wind is defined in world space; undo the cottage's rotation.
        p.drift.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.group.rotation.y);
        p.spin = Math.random() * Math.PI * 2;
      }
    }

    const { position, size, opacity, spin } = this.smokeAttrs;
    this.smoke.forEach((p, i) => {
      if (p.age < p.life) {
        p.age += dt;
        p.position.addScaledVector(p.drift, dt);
        p.drift.y *= 1 - dt * 0.12;
      }
      const t = Math.min(1, p.age / p.life);
      position.setXYZ(i, p.position.x, p.position.y, p.position.z);
      size.setX(i, 0.7 + t * 4.5);
      opacity.setX(i, p.age < p.life ? Math.min(1, t * 6) * (1 - t) * 0.55 : 0);
      spin.setX(i, p.spin);
    });
    for (const attr of Object.values(this.smokeAttrs)) attr.needsUpdate = true;

    const tint = 0.25 + lightLevel * 0.75;
    this.smokeMaterial.uniforms.color.value.setRGB(0.73 * tint, 0.7 * tint, 0.67 * tint);
  }

  // Call when the viewport or camera FOV changes so smoke puffs keep their size.
  setViewport(heightPx, fovDeg) {
    this.smokeMaterial.uniforms.pixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  // Colliders in world space as oriented boxes on the ground plane.
  worldColliders() {
    const rot = this.group.rotation.y;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const p = this.group.position;
    return this.colliders.map((b) => ({
      // Object3D yaw rotation maps local (x, z) to (x cos + z sin, -x sin + z cos).
      cx: p.x + b.cx * c + b.cz * s,
      cz: p.z - b.cx * s + b.cz * c,
      hx: b.hx,
      hz: b.hz,
      rot,
    }));
  }
}
