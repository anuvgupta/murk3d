import * as THREE from 'three';
import { createNoise2D } from '../util/noise.js';

// Weather-ish wind: it drifts between calm spells, steady breezes and short
// gusts, and its direction wanders slowly. Shaders get the overall strength
// plus a travel offset, which they use to scroll a noise field downwind so
// gust fronts visibly roll across the grass and trees.
const PHASES = {
  calm: { strength: [0.04, 0.14], duration: [6, 16], next: { calm: 0.15, breeze: 0.7, gust: 0.15 } },
  breeze: { strength: [0.28, 0.48], duration: [8, 20], next: { calm: 0.35, breeze: 0.25, gust: 0.4 } },
  gust: { strength: [0.7, 1.0], duration: [2.5, 7], next: { calm: 0.2, breeze: 0.8, gust: 0 } },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class Wind {
  constructor() {
    this.noise = createNoise2D(31);
    this.time = 0;
    this.baseAngle = 0.35; // radians; prevailing wind from the west-southwest
    this.direction = new THREE.Vector2(1, 0);
    this.strength = 0.3;
    this.target = 0.3;
    this.phase = 'breeze';
    this.phaseTime = 10;
    this.travel = 0;
    // When > 0, the shaders only see the wind advance this many times a
    // second (the pixelated modes), so a gust reads as a few big moves
    // instead of a constant shimmer of single pixels.
    this.stepHz = 0;
    this._stepAcc = 0;

    this.uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: this.direction.clone() },
      uWindStrength: { value: this.strength },
      uWindTravel: { value: 0 },
    };
  }

  pickPhase() {
    const options = PHASES[this.phase].next;
    let r = Math.random();
    for (const [name, p] of Object.entries(options)) {
      r -= p;
      if (r <= 0) {
        this.phase = name;
        break;
      }
    }
    const def = PHASES[this.phase];
    this.target = rand(...def.strength);
    this.phaseTime = rand(...def.duration);
  }

  update(dt) {
    this.time += dt;
    this.phaseTime -= dt;
    if (this.phaseTime <= 0) this.pickPhase();

    // Rises quickly into a gust, dies away more slowly.
    const rate = this.target > this.strength ? 0.9 : 0.35;
    this.strength += (this.target - this.strength) * (1 - Math.exp(-rate * dt));
    const flutter = this.noise(this.time * 0.35, 3.7) * 0.06;
    const s = Math.max(0, this.strength + flutter);

    const angle = this.baseAngle + this.noise(this.time * 0.015, 9.1) * 0.7;
    this.direction.set(Math.cos(angle), Math.sin(angle));

    // Gust fronts move faster in stronger wind.
    this.travel += dt * (3 + 9 * s);

    if (this.stepHz > 0) {
      this._stepAcc += dt;
      if (this._stepAcc < 1 / this.stepHz) return;
      this._stepAcc = 0;
    }
    this.uniforms.uTime.value = this.time;
    this.uniforms.uWindDir.value.copy(this.direction);
    this.uniforms.uWindStrength.value = s;
    this.uniforms.uWindTravel.value = this.travel;
  }
}

// GLSL helper: local wind strength at a world position. Needs uNoise and the
// wind uniforms declared by the including shader.
export const WIND_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform float uWindTravel;

  // 0..~1.6: overall strength modulated by gust fronts rolling downwind.
  float windAt( vec2 p ) {
    vec2 q = p - uWindDir * uWindTravel;
    float front = texture( uNoise, q * 0.006 ).g;
    float ripple = texture( uNoise, q * 0.03 ).b;
    float local = smoothstep( 0.3, 0.8, front ) * 0.9 + ripple * 0.35;
    return uWindStrength * ( 0.35 + local * 1.2 );
  }
`;
