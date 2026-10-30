import * as THREE from 'three';
import * as tex from './textures.js';
import { weatherMasonry } from './masonry.js';

// Moss: a mottled, velvety green, yellow where the sun reaches and deep in
// the folds, speckled darker; bump from the same pattern.
function mossMaterial() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#56663a';
  ctx.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 3 + rnd() * 12;
    const tone = rnd();
    const col = tone < 0.4 ? '112,124,66' : tone < 0.75 ? '58,72,38' : '136,134,82';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},0.5)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = rnd() < 0.6 ? 'rgba(42,50,28,0.55)' : 'rgba(156,152,98,0.4)';
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, roughness: 1 });
}

// Shared materials for every building and prop. Textures are generated once;
// variants (plaster tints, warmer stone) reuse them with a colour multiplier.
export function createBuildingMaterials(noiseTexture, heightMap) {
  tex.setTextureNoise(noiseTexture);

  const rubble = tex.rubbleStone(1);
  const rubbleWarm = tex.rubbleStone(4, true);
  const ashlar = tex.ashlarStone(3);
  const cobble = tex.cobbleStone(2);
  const plaster = tex.plaster([0.92, 0.88, 0.8]);
  const timber = tex.timber();
  const planks = tex.planks();
  const barrelWood = tex.planks([0.5, 0.36, 0.22], 8);
  const logs = tex.bark([0.38, 0.29, 0.2], 7);
  const shingles = tex.woodShingles();
  const slate = tex.slate();
  const clay = tex.clayTiles();
  const thatch = tex.thatch();
  const whiteAshlar = tex.ashlarStone(9, true);
  // The same stone at house scale: the texture tiles ~2.5x more often.
  const fine = (t, rep) => {
    const map = t.map.clone();
    const bump = t.bump.clone();
    map.repeat.set(rep, rep);
    bump.repeat.set(rep, rep);
    map.needsUpdate = true;
    bump.needsUpdate = true;
    return { map, bump };
  };
  const whiteFine = fine(whiteAshlar, 2.4);
  const paleAshlar = tex.ashlarStone(5, true);
  const dressedPale = tex.dressedStone(11, true);
  const dressedDark = tex.dressedStone(23, true);
  const whiteCobble = tex.cobbleStone(12);

  const std = (t, bumpScale, roughness, extra = {}) =>
    new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale, roughness, metalness: 0, ...extra });

  const m = {
    stone: std(rubble, 3, 0.93),
    stoneWarm: std(rubbleWarm, 3, 0.93),
    ashlar: std(ashlar, 2, 0.9),
    cobble: std(cobble, 3, 0.92),
    plasterCream: std(plaster, 0.8, 0.95, { color: 0xe6d7bb }),
    plasterWhite: std(plaster, 0.8, 0.95, { color: 0xf1ece2 }),
    plasterOchre: std(plaster, 0.8, 0.95, { color: 0xd9b57e }),
    plasterRose: std(plaster, 0.8, 0.95, { color: 0xdcb8a6 }),
    timber: std(timber, 1, 0.85),
    timberLight: std(timber, 1, 0.85, { color: 0xc89c6a }),
    planks: std(planks, 1.5, 0.82),
    barrel: std(barrelWood, 1.5, 0.8),
    logs: std(logs, 2.5, 0.9),
    shingles: std(shingles, 3, 0.9),
    slate: std(slate, 2, 0.75),
    clay: std(clay, 2.5, 0.8),
    thatch: std(thatch, 4, 0.98),
    iron: new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.55, metalness: 0.75 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x0f2a2c, roughness: 0.08 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x7a2e24, roughness: 0.95, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      emissive: 0xffa24a,
      emissiveIntensity: 0.15,
      roughness: 0.15,
      metalness: 0.1,
    }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x302418, emissive: 0xffb060, emissiveIntensity: 0.2, roughness: 0.3 }),
    // Castle: pale limestone, a slightly warmer dressed stone, blue-grey slate, gilt.
    // Limestone picks up a lot of sky light, so its shadow side stays luminous.
    white: std(whiteAshlar, 1.2, 0.8, { color: 0xfaf7f0, envMapIntensity: 2.0 }),
    whiteDark: std(whiteAshlar, 1.6, 0.85, { color: 0xe4ddd0, envMapIntensity: 1.8 }),
    cobbleWhite: std(whiteCobble, 2.5, 0.9, { color: 0xe6e0d4, envMapIntensity: 1.6 }),
    whiteHouse: std(whiteFine, 1.0, 0.85, { color: 0xf4f0e8, envMapIntensity: 1.6 }),
    slateBlue: std(slate, 2, 0.7, { color: 0x6f7f96 }),
    gilt: new THREE.MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.25, metalness: 1.0 }),
    glassBlue: new THREE.MeshStandardMaterial({ color: 0x1a2438, emissive: 0x6a8ad0, emissiveIntensity: 0.18, roughness: 0.1, metalness: 0.2 }),
    banner: new THREE.MeshStandardMaterial({ color: 0x1e3a7a, roughness: 0.95, side: THREE.DoubleSide }),
    // Ruins: weathered grey ashlar and rubble, moss and turf.
    // Weathered limestone, as pale as Oblivion's Ayleid stone.
    ruin: std(paleAshlar, 2.8, 0.92, { color: 0xc9c4b8, envMapIntensity: 1.4 }),
    ruinDark: std(paleAshlar, 3.2, 0.95, { color: 0xaea89c, envMapIntensity: 1.3 }),
    // Single dressed blocks (ruins built stone by stone): no printed joints.
    ruinStone: std(dressedPale, 2.4, 0.92, { color: 0xd2cdc2, envMapIntensity: 1.4 }),
    ruinStoneDark: std(dressedDark, 2.6, 0.95, { color: 0xc8c2b6, envMapIntensity: 1.35 }),
    moss: mossMaterial(),
    turf: new THREE.MeshStandardMaterial({ color: 0x5e7d38, roughness: 1 }),
    // Portal gates: black glassy stone and the ember seams in it.
    obsidian: std(rubble, 3.0, 0.4, { color: 0x3a3230, metalness: 0.2 }),
    ember: new THREE.MeshStandardMaterial({ color: 0x2a0800, emissive: 0xff5a14, emissiveIntensity: 1.6, roughness: 0.6 }),
  };
  m.lamp.userData.noShadow = true;
  // Weather the walling stone in world space (stains, streaks, damp, moss).
  const W = (mat, o) => weatherMasonry(mat, { noise: noiseTexture, heightMap, ...o });
  W(m.white, { moss: 0.35, grime: 0.8, lichen: 0.05 });
  W(m.whiteDark, { moss: 0.5, grime: 1.0, lichen: 0.08 });
  W(m.whiteHouse, { moss: 0.3, grime: 0.8, lichen: 0.04 });
  W(m.ashlar, { moss: 0.6, grime: 1.0, lichen: 0.12 });
  W(m.stone, { moss: 0.7, grime: 1.0, lichen: 0.14 });
  W(m.stoneWarm, { moss: 0.6, grime: 1.0, lichen: 0.12 });
  W(m.ruin, { moss: 1.0, grime: 1.0, lichen: 0.22 });
  W(m.ruinDark, { moss: 1.0, grime: 1.1, lichen: 0.25 });
  // Single blocks are already varied stone by stone: weather them lightly.
  W(m.ruinStone, { moss: 0.55, grime: 0.55, lichen: 0.2 });
  W(m.ruinStoneDark, { moss: 0.6, grime: 0.65, lichen: 0.22 });
  return m;
}
