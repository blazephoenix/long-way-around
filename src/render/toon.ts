// Toon materials: shared gradient ramp (per-biome steps), vertex-coloured statics,
// instanced vegetation with per-instance tint and gentle wind sway.
import * as THREE from 'three';

export const shared = {
  time: { value: 0 },
  wind: { value: 0.6 },
  wet: { value: 0 },
};

const gradData = new Uint8Array(4 * 4);
export const gradientMap = new THREE.DataTexture(gradData, 4, 1, THREE.RGBAFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;

let curSteps: number[] = [];
export function setGradient(steps: number[]) {
  // always 4 texels; 3-step ramps repeat the last band
  const s = steps.length === 3 ? [steps[0], steps[1], steps[2], steps[2]] : steps;
  if (curSteps.length === 4 && s.every((v, i) => Math.abs(v - curSteps[i]) < 0.004)) return;
  curSteps = s.slice();
  for (let i = 0; i < 4; i++) {
    const v = Math.round(Math.min(1, Math.max(0, s[i])) * 255);
    gradData[i * 4] = gradData[i * 4 + 1] = gradData[i * 4 + 2] = v;
    gradData[i * 4 + 3] = 255;
  }
  gradientMap.needsUpdate = true;
}
setGradient([0.42, 0.68, 0.88, 1.0]);

export function toon(opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap, ...opts });
}

/** Static world geometry with vertex colours. */
export const matVC = toon({ vertexColors: true });

/** Road: vertex colours, polygon offset so it never z-fights the terrain, darkens when wet. */
export const matRoad = toon({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
matRoad.onBeforeCompile = (sh) => {
  sh.uniforms.uWet = shared.wet;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uWet;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(1.0, 0.62, uWet);');
  sh.fragmentShader = sh.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     // wet sheen: a soft sky reflection at grazing angles
     float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 4.0);
     totalEmissiveRadiance += uWet * fres * vec3(0.35, 0.4, 0.48);`,
  );
};

/** Instanced vegetation/props: per-instance colour applies only where aTint = 1; foliage sways. */
export function makeInstancedMat(sway: number): THREE.MeshToonMaterial {
  const m = toon({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uWind = shared.wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aTint;
        uniform float uTime;
        uniform float uWind;`)
      .replace(
        '#include <color_vertex>',
        `vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= mix(vec3(1.0), instanceColor, aTint);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        {
          vec3 ip = instanceMatrix[3].xyz;
          float ph = ip.x * 0.13 + ip.z * 0.17;
          float k = ${sway.toFixed(3)} * aTint * max(position.y, 0.0) * uWind;
          transformed.x += sin(uTime * 1.3 + ph) * k * 0.05;
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * k * 0.035;
        }
        #endif`,
      );
  };
  return m;
}

export const matWater = toon({ color: 0x3f7f9a, transparent: false, emissive: 0x0a2a3a });
matWater.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = shared.time;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n varying vec3 vWp;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp = (modelMatrix * vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n varying vec3 vWp;\n uniform float uTime;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // comic-style glints: thin bright dashes drifting on the surface
      float w = sin(vWp.x * 0.35 + uTime * 0.9 + sin(vWp.z * 0.21) * 2.0) * sin(vWp.z * 0.42 - uTime * 0.7);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.45 + 0.08, step(0.93, w));`,
    );
};

/** Unlit glow (headlights, windows at night, neon). */
export function glow(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, fog: true });
}
