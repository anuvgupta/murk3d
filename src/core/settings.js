// Graphics presets, chosen with ?quality=low|medium|high in the URL.

const PRESETS = {
  low: { pixelRatio: 1, shadowMapSize: 2048, grassDensity: 180, grassFullDetail: 7, grassDrawDistance: 75, bloom: false },
  medium: { pixelRatio: 1.25, shadowMapSize: 2048, grassDensity: 300, grassFullDetail: 9, grassDrawDistance: 105, bloom: true },
  high: { pixelRatio: 1.5, shadowMapSize: 4096, grassDensity: 420, grassFullDetail: 11, grassDrawDistance: 135, bloom: true },
};

// A preset the adaptive stepper settled on last time is remembered.
let saved = null;
try {
  saved = localStorage.getItem('murk.quality');
} catch (e) {
  saved = null;
}
const requested = new URLSearchParams(window.location.search).get('quality') || saved;
export const QUALITY = PRESETS[requested] ? requested : 'high';
export const PRESET_ORDER = ['high', 'medium', 'low'];
export function rememberQuality(name) {
  try {
    localStorage.setItem('murk.quality', name);
  } catch (e) {
    /* private mode */
  }
}
export const settings = PRESETS[QUALITY];

// The adaptive quality ladder, cheapest last: render resolution (a share of
// the preset's), grass reach and bloom, all changeable while playing.
export const ADAPT_LADDER = [
  { name: 'full', res: 1, grass: 1, bloom: true },
  { name: 'res 85%', res: 0.85, grass: 1, bloom: true },
  { name: 'res 85%, grass 80%', res: 0.85, grass: 0.8, bloom: true },
  { name: 'res 72%, grass 80%', res: 0.72, grass: 0.8, bloom: true },
  { name: 'res 72%, grass 65%, no bloom', res: 0.72, grass: 0.65, bloom: false },
  { name: 'res 60%, grass 65%, no bloom', res: 0.6, grass: 0.65, bloom: false },
];
// Where the ladder settled, per preset, for the next visit.
export function loadAdapt() {
  try {
    const d = JSON.parse(localStorage.getItem('murk.adapt') || 'null');
    return d && typeof d.preset === 'string' && Number.isInteger(d.level) ? d : null;
  } catch (e) {
    return null;
  }
}
export function rememberAdapt(preset, level) {
  try {
    localStorage.setItem('murk.adapt', JSON.stringify({ preset, level }));
  } catch (e) {
    /* private mode */
  }
}

// Pixelation: the frame is rendered at twice the pixel grid, box-filtered
// down to it (PixelatePass) and scaled up with nearest-neighbour sampling,
// so the pixels are real, filtered rather than sampled, and the whole post
// chain (atmosphere, bloom) stays consistent. `px` is the size of one game
// pixel in CSS pixels; 0 means the normal resolution.
export const PIXEL_LEVELS = [
  { name: 'Off', px: 0 },
  { name: 'Mild', px: 3 },
  { name: 'Strong', px: 6 },
];
export function loadPixelLevel() {
  const q = new URLSearchParams(window.location.search).get('pixels');
  let v = q;
  if (v === null) {
    try {
      v = localStorage.getItem('murk.pixels');
    } catch (e) {
      v = null;
    }
  }
  const i = parseInt(v ?? '0', 10);
  return Number.isInteger(i) && i >= 0 && i < PIXEL_LEVELS.length ? i : 0;
}
export function rememberPixelLevel(i) {
  try {
    localStorage.setItem('murk.pixels', String(i));
  } catch (e) {
    /* private mode */
  }
}
