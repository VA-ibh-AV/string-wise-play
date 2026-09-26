import * as THREE from 'three';

const NOISE = /* glsl */ `
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/** Banded gas planet with storms, a day/night side, a rim glow, and sick/down looks. */
export function planetMaterial(hex: string, seed: number, light: THREE.Vector3) {
  const base = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const a = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9), 0.32);
  const b = new THREE.Color().setHSL((hsl.h + 0.04) % 1, Math.min(1, hsl.s * 0.7), 0.6);
  const c = new THREE.Color().setHSL((hsl.h + 0.5) % 1, 0.35, 0.75);
  return new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: a }, uB: { value: b }, uC: { value: c }, uSeed: { value: seed * 7.31 }, uLight: { value: light },
      uTime: { value: 0 }, uSick: { value: 0 }, uDown: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main() {
        vObj = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB, uC, uLight; uniform float uSeed, uTime, uSick, uDown;
      varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main() {
        vec3 p = vObj * 2.2 + uSeed;
        float warp = fbm(p + vec3(uTime * 0.03, 0.0, 0.0));
        float band = sin(vObj.y * 9.0 + warp * 4.5);
        vec3 col = mix(uA, uB, smoothstep(-0.7, 0.7, band));
        col = mix(col, uC, smoothstep(0.58, 0.8, fbm(p * 1.7 + 3.0)) * 0.55);
        float grey = dot(col, vec3(0.3, 0.59, 0.11));
        col = mix(col, mix(vec3(grey), vec3(0.42, 0.3, 0.06), 0.65), uSick * 0.85);
        vec3 N = normalize(vN);
        float diff = max(dot(N, normalize(uLight)), 0.0);
        vec3 c = col * (0.1 + diff * 1.05);
        float rim = pow(1.0 - max(dot(N, vV), 0.0), 3.0);
        c += mix(uB, vec3(0.8, 0.6, 0.2), uSick) * rim * 0.55 * (1.0 - uDown);
        float crack = smoothstep(0.035, 0.0, abs(fbm(p * 3.0) - 0.5));
        c = mix(c, c * 0.1 + vec3(1.0, 0.32, 0.08) * crack * 1.4, uDown);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Soft additive halo shell (atmospheres, the relay corona). */
export function atmosphereMaterial(hex: string, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; varying vec3 vN;
      void main() { float i = pow(max(0.0, 0.72 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.6); gl_FragColor = vec4(uColor * i * uStrength, 1.0); }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** Lighthouse beam: bright at the star, fading along its length. */
export function beamMaterial(hex: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uStrength: { value: 0.5 } },
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        vH = uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        float along = pow(vH, 1.6);
        float edge = pow(abs(dot(normalize(vN), vV)), 1.5);
        gl_FragColor = vec4(uColor * along * edge * uStrength, 1.0);
      }`,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** A swirling cloud of soft points; the swirl runs on the GPU. */
export function nebulaCloud(count: number, radius: number, colors: string[]) {
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 4), col = new Float32Array(count * 3);
  const cs = colors.map(c => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    const r = radius * Math.pow(Math.random(), 0.6), a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * radius * 0.45 * (1 - r / radius + 0.3), Math.sin(a) * r], i * 3);
    rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const c = cs[i % cs.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: 5.5 }, uPR: { value: Math.min(2, window.devicePixelRatio || 1) }, uGlow: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize, uPR; attribute vec4 aRand; attribute vec3 aColor; varying vec3 vColor; varying float vA;
      void main() {
        vec3 p = position;
        float r = length(p.xz);
        float ang = uTime * (0.05 + 0.18 / (r + 0.6)) + aRand.x * 6.283;
        float c = cos(ang), s = sin(ang);
        p.xz = mat2(c, -s, s, c) * p.xz;
        p.y += sin(uTime * 0.25 + aRand.y * 6.283) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.4 + aRand.z) * uPR * (24.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vColor = aColor; vA = 0.25 + aRand.w * 0.45;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; varying vec3 vColor; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * a * vA * uGlow, 1.0); }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

/** Light lane: a glowing tube whose dashes drift both ways, faster and brighter when busy. */
export function laneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#4C66B8') }, uHot: { value: new THREE.Color('#9FF0D0') }, uTime: { value: 0 },
      uBusy: { value: 0 }, uLen: { value: 10 }, uGain: { value: 1 }, uPulse: { value: 0 }, uPath: { value: new THREE.Color(0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vCore;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vCore = abs(dot(n, normalize(cameraPosition - wp.xyz)));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uHot, uPath; uniform float uTime, uBusy, uLen, uGain, uPulse; varying vec2 vUv; varying float vCore;
      void main() {
        float core = pow(vCore, 1.4);
        float x = vUv.x * uLen;
        float speed = 0.25 + uBusy * 0.6;
        float d1 = smoothstep(0.32, 0.0, abs(fract(x * 0.7 - uTime * speed) - 0.5));
        float d2 = smoothstep(0.32, 0.0, abs(fract(x * 0.7 + uTime * speed + 0.37) - 0.5));
        float flow = (d1 + d2) * 0.5 * (0.2 + uBusy * 1.2);
        vec3 c = uColor * (0.18 + core * 0.4) + uHot * flow * core * 0.8 + uPath * core * 0.55;
        c += vec3(1.0, 0.9, 0.6) * uPulse * core * 0.6;
        gl_FragColor = vec4(c * uGain, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/** A star flare: soft core glow with a thin cross of rays. */
export function flareTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const h = size / 2;
  const r = g.createRadialGradient(h, h, 0, h, h, h);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  for (const [w, len, a] of [[3, 0.96, 0.55], [1.6, 0.6, 0.3]] as const) {
    for (const rot of a > 0.4 ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]) {
      g.save();
      g.translate(h, h);
      g.rotate(rot);
      const lg = g.createLinearGradient(-h * len, 0, h * len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(-h * len, -w / 2, h * len * 2, w);
      g.restore();
    }
  }
  return new THREE.CanvasTexture(cv);
}
