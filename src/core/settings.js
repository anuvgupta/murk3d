// Graphics presets, chosen with ?quality=low|medium|high in the URL.

const PRESETS = {
  low: { pixelRatio: 1, shadowMapSize: 2048, grassDensity: 2.5, grassDrawDistance: 90, bloom: false },
  medium: { pixelRatio: 1.25, shadowMapSize: 2048, grassDensity: 4, grassDrawDistance: 120, bloom: true },
  high: { pixelRatio: 1.5, shadowMapSize: 4096, grassDensity: 5, grassDrawDistance: 150, bloom: true },
};

const requested = new URLSearchParams(window.location.search).get('quality');
export const QUALITY = PRESETS[requested] ? requested : 'high';
export const settings = PRESETS[QUALITY];
