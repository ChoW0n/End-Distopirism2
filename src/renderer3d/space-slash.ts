//물금 공간형 VFX (SPEC-005 §15.3·§15.3.1). 승인된 띠 질감을 몸 둘레를 도는 3D 휘두름 궤적(뒤 → 옆 → 앞)의 휜 메시에 입히고,
//깊이별 물방울·지면 물결을 따로 그린다. 계산은 src/render/space-slash.ts, 여기는 three.js 메시와 uniform 만 맡는다
//층(띠 몸통·띠 빛·물방울·물결)은 각각 켜고 끈다. 몸 가림은 부르는 쪽이 깊이만 쓰는 몸 판을 먼저 그려서 한다
//시각은 게임 ms 하나로만 정해진다 (같은 시각이면 같은 그림). 시험 화면 전용이라 인스턴스는 하나다

import * as THREE from 'three';
import { arcLengthPoints, slashSample, type RibbonSlashConfig } from '../render/ribbon-slash.js';
import { crossPoint, rippleSources, spaceDroplets, spacePath, type SpaceSlashConfig } from '../render/space-slash.js';
import { paintPoint, placePaintPoint, type SpacePaintView } from '../render/space-fx.js';
import { createStripMaterial, stripTexture, type StripSource } from './ribbon-slash.js';
import { samePaintView, spacePaintView } from './space-projection.js';

//물결 출처 최대 수 (셰이더 배열 크기)
const MAX_RIPPLES = 8;

//색 보정 (§15.2 띠 셰이더와 같은 식). 물방울·물결도 띠와 같은 톤이 되게 건다
const GRADE_GLSL = /* glsl */ `
uniform float uGradeBright;
uniform float uGradeSat;
uniform float uGradeGamma;
vec3 grade(vec3 c) {
  c = pow(max(c, vec3(0.0)), vec3(uGradeGamma));
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(g), c, uGradeSat) * uGradeBright;
}
`;

//깊이 물방울 정점 셰이더. 켜진 뒤 흩어지고 떨어진다(바닥 밑 안 감). 원근으로 화면 크기를 정한다 (TS spaceDropletPos·spaceDropletAlpha 와 같은 식)
const DROP_VERTEX = /* glsl */ `
attribute vec3 aDir;
attribute float aU;
attribute float aSize;
attribute float aLag;
attribute float aDrift;
attribute float aDim;
attribute float aSoft;
uniform float uAgeMs;
uniform float uRevealMs;
uniform float uHead;
uniform float uTail;
uniform float uAlive;
uniform float uGravity;
uniform float uViewportHalfH;
varying float vAlpha;
varying float vDim;
varying float vSoft;
void main() {
  float t = max(0.0, uAgeMs - uRevealMs * aU) / 1000.0;
  vec3 p = position + aDir * aDrift * t;
  p.y = max(aSize * 0.5, p.y - 0.5 * uGravity * t * t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * projectionMatrix[1][1] * uViewportHalfH / max(0.001, -mv.z);
  float shown = uAlive * step(aU, uHead);
  vAlpha = shown * clamp((aU + aLag - uTail) / 0.025, 0.0, 1.0);
  vDim = aDim;
  vSoft = aSoft;
}
`;

//깊이 물방울 조각 셰이더. 흰 심 + 파란 테. 먼 층은 짙은 남 쪽으로 어둡고, 가까운 층은 테가 번진다
const DROP_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uLight;
uniform vec3 uBright;
uniform vec3 uDeep;
${GRADE_GLSL}
varying float vAlpha;
varying float vDim;
varying float vSoft;
void main() {
  if (vAlpha <= 0.0) discard;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float spec = 1.0 - smoothstep(0.0, 0.35, length(gl_PointCoord - vec2(0.38, 0.38)) * 2.0);
  vec3 col = mix(uLight, uBright, smoothstep(0.1, 0.8, d));
  col = mix(col, uCore, spec * (1.0 - vSoft * 0.6));
  col = mix(uDeep, col, vDim);
  float edge = 1.0 - smoothstep(1.0 - 0.15 - vSoft * 0.75, 1.0, d);
  gl_FragColor = vec4(grade(col), vAlpha * edge * (1.0 - vSoft * 0.55));
  #include <colorspace_fragment>
}
`;

//지면 물결 정점 셰이더. 바닥 판 위 좌표(H 배수 아닌 월드)를 넘긴다
const RIPPLE_VERTEX = /* glsl */ `
varying vec2 vXZ;
void main() {
  vXZ = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

//지면 물결 조각 셰이더. 출처마다 고리 여러 겹이 퍼지며 옅어지고, 꼬리가 출처 u + lag 를 지나면 꺼진다 (TS rippleRing 과 같은 식)
//모양만 더한다: 고리 테는 고정 각도 노이즈로 흔들고, 테 바로 안쪽에 짙은 골을 두고, 멀리 퍼질수록 옅어진다
const RIPPLE_FRAGMENT = /* glsl */ `
uniform vec4 uSources[${MAX_RIPPLES}];
uniform int uSourceCount;
uniform float uAgeMs;
uniform float uTail;
uniform float uAlive;
uniform float uSpeed;
uniform float uLife;
uniform float uRings;
uniform float uGap;
uniform float uWidth;
uniform float uOpacity;
uniform float uLag;
uniform vec3 uLight;
uniform vec3 uFoam;
uniform vec3 uBody;
${GRADE_GLSL}
varying vec2 vXZ;
void main() {
  float crestSum = 0.0;
  float troughSum = 0.0;
  float reach = uSpeed * uLife / 1000.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= uSourceCount) break;
    vec4 s = uSources[i];
    float t = uAgeMs - s.z;
    if (t < 0.0) continue;
    float life = clamp(1.0 - t / uLife, 0.0, 1.0);
    float keep = clamp((s.w + uLag - uTail) / 0.03, 0.0, 1.0);
    vec2 dv = vXZ - s.xy;
    float dist = length(dv);
    float ang = atan(dv.y, dv.x);
    float wob = (0.6 * sin(ang * 3.0 + s.w * 40.0) + 0.4 * sin(ang * 7.0 + s.w * 17.0)) * uWidth * 0.35;
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      if (fk >= uRings) break;
      float r = uSpeed * t / 1000.0 - fk * uGap;
      if (r <= 0.0) continue;
      float w = life * keep * (1.0 - fk / (uRings + 1.0)) * (1.0 - smoothstep(0.0, reach, r) * 0.7);
      float x = (dist + wob - r) / uWidth;
      crestSum += exp(-x * x) * w;
      troughSum += exp(-(x + 1.8) * (x + 1.8)) * w;
    }
  }
  float crest = clamp(crestSum * uAlive, 0.0, 1.0);
  float trough = clamp(troughSum * uAlive, 0.0, 1.0);
  float a = clamp(crest * 0.9 + trough * 0.35, 0.0, 1.0);
  if (a <= 0.002) discard;
  vec3 col = mix(uBody, mix(uLight, uFoam, crest), crest / max(1e-3, crest + trough));
  gl_FragColor = vec4(grade(col), a * uOpacity);
  #include <colorspace_fragment>
}
`;

//켜고 끄는 층
export interface SpaceLayers {
  ribbon: boolean;
  glow: boolean;
  droplets: boolean;
  ripples: boolean;
}

export class SpaceSlashEffect {
  //장면에 붙인다. 위치 = 발 기준점, x 배율 = 바라보는 쪽
  readonly root = new THREE.Group();
  //띠·물방울·물결 묶음. 월드 위는 그대로 두고 좌우(요)만 게임 카메라 쪽으로 돈다 (§15.3.1 좌표)
  private readonly oriented = new THREE.Group();
  readonly layers: SpaceLayers = { ribbon: true, glow: true, droplets: true, ripples: true };
  //화려함 옵션 (§15.2 승인 기본값: 흐름·반짝임)
  readonly options: { flow: boolean; sparkle: boolean };
  //색 보정 (§15.2 승인값)
  readonly grade: { brightness: number; saturation: number; gamma: number };
  private readonly ribbonBody: THREE.Mesh;
  private readonly ribbonGlow: THREE.Mesh;
  private readonly drops: THREE.Points;
  private readonly ripples: THREE.Mesh;
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly texture: THREE.Texture;
  private readonly ribbonSamples: { x: number; y: number; depth: number }[] = [];
  private paintView: SpacePaintView | undefined;
  private age = 0;

  //승인 띠 질감(strip)과 캐릭터 키(월드), 게임 카메라가 내려다보는 각(도)으로 메시를 한 번 만든다
  constructor(
    private readonly config: RibbonSlashConfig,
    private readonly space: SpaceSlashConfig,
    private readonly H: number,
    strip: StripSource,
    private readonly pitchDeg: number,
  ) {
    if (!config.texture) throw new Error('공간형은 §15.2 띠 질감이 있어야 한다');
    this.options = { flow: config.options?.flow ?? false, sparkle: config.options?.sparkle ?? false };
    const g = config.texture.grade;
    this.grade = { brightness: g?.brightness ?? 1, saturation: g?.saturation ?? 1, gamma: g?.gamma ?? 1 };
    this.texture = stripTexture(strip);
    const color = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
    const palette = config.paletteSRGB;

    //띠: 같은 질감 셰이더, 휜 3D 지오메트리
    const ribbonGeometry = this.buildRibbon();
    const body = createStripMaterial(config, this.texture, this.grade, 0, THREE.NormalBlending);
    const glow = createStripMaterial(config, this.texture, this.grade, 1, THREE.AdditiveBlending);
    this.ribbonBody = new THREE.Mesh(ribbonGeometry, body);
    this.ribbonGlow = new THREE.Mesh(ribbonGeometry, glow);

    //깊이 물방울
    const dropMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAgeMs: { value: 0 },
        uRevealMs: { value: config.timingMs.reveal },
        uHead: { value: 0 },
        uTail: { value: 0 },
        uAlive: { value: 0 },
        uGravity: { value: space.droplets.gravityH * H },
        uViewportHalfH: { value: 400 },
        uCore: { value: color(palette.core) },
        uLight: { value: color(palette.light) },
        uBright: { value: color(palette.bright) },
        uDeep: { value: color(palette.deep) },
        uGradeBright: { value: this.grade.brightness },
        uGradeSat: { value: this.grade.saturation },
        uGradeGamma: { value: this.grade.gamma },
      },
      vertexShader: DROP_VERTEX,
      fragmentShader: DROP_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.drops = new THREE.Points(this.buildDroplets(), dropMaterial);

    //지면 물결: 발 둘레 바닥 판
    const sources = rippleSources(config, space, pitchDeg).slice(0, MAX_RIPPLES);
    const packed = Array.from({ length: MAX_RIPPLES }, (_, i) => {
      const s = sources[i];
      return s ? new THREE.Vector4(s.x * H, s.z * H, s.startMs, s.u) : new THREE.Vector4();
    });
    const r = space.ripples;
    const rippleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSources: { value: packed },
        uSourceCount: { value: sources.length },
        uAgeMs: { value: 0 },
        uTail: { value: 0 },
        uAlive: { value: 0 },
        uSpeed: { value: r.speedH * H },
        uLife: { value: r.lifeMs },
        uRings: { value: r.rings },
        uGap: { value: r.ringGapH * H },
        uWidth: { value: r.ringWidthH * H },
        uOpacity: { value: r.opacity },
        uLag: { value: r.lagU },
        uLight: { value: color(palette.light) },
        uFoam: { value: color(palette.foam) },
        uBody: { value: color(palette.body) },
        uGradeBright: { value: this.grade.brightness },
        uGradeSat: { value: this.grade.saturation },
        uGradeGamma: { value: this.grade.gamma },
      },
      vertexShader: RIPPLE_VERTEX,
      fragmentShader: RIPPLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      //바닥 판과 겹쳐 깜빡이지 않게 조금 당긴다
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    //고리가 끝까지 퍼질 수 있는 넓이
    const reach = (r.speedH * r.lifeMs) / 1000 + 0.2;
    const floor = new THREE.PlaneGeometry(4 * reach * H, 4 * reach * H);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0.004, 0);
    this.ripples = new THREE.Mesh(floor, rippleMaterial);

    //그리는 순서: 물결(바닥) → 띠 몸통 → 물방울 → 띠 빛
    this.ripples.renderOrder = 28;
    this.ribbonBody.renderOrder = 30;
    this.drops.renderOrder = 31;
    this.ribbonGlow.renderOrder = 32;
    for (const o of [this.ripples, this.ribbonBody, this.drops, this.ribbonGlow]) {
      o.frustumCulled = false;
      this.oriented.add(o);
    }
    this.root.add(this.oriented);
    this.materials.push(body, glow, dropMaterial, rippleMaterial);
    this.geometries.push(ribbonGeometry, this.drops.geometry, floor);
    this.setAge(0);
  }

  //휜 띠. 호 길이 등간격 × 단면 crossRows 줄. 텍스처 좌표·u·호에서 거리는 평면 띠(§15.2)와 같다
  private buildRibbon(): THREE.BufferGeometry {
    const config = this.config;
    const tex = config.texture as NonNullable<RibbonSlashConfig['texture']>;
    const [u0, u1] = tex.uRange;
    const [dTop, dBottom] = tex.dRangeH;
    const rows = this.space.crossRows;
    const H = this.H;
    const path = spacePath(config, this.space, Math.max(128, config.path.segments), this.pitchDeg);
    const painted = arcLengthPoints(config.path.points, path.length - 1);
    const positions: number[] = [];
    const uvs: number[] = [];
    const us: number[] = [];
    const ds: number[] = [];
    const index: number[] = [];
    const innerMax = Math.max(Math.abs(dBottom), 1e-3);
    path.forEach((pt, i) => {
      const flat = painted[i];
      if (!flat) return;
      const tu = (pt.u - u0) / (u1 - u0);
      for (let r = 0; r <= rows; r++) {
        //r=0 위(바깥 끝) → r=rows 아래(안쪽 끝)
        const d = dTop + ((dBottom - dTop) * r) / rows;
        const p = crossPoint(this.space, pt, d, innerMax);
        //질감의 원래 호·단면 좌표는 고정하고, 휘두름 면의 깊이만 공간에 남긴다
        this.ribbonSamples.push({ x: flat.p[0] - flat.tangent[1] * d, y: flat.p[1] + flat.tangent[0] * d, depth: p[2] });
        positions.push(p[0] * H, p[1] * H, p[2] * H);
        uvs.push(tu, 1 - r / rows);
        us.push(pt.u);
        ds.push(d);
      }
      if (i > 0) {
        const a = (i - 1) * (rows + 1);
        const b = i * (rows + 1);
        for (let r = 0; r < rows; r++) index.push(a + r, a + r + 1, b + r, a + r + 1, b + r + 1, b + r);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    geometry.setAttribute('aD', new THREE.Float32BufferAttribute(ds, 1));
    geometry.setIndex(index);
    return geometry;
  }

  //깊이 물방울 점 (월드 = H 배)
  private buildDroplets(): THREE.BufferGeometry {
    const H = this.H;
    const drops = spaceDroplets(this.config, this.space, this.pitchDeg);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(drops.flatMap((d) => [d.pos[0] * H, d.pos[1] * H, d.pos[2] * H]), 3));
    geometry.setAttribute('aDir', new THREE.Float32BufferAttribute(drops.flatMap((d) => [...d.dir]), 3));
    geometry.setAttribute('aU', new THREE.Float32BufferAttribute(drops.map((d) => d.u), 1));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(drops.map((d) => d.sizeH * H), 1));
    geometry.setAttribute('aLag', new THREE.Float32BufferAttribute(drops.map((d) => d.lagU), 1));
    geometry.setAttribute('aDrift', new THREE.Float32BufferAttribute(drops.map((d) => d.driftH * H), 1));
    geometry.setAttribute('aDim', new THREE.Float32BufferAttribute(drops.map((d) => d.dim), 1));
    geometry.setAttribute('aSoft', new THREE.Float32BufferAttribute(drops.map((d) => d.soft), 1));
    return geometry;
  }

  //기준 카메라의 원근에 질감 좌표를 맞춘다. 궤도 카메라는 넘기지 않아 공간 깊이가 남는다
  orient(camera: THREE.Camera): void {
    this.oriented.rotation.set(0, new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y, 0);
    const view = spacePaintView(camera, this.oriented, this.H);
    if (samePaintView(this.paintView, view)) return;
    this.paintView = view;
    const position = this.ribbonBody.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.ribbonSamples.forEach((sample, i) => {
      const p = placePaintPoint(view, paintPoint(view, sample.x, sample.y), sample.depth, 0.004);
      position.setXYZ(i, p[0] * this.H, p[1] * this.H, p[2] * this.H);
    });
    position.needsUpdate = true;
  }

  //화면 높이(장치 px). 물방울 크기 계산에 쓴다
  setViewportHeight(heightPx: number): void {
    const u = (this.drops.material as THREE.ShaderMaterial).uniforms['uViewportHalfH'] as THREE.IUniform<number>;
    u.value = Math.max(1, heightPx) / 2;
  }

  //지금 시각 (게임 ms)
  get ageMs(): number {
    return this.age;
  }

  //시각을 정하고 uniform 을 맞춘다. 같은 시각이면 같은 그림이다
  setAge(ageMs: number): void {
    this.age = Math.max(0, ageMs);
    const s = slashSample(this.config, this.age);
    const set = (m: THREE.ShaderMaterial, key: string, value: number): void => {
      const u = m.uniforms[key] as THREE.IUniform<number> | undefined;
      if (u) u.value = value;
    };
    for (const m of this.materials) {
      set(m, 'uHead', s.head);
      set(m, 'uTail', s.tail);
      set(m, 'uAgeMs', this.age);
      set(m, 'uAlive', s.alive ? 1 : 0);
      set(m, 'uFlow', this.options.flow ? 1 : 0);
      set(m, 'uSparkle', this.options.sparkle ? 1 : 0);
      set(m, 'uGradeBright', this.grade.brightness);
      set(m, 'uGradeSat', this.grade.saturation);
      set(m, 'uGradeGamma', this.grade.gamma);
    }
    this.root.visible = s.alive;
    this.ribbonBody.visible = this.layers.ribbon;
    this.ribbonGlow.visible = this.layers.ribbon && this.layers.glow;
    this.drops.visible = this.layers.droplets;
    this.ripples.visible = this.layers.ripples;
  }

  //공유 자원을 푼다
  dispose(): void {
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
    this.texture.dispose();
    this.root.removeFromParent();
  }
}
