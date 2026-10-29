import * as THREE from 'three';
import * as tex from './textures.js';

// Shared materials for every building and prop. Textures are generated once;
// variants (plaster tints, warmer stone) reuse them with a colour multiplier.
export function createBuildingMaterials(noiseTexture) {
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
    slateBlue: std(slate, 2, 0.7, { color: 0x6f7f96 }),
    gilt: new THREE.MeshStandardMaterial({ color: 0xe8c45a, roughness: 0.25, metalness: 1.0 }),
    glassBlue: new THREE.MeshStandardMaterial({ color: 0x1a2438, emissive: 0x6a8ad0, emissiveIntensity: 0.18, roughness: 0.1, metalness: 0.2 }),
    banner: new THREE.MeshStandardMaterial({ color: 0x1e3a7a, roughness: 0.95, side: THREE.DoubleSide }),
    // Ruins: weathered grey ashlar and rubble, moss and turf.
    // Weathered limestone, as pale as Oblivion's Ayleid stone.
    ruin: std(ashlar, 2.8, 0.92, { color: 0xd2cec4, envMapIntensity: 1.4 }),
    ruinDark: std(ashlar, 3.2, 0.95, { color: 0xbdb7ab, envMapIntensity: 1.3 }),
    moss: new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 1 }),
    turf: new THREE.MeshStandardMaterial({ color: 0x5e7d38, roughness: 1 }),
    // Portal gates: black glassy stone and the ember seams in it.
    obsidian: std(rubble, 3.0, 0.4, { color: 0x3a3230, metalness: 0.2 }),
    ember: new THREE.MeshStandardMaterial({ color: 0x2a0800, emissive: 0xff5a14, emissiveIntensity: 1.6, roughness: 0.6 }),
  };
  m.lamp.userData.noShadow = true;
  return m;
}
