import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// The pixel grid for the pixelated modes. The scene is rendered at twice the
// grid's resolution; this pass averages each 2×2 block into one flat pixel,
// so thin diagonals, leaf cut-outs and far grass are filtered down into the
// pixel rather than sampled once and left to shimmer. The canvas then scales
// the result up with nearest-neighbour sampling.
export class PixelatePass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uResolution;
        varying vec2 vUv;
        void main() {
          vec2 lowRes = uResolution * 0.5;
          vec2 q = ( floor( vUv * lowRes ) + 0.5 ) / lowRes; // centre of this 2x2 block
          vec2 h = 0.5 / uResolution;                        // half a source texel
          vec4 c = texture2D( tDiffuse, q + vec2( -h.x, -h.y ) )
                 + texture2D( tDiffuse, q + vec2(  h.x, -h.y ) )
                 + texture2D( tDiffuse, q + vec2( -h.x,  h.y ) )
                 + texture2D( tDiffuse, q + vec2(  h.x,  h.y ) );
          gl_FragColor = c * 0.25;
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  setSize(width, height) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
