// Graphics presets, chosen with ?quality=low|medium|high in the URL.

const PRESETS = {
  low: { pixelRatio: 1, shadowMapSize: 2048, grassDensity: 24, grassFullDetail: 14, grassDrawDistance: 70, bloom: false },
  medium: { pixelRatio: 1.25, shadowMapSize: 2048, grassDensity: 40, grassFullDetail: 18, grassDrawDistance: 95, bloom: true },
  high: { pixelRatio: 1.5, shadowMapSize: 4096, grassDensity: 60, grassFullDetail: 22, grassDrawDistance: 115, bloom: true },
};

const requested = new URLSearchParams(window.location.search).get('quality');
export const QUALITY = PRESETS[requested] ? requested : 'high';
export const settings = PRESETS[QUALITY];
