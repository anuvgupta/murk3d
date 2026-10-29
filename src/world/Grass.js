import * as THREE from 'three';
import { createNoise2D, mulberry32, smoothstep } from '../util/noise.js';
import { HOUSE, distanceToPath, PATH_WIDTH } from './layout.js';
import { settings } from '../core/settings.js';

const CHUNK = 16; // metres per grass chunk
const RADIUS = 120; // grass field radius around the vale centre
const BLADES_PER_TUFT = 5;
const FULL_DETAIL_DIST = 28; // chunks closer than this draw every blade

// A tuft of thin, tapered, slightly curved blades, 1 m tall at most.
// Instances place and scale whole tufts, which keeps the instance count down.
function createTuftGeometry(random) {
  const levels = [
    { y: 0.0, w: 1.0 },
    { y: 0.4, w: 0.8 },
    { y: 0.75, w: 0.5 },
  ];
  const positions = [];
  const colors = [];
  const uvs = [];
  const normals = [];
  const indices = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let b = 0; b < BLADES_PER_TUFT; b++) {
    const base = positions.length / 3;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 0.14;
    const ox = Math.cos(angle) * r;
    const oz = Math.sin(angle) * r;
    const yaw = random() * Math.PI * 2;
    const height = 0.65 + random() * 0.35;
    const halfWidth = 0.018 + random() * 0.012;
    const lean = 0.1 + random() * 0.2;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    // Normal leans upward so blades read as soft, lit turf rather than flat cards.
    n.set(0, 0.85, 0.5).normalize();
    const nx = n.x * cy + n.z * sy;
    const nz = -n.x * sy + n.z * cy;

    const emit = (lx, y, u) => {
      const lz = lean * y * y;
      p.set(lx * cy + lz * sy, y * height, -lx * sy + lz * cy);
      positions.push(p.x + ox, p.y, p.z + oz);
      uvs.push(u, y);
      const shade = 0.3 + 0.7 * y;
      colors.push(shade, shade, shade);
      normals.push(nx, n.y, nz);
    };

    for (const { y, w } of levels) {
      emit(-halfWidth * w, y, 0);
      emit(halfWidth * w, y, 1);
    }
    emit(0, 1, 0.5);

    for (let l = 0; l < levels.length - 1; l++) {
      const a = base + l * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const top = base + (levels.length - 1) * 2;
    indices.push(top, top + 1, top + 2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
}

function createGrassMaterial(uniforms) {
  // Lambert: no specular glints on thin blades, and cheaper to shade.
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        uniform vec3 uPlayer;`
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        {
          vec3 root = instanceMatrix[3].xyz;
          float hh = uv.y * uv.y;

          // Layered sway: slow rolling gusts plus quicker flutter.
          float gust = sin( uTime * 0.55 + root.x * 0.025 + root.z * 0.018 ) * 0.5 + 0.5;
          float phase = root.x * 0.33 + root.z * 0.21 + position.x * 6.0;
          float sway = sin( uTime * 1.7 + phase ) * ( 0.3 + gust * 0.7 )
                     + sin( uTime * 4.1 + phase * 3.7 ) * 0.12;
          vec2 windDir = normalize( vec2( 1.0, 0.35 ) );
          mvPosition.xz += windDir * sway * uWind * hh;
          mvPosition.y -= abs( sway ) * uWind * hh * 0.25;

          // Blades part around the player's feet.
          vec2 away = root.xz - uPlayer.xz;
          float d = length( away );
          float push = ( 1.0 - smoothstep( 0.2, 1.3, d ) ) * step( abs( root.y - uPlayer.y ), 2.0 );
          mvPosition.xz += ( away / max( d, 0.001 ) ) * push * hh * 0.55;
          mvPosition.y -= push * hh * 0.3;
        }
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`
      );

    // Light both faces the same way; a flipped normal would turn back faces black.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
    );
  };

  return material;
}

export class Grass {
  constructor(terrain, { exclude = () => false, seed = 11 } = {}) {
    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: 0.22 },
      uPlayer: { value: new THREE.Vector3(9999, 0, 9999) },
    };
    this.group = new THREE.Group();
    this.group.name = 'grass';
    this.chunks = [];

    const random = mulberry32(seed);
    const geometry = createTuftGeometry(random);
    const material = createGrassMaterial(this.uniforms);
    const noise = createNoise2D(seed);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const base = new THREE.Color(0x46661f);
    const lush = new THREE.Color(0x5e7f29);
    const dry = new THREE.Color(0x968746);

    const chunksPerSide = Math.ceil((RADIUS * 2) / CHUNK);
    const origin = -chunksPerSide * CHUNK * 0.5;

    for (let cz = 0; cz < chunksPerSide; cz++) {
      for (let cx = 0; cx < chunksPerSide; cx++) {
        const x0 = origin + cx * CHUNK;
        const z0 = origin + cz * CHUNK;
        const centerX = x0 + CHUNK / 2;
        const centerZ = z0 + CHUNK / 2;
        if (Math.hypot(centerX, centerZ) > RADIUS + CHUNK) continue;

        const candidates = Math.floor(CHUNK * CHUNK * settings.grassDensity);
        const matrixData = new Float32Array(candidates * 16);
        const colorData = new Float32Array(candidates * 3);
        let count = 0;
        let minY = Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < candidates; i++) {
          const x = x0 + random() * CHUNK;
          const z = z0 + random() * CHUNK;

          // Thin out toward the edge of the field, along the path and on the cottage plot.
          const r = Math.hypot(x, z);
          let keep = 1 - smoothstep(RADIUS * 0.7, RADIUS, r);
          const dp = distanceToPath(x, z);
          keep *= smoothstep(PATH_WIDTH * 0.55, PATH_WIDTH * 1.3, dp);
          const dh = Math.hypot(x - HOUSE.position.x, z - HOUSE.position.z);
          keep *= 0.35 + 0.65 * smoothstep(6, 10, dh);
          const patch = noise(x * 0.05, z * 0.05);
          keep *= 0.7 + 0.3 * patch;
          if (random() > keep || exclude(x, z)) continue;

          const y = terrain.heightAt(x, z);
          const nrm = terrain.normalAt(x, z);
          if (nrm.y < 0.8) continue; // no grass on steep banks

          const tall = 0.75 + 0.45 * (noise(x * 0.02 + 30, z * 0.02 + 30) * 0.5 + 0.5);
          const height = (0.4 + random() * 0.35) * tall * (0.6 + 0.4 * smoothstep(6, 12, dh));
          const width = 0.9 + random() * 0.5;

          dummy.position.set(x, y - 0.02, z);
          dummy.rotation.set((random() - 0.5) * 0.3, random() * Math.PI * 2, (random() - 0.5) * 0.3, 'YXZ');
          dummy.scale.set(width, height, width);
          dummy.updateMatrix();
          dummy.matrix.toArray(matrixData, count * 16);

          const tone = noise(x * 0.08 + 10, z * 0.08 + 10) * 0.5 + 0.5;
          color.copy(base).lerp(lush, tone * 0.8 + random() * 0.2);
          color.lerp(dry, smoothstep(0.35, 0.9, noise(x * 0.012 + 70, z * 0.012 + 70)) * 0.55 + random() * 0.08);
          color.toArray(colorData, count * 3);
          count++;

          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }

        if (count === 0) continue;

        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.instanceMatrix.array.set(matrixData.subarray(0, count * 16));
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colorData.slice(0, count * 3), 3);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        mesh.castShadow = false;

        // Per-chunk bounds so off-screen chunks are culled.
        const midY = (minY + maxY) / 2;
        mesh.boundingSphere = new THREE.Sphere(
          new THREE.Vector3(centerX, midY, centerZ),
          Math.hypot(CHUNK * 0.75, (maxY - minY) / 2 + 1.5)
        );
        mesh.boundingBox = new THREE.Box3(
          new THREE.Vector3(x0, minY - 0.5, z0),
          new THREE.Vector3(x0 + CHUNK, maxY + 1.5, z0 + CHUNK)
        );

        this.group.add(mesh);
        this.chunks.push({ mesh, center: new THREE.Vector3(centerX, midY, centerZ), total: count });
      }
    }
  }

  update(time, camera, playerPos) {
    this.uniforms.uTime.value = time;
    this.uniforms.uPlayer.value.copy(playerPos);

    // Distance LOD: instances are stored in random order, so drawing a prefix
    // of the buffer gives an even thinning of the chunk.
    const cam = camera.position;
    for (const chunk of this.chunks) {
      const d = Math.hypot(chunk.center.x - cam.x, chunk.center.z - cam.z);
      if (d > settings.grassDrawDistance) {
        chunk.mesh.visible = false;
        continue;
      }
      chunk.mesh.visible = true;
      const f = d < FULL_DETAIL_DIST ? 1 : Math.max(0.12, Math.pow(FULL_DETAIL_DIST / d, 1.4));
      chunk.mesh.count = Math.max(1, Math.floor(chunk.total * f));
    }
  }
}
