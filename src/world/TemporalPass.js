import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Frame blending for the pixelated modes. Big pixels turn every flutter of
// grass and leaf into a flickering speckle; mixing a share of the previous
// frame back in makes a pixel reluctant to change, so the motion reads as a
// few larger movements instead. The weight is set per frame by the game and
// drops to nothing while the camera turns, so nothing smears.
export class TemporalPass extends Pass {
  constructor() {
    super();
    this.weight = 0;
    this.history = [null, null];
    this.fresh = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tPrev: { value: null },
        uWeight: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tPrev;
        uniform float uWeight;
        varying vec2 vUv;
        void main() {
          vec4 cur = texture2D( tDiffuse, vUv );
          vec4 prev = texture2D( tPrev, vUv );
          gl_FragColor = mix( cur, prev, uWeight );
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  setSize(width, height) {
    for (let i = 0; i < 2; i++) {
      if (this.history[i]) this.history[i].dispose();
      this.history[i] = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
    }
    this.fresh = true;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    if (!this.history[0]) this.setSize(readBuffer.width, readBuffer.height);
    const [prev, next] = this.history;
    // Blend the new frame with the last blended frame, into the other history slot.
    u.tDiffuse.value = readBuffer.texture;
    u.tPrev.value = prev.texture;
    u.uWeight.value = this.fresh ? 0 : this.weight;
    renderer.setRenderTarget(next);
    this.fsQuad.render(renderer);
    // Then hand that on down the chain.
    u.tDiffuse.value = next.texture;
    u.uWeight.value = 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
    this.history.reverse();
    this.fresh = false;
  }

  dispose() {
    for (const h of this.history) if (h) h.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
