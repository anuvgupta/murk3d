// World layout: where things sit in the starting vale. Shared by the terrain
// (flattening, path colouring), grass (density) and gameplay (spawn, colliders).

import * as THREE from 'three';

export const WORLD_SIZE = 1600; // metres, edge length of the terrain square
export const WORLD_HALF = WORLD_SIZE / 2;

export const SPAWN = new THREE.Vector3(-4, 0, 26);
export const SPAWN_YAW = 0.12; // radians, facing roughly toward the cottage

export const HOUSE = {
  position: new THREE.Vector3(6, 0, -14),
  rotationY: 0.22,
  // Radius of the levelled plot around the cottage and the blend band beyond it.
  flatRadius: 11,
  blendRadius: 12,
};

// Door sits on the cottage's local +z face; see House.js.
const DOOR_LOCAL = new THREE.Vector3(-1.2, 0, 4.4);

function houseLocalToWorld(v) {
  return v
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), HOUSE.rotationY)
    .add(new THREE.Vector3(HOUSE.position.x, 0, HOUSE.position.z));
}

// A dirt footpath that wanders up to the cottage door.
export const PATH_POINTS = [
  new THREE.Vector2(-30, 120),
  new THREE.Vector2(-18, 80),
  new THREE.Vector2(-12, 50),
  new THREE.Vector2(-6, 26),
  new THREE.Vector2(-1, 10),
  (() => {
    const d = houseLocalToWorld(DOOR_LOCAL);
    return new THREE.Vector2(d.x, d.z);
  })(),
];

export const PATH_WIDTH = 1.4;

// Distance from (x, z) to the footpath polyline.
export function distanceToPath(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH_POINTS.length - 1; i++) {
    const a = PATH_POINTS[i];
    const b = PATH_POINTS[i + 1];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const apx = x - a.x;
    const apz = z - a.y;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz)));
    const dx = apx - abx * t;
    const dz = apz - abz * t;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}
