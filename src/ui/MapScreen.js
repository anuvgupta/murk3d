import { WORLD_SIZE, WORLD_HALF, HOUSES, ROADS, RIVER, LAKE, PLAZA, HILL, BRIDGE, OVERLOOK, SHELVES, RUINS, CREVASSE, LAKES } from '../world/plan.js';
import { REGIONS } from '../world/regions.js';
import { HOUSE_NAMES } from '../buildings/houses.js';

// The map (M): a parchment-style top-down view of the vale, drawn once from
// the terrain and plan, with the player's position and facing drawn live.
// The view is centred on the player and can be zoomed with the wheel.

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
    this.base = this.paintBase();
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.min(8, Math.max(0.9, this.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      this.draw();
    }, { passive: false });
    window.addEventListener('resize', () => this.open && this.draw());
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
    if (visible) this.draw();
  }

  draw() {
    const cv = this.canvas;
    const w = (cv.width = cv.clientWidth * devicePixelRatio);
    const h = (cv.height = cv.clientHeight * devicePixelRatio);
    const ctx = this.ctx;
    const g = this.game;
    const p = g.player.position;
    const z = this.zoom * devicePixelRatio;

    ctx.fillStyle = '#2a211a';
    ctx.fillRect(0, 0, w, h);
    // Base image: world metres -> screen, centred on the player.
    const scale = z / PX;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-toPx(p.x), -toPx(p.z));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();

    // Labels.
    const toScreen = (x, zz) => [w / 2 + (x - p.x) * z, h / 2 + (zz - p.z) * z];
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
    ctx.save();
    ctx.translate(w / 2, h / 2);
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

    this.label.textContent = `${Math.round(p.x)}, ${Math.round(p.z)} · scroll to zoom · M to close`;
  }
}

function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
