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
