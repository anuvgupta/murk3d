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
  };
  m.lamp.userData.noShadow = true;
  return m;
}
