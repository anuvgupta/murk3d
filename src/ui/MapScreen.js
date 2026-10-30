import { WORLD_SIZE, WORLD_HALF, HOUSES, ROADS, RIVER, LAKE, PLAZA, HILL, BRIDGE, OVERLOOK, SHELVES, RUINS, CREVASSE, LAKES } from '../world/plan.js';
import { REGIONS } from '../world/regions.js';
import { HOUSE_NAMES } from '../buildings/houses.js';

// The map (M): a parchment-style top-down view of the vale, drawn once from
// the terrain and plan, with the player's position and facing drawn live.
// The view opens centred on the player. It pans toward the pointer (push it
// away from the middle and the map slides that way, faster the further out),
// with WASD / arrows, and zooms with the wheel (eased, about the pointer) or
// Q / E and - / =. Panning stops at the edge of the map.

const MAP_PX = 2048; // base raster covers the whole world
const PX = MAP_PX / WORLD_SIZE;
const toPx = (v) => (v + WORLD_HALF) * PX;

const RUIN_LABELS = { lakeside: 'Drowned Temple', crypt: 'Barrow Crypt', forest: 'Standing Stones', hill: 'Old Watchtower', chapel: 'Ruined Chapel', crevasse: 'Sunken Arcade' };

export class MapScreen {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('map');
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.label = document.getElementById('map-label');
    this.open = false;
    this.zoom = 3.2; // screen pixels per metre
    this.targetZoom = this.zoom;
    this.center = { x: 0, z: 0 }; // world metres at the middle of the screen
    this.pointer = { x: 0, y: 0, active: false }; // CSS pixels on the canvas
    this.base = this.paintBase();
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // Normalise wheel units, then ease toward the target: a gentle scroll
        // moves a little, a hard one a lot, and nothing jumps.
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
        const d = Math.max(-240, Math.min(240, e.deltaY * unit));
        this.targetZoom = clampZoom(this.targetZoom * Math.exp(-d * 0.0022));
        this.zoomAnchor = this.pointerWorld();
      },
      { passive: false }
    );
    // The pointer: a real cursor in drag mode, a virtual one under pointer lock.
    document.addEventListener('mousemove', (e) => {
      if (!this.open) return;
      if (document.pointerLockElement) {
        this.pointer.x = Math.max(0, Math.min(this.canvas.clientWidth, this.pointer.x + e.movementX));
        this.pointer.y = Math.max(0, Math.min(this.canvas.clientHeight, this.pointer.y + e.movementY));
      } else {
        const r = this.canvas.getBoundingClientRect();
        this.pointer.x = e.clientX - r.left;
        this.pointer.y = e.clientY - r.top;
      }
      this.pointer.active = true;
    });
    window.addEventListener('resize', () => this.open && this.draw());
  }

  // World position under the pointer.
  pointerWorld() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: this.center.x + (this.pointer.x - w / 2) / this.zoom, z: this.center.z + (this.pointer.y - h / 2) / this.zoom };
  }

  // Keep the view inside the map: the edge of the world stops at the edge of
  // the screen, and a view wider than the world sits centred.
  clampCenter() {
    const halfW = this.canvas.clientWidth / 2 / this.zoom;
    const halfH = this.canvas.clientHeight / 2 / this.zoom;
    const lim = (half) => Math.max(0, WORLD_HALF - half);
    this.center.x = Math.max(-lim(halfW), Math.min(lim(halfW), this.center.x));
    this.center.z = Math.max(-lim(halfH), Math.min(lim(halfH), this.center.z));
  }

  // Called every frame while the map is open.
  update(dt, input) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Zoom keys, then ease the zoom toward its target, about the anchor.
    let keyZoom = 0;
    if (input.down('KeyE') || input.down('Equal') || input.down('NumpadAdd')) keyZoom += 1;
    if (input.down('KeyQ') || input.down('Minus') || input.down('NumpadSubtract')) keyZoom -= 1;
    if (keyZoom) {
      this.targetZoom = clampZoom(this.targetZoom * Math.exp(keyZoom * 1.6 * dt));
      this.zoomAnchor = null;
    }
    if (Math.abs(this.targetZoom - this.zoom) > 1e-4) {
      const before = this.zoom;
      this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-12 * dt));
      if (Math.abs(this.targetZoom - this.zoom) < 1e-3) this.zoom = this.targetZoom;
      if (this.zoomAnchor) {
        // Keep the world point under the pointer where it is.
        const a = this.zoomAnchor;
        const px = this.pointer.x - w / 2;
        const py = this.pointer.y - h / 2;
        this.center.x = a.x - px / this.zoom;
        this.center.z = a.z - py / this.zoom;
      }
      if (before === this.zoom) this.zoomAnchor = null;
    }
    // Pan: keys, and the pointer pushing out from the middle of the screen.
    let vx = 0;
    let vz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) vz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) vz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) vx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) vx += 1;
    const keySpeed = 720 / this.zoom; // screen pixels per second, in metres
    this.center.x += vx * keySpeed * dt;
    this.center.z += vz * keySpeed * dt;
    if (this.pointer.active) {
      const half = Math.min(w, h) / 2;
      const ox = (this.pointer.x - w / 2) / half;
      const oy = (this.pointer.y - h / 2) / half;
      const r = Math.hypot(ox, oy);
      const dead = 0.14;
      if (r > dead) {
        const k = Math.pow(Math.min(1, (r - dead) / (1 - dead)), 1.6) * 900; // px/s at the edge
        this.center.x += (ox / r) * (k / this.zoom) * dt;
        this.center.z += (oy / r) * (k / this.zoom) * dt;
      }
    }
    this.clampCenter();
    this.draw();
  }

  // Terrain, water, roads and buildings as one offscreen image.
  paintBase() {
    const g = this.game;
    const c = document.createElement('canvas');
    c.width = c.height = MAP_PX;
    const ctx = c.getContext('2d');

    // Shaded relief from the height field: hill-shade from the north-west,
    // tinted by altitude (meadow -> rock -> snow).
    const img = ctx.createImageData(MAP_PX, MAP_PX);
    const t = g.terrain;
    const d = img.data;
    const step = WORLD_SIZE / MAP_PX;
    const col = { low: [142, 160, 96], mid: [126, 118, 96], high: [206, 204, 196], water: [86, 118, 128] };
    for (let y = 0; y < MAP_PX; y++) {
      const wz = -WORLD_HALF + (y + 0.5) * step;
      for (let x = 0; x < MAP_PX; x++) {
        const wx = -WORLD_HALF + (x + 0.5) * step;
        const h = t.heightAt(wx, wz);
        const hl = t.heightAt(wx - step, wz);
        const hu = t.heightAt(wx, wz - step);
        const shade = Math.max(0.55, Math.min(1.25, 1 + (hl - h + hu - h) * 0.35));
        let rgb;
        if (h < 60) rgb = mix(col.low, col.mid, h / 60);
        else rgb = mix(col.mid, col.high, Math.min(1, (h - 60) / 110));
        const o = (y * MAP_PX + x) * 4;
        d[o] = rgb[0] * shade;
        d[o + 1] = rgb[1] * shade;
        d[o + 2] = rgb[2] * shade;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Parchment wash.
    ctx.fillStyle = 'rgba(214, 190, 140, 0.32)';
    ctx.fillRect(0, 0, MAP_PX, MAP_PX);
    // Beyond the realms the land is unsurveyed: fade it into the parchment.
    const edge = ctx.createRadialGradient(MAP_PX / 2, MAP_PX / 2, 745 * PX, MAP_PX / 2, MAP_PX / 2, 800 * PX);
    edge.addColorStop(0, 'rgba(206, 184, 140, 0)');
    edge.addColorStop(1, 'rgba(206, 184, 140, 1)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, MAP_PX, MAP_PX);

    // Water.
    ctx.strokeStyle = ctx.fillStyle = '#5f8a98';
    ctx.lineCap = ctx.lineJoin = 'round';
    for (let i = 0; i < RIVER.path.count - 1; i += 2) {
      const j = Math.min(RIVER.path.count - 1, i + 3);
      ctx.lineWidth = RIVER.widthAt(RIVER.path.s[i]) * PX;
      ctx.beginPath();
      ctx.moveTo(toPx(RIVER.path.x[i]), toPx(RIVER.path.z[i]));
      ctx.lineTo(toPx(RIVER.path.x[j]), toPx(RIVER.path.z[j]));
      ctx.stroke();
    }
    for (const L of LAKES) {
      ctx.beginPath();
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        const r = L.radiusAt(a);
        const px = toPx(L.x + Math.cos(a) * r);
        const py = toPx(L.z + Math.sin(a) * r);
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      if (L.ring) ctx.arc(toPx(L.x), toPx(L.z), L.ring * PX, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    }

    // Roads.
    for (const road of ROADS) {
      ctx.strokeStyle = road.name === 'main' ? '#7d5a34' : '#8f6d44';
      ctx.lineWidth = Math.max(2, road.width * PX);
      ctx.beginPath();
      const p = road.path;
      ctx.moveTo(toPx(p.x[0]), toPx(p.z[0]));
      for (let i = 1; i < p.count; i++) ctx.lineTo(toPx(p.x[i]), toPx(p.z[i]));
      ctx.stroke();
    }

    // Plaza, bridge, houses.
    ctx.fillStyle = '#9a8d7a';
    ctx.beginPath();
    ctx.arc(toPx(PLAZA.x), toPx(PLAZA.z), PLAZA.radius * PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(toPx(BRIDGE.x), toPx(BRIDGE.z));
    ctx.rotate(-BRIDGE.rotationY);
    ctx.fillStyle = '#b5ad9c';
    ctx.fillRect((-BRIDGE.width / 2) * PX, (-BRIDGE.length / 2) * PX, BRIDGE.width * PX, BRIDGE.length * PX);
    ctx.restore();
    for (const h of HOUSES) {
      ctx.save();
      ctx.translate(toPx(h.x), toPx(h.z));
      ctx.rotate(-h.rotationY);
      ctx.fillStyle = '#5a3f2c';
      ctx.fillRect(-h.footprint.hx * PX, -h.footprint.hz * PX, h.footprint.hx * 2 * PX, h.footprint.hz * 2 * PX);
      ctx.restore();
    }
    return c;
  }

  show(visible) {
    this.open = visible;
    this.root.classList.toggle('hidden', !visible);
    if (visible) {
      const p = this.game.player.position;
      this.center.x = p.x;
      this.center.z = p.z;
      this.targetZoom = this.zoom;
      this.zoomAnchor = null;
      this.pointer.x = this.canvas.clientWidth / 2;
      this.pointer.y = this.canvas.clientHeight / 2;
      this.pointer.active = false;
      this.clampCenter();
      this.draw();
    }
  }

  draw() {
    const cv = this.canvas;
    const w = (cv.width = cv.clientWidth * devicePixelRatio);
    const h = (cv.height = cv.clientHeight * devicePixelRatio);
    const ctx = this.ctx;
    const g = this.game;
    const p = g.player.position;
    const c = this.center;
    const z = this.zoom * devicePixelRatio;

    ctx.fillStyle = '#2a211a';
    ctx.fillRect(0, 0, w, h);
    // Base image: world metres -> screen, centred on the view centre.
    const scale = z / PX;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-toPx(c.x), -toPx(c.z));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();

    // Labels.
    const toScreen = (x, zz) => [w / 2 + (x - c.x) * z, h / 2 + (zz - c.z) * z];
    ctx.font = `${13 * devicePixelRatio}px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1e6cf';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4 * devicePixelRatio;
    const label = (text, x, zz, dy = 0) => {
      const [sx, sy] = toScreen(x, zz);
      if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) return;
      ctx.fillText(text, sx, sy + dy);
    };
    label('Murk', PLAZA.x, PLAZA.z, -16 * devicePixelRatio);
    label('The Overlook', OVERLOOK.x, OVERLOOK.z - 6);
    label('Lake', LAKE.x, LAKE.z);
    label('Elder Wood', -215, 128);
    label('Castle Rock', 185, -200);
    for (const R of REGIONS) label(R.name, R.x, R.z);
    label('The Shelves', SHELVES.x, SHELVES.z);
    label('The Rift', CREVASSE.path.x[Math.floor(CREVASSE.path.count / 2)], CREVASSE.path.z[Math.floor(CREVASSE.path.count / 2)]);
    if (z > 1.6) for (const s of RUINS) label(RUIN_LABELS[s.kind], s.x, s.z, 16 * devicePixelRatio);
    if (z > 2.2) for (const hh of HOUSES) label(HOUSE_NAMES[hh.design], hh.x, hh.z, 16 * devicePixelRatio);
    for (const l of g.village.landmarks) if (l.name === 'bridge') label('Bridge', BRIDGE.x, BRIDGE.z - 6);
    ctx.shadowBlur = 0;

    // Player: an arrow in the facing direction.
    const yaw = g.player.yaw;
    const [ax, ay] = toScreen(p.x, p.z);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(-yaw + Math.PI);
    ctx.fillStyle = '#e8c37a';
    ctx.strokeStyle = '#2a211a';
    ctx.lineWidth = 2 * devicePixelRatio;
    const s = 9 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.4);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s * 0.45);
    ctx.lineTo(-s, s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // The pointer (a virtual one under pointer lock).
    if (this.pointer.active) {
      ctx.save();
      ctx.translate(this.pointer.x * devicePixelRatio, this.pointer.y * devicePixelRatio);
      ctx.strokeStyle = '#f1e6cf';
      ctx.fillStyle = 'rgba(42, 33, 26, 0.7)';
      ctx.lineWidth = 1.5 * devicePixelRatio;
      ctx.beginPath();
      ctx.arc(0, 0, 5 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    this.label.textContent = `${Math.round(p.x)}, ${Math.round(p.z)} · point or WASD to pan · scroll, Q / E to zoom · M to close`;
  }
}

function clampZoom(z) {
  return Math.min(14, Math.max(0.45, z));
}

function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
