//물금 공간형 VFX 계산 (SPEC-005 §15.3·§15.3.1). 렌더러를 모른다
//칼끝이 몸 둘레를 돌며 올려 베는 3D 궤적을 세운다: 위에서 본 깊이 z(u) 로 뒤 → 옆 → 앞을 감고,
//높이는 게임 카메라(내려다보는 각 p)에서 원화 호에 겹치게 정한다. 단면은 휘두름 면 안쪽을 위로 세운 물 벽이다
//깊이별 물방울·지면 물결 출처도 여기서 정하고, 시각마다 보이는지·어디 있는지를 셰이더와 같은 식으로 계산한다
//길이는 캐릭터 키 H 배수(발 기준, x 오른쪽 · y 월드 위 · z 카메라 쪽 수평), 시간은 게임 ms

import { arcLengthPoints, seeded, slashSample, tableAt, type RibbonSlashConfig, type Vec2 } from './ribbon-slash.js';

export type Vec3 = readonly [number, number, number];

//깊이 층 하나 (far 몸 뒤 · mid 띠 근처 · near 카메라 쪽)
export interface SpaceDropLayer {
  name: string;
  count: number;
  //이 층의 깊이 범위 (H). relative 면 띠 중심 깊이에 더한다
  depthH: Vec2;
  relative: boolean;
  sizeH: Vec2;
  //1 이면 원래 색, 낮을수록 짙은 남 쪽으로
  dim: number;
  //테 번짐 0~1. 가까울수록 크다
  soft: number;
}

//realtime-vfx.json 의 space 모양
export interface SpaceSlashConfig {
  //[u, 깊이 H] 표. 위에서 본 궤적: 꼬리 음수(몸 뒤) → 앞 최대 → 머리
  depthH: readonly Vec2[];
  //[u, 도] 표. 휘두름 면 안쪽 방향을 월드 위로 세우는 각 (물 벽이 서 보이게)
  liftDeg: readonly Vec2[];
  //안쪽 물결 끝이 띠 면 위쪽 법선으로 말리는 양 (H, 안쪽 끝에서)
  curlH: number;
  //단면 줄 수 (휜 단면을 몇 줄로 나눌지)
  crossRows: number;
  //몸 가림 판이 깊이를 쓰는 알파 문턱
  occluderAlphaCut: number;
  //타 앞 준비 장 시간 (ms)
  preRollMs: number;
  droplets: {
    seed: number;
    layers: readonly SpaceDropLayer[];
    //호에서 떨어진 거리 범위 (H)
    offsetH: Vec2;
    lagU: Vec2;
    //초당 흩어지는 거리 범위 (H)
    driftH: Vec2;
    //초당² 떨어지는 양 (H)
    gravityH: number;
  };
  ripples: {
    //호에서 고르는 출처 수 (발 자리 하나는 따로)
    count: number;
    //궤적이 가장 낮은 곳에서 이만큼 높은 데까지의 구간에서 고른다 (H)
    groundReachH: number;
    footRipple: boolean;
    //고리 퍼지는 속도 (H/초)
    speedH: number;
    lifeMs: number;
    rings: number;
    ringGapH: number;
    ringWidthH: number;
    opacity: number;
    //출처 u 에 더해 늦게 꺼지는 양
    lagU: number;
  };
  //시험 장면 자리 (월드 x). 카일·자리 표시 적. closeIn 은 근접 카메라가 카일 가슴 쪽으로 다가가는 비율
  lab: { allyX: number; enemyX: number; closeIn: number };
}

//띠 중심선 한 점. p 위치(H), tangent 진행 방향, cross 단면 바깥 방향(단위, 물결 몸통 반대쪽), normal 띠 면 위쪽 법선. 모두 3D
export interface SpacePoint {
  u: number;
  p: Vec3;
  tangent: Vec3;
  cross: Vec3;
  normal: Vec3;
}

//깊이 물방울 하나. 시각 0 의 자리·흩어지는 방향·크기·소멸 지연
export interface SpaceDroplet {
  layer: number;
  u: number;
  pos: Vec3;
  dir: Vec3;
  sizeH: number;
  lagU: number;
  driftH: number;
  dim: number;
  soft: number;
}

//지면 물결 출처. 바닥 위 (x, z) H, 고리가 시작하는 시각, 꺼짐 기준 u
export interface RippleSource {
  x: number;
  z: number;
  u: number;
  startMs: number;
}

export class SpaceConfigError extends Error {}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function isTable(t: unknown): t is Vec2[] {
  return Array.isArray(t) && t.length >= 2 && t.every((p, i) => Array.isArray(p) && p.length === 2 && (i === 0 || (p[0] as number) > ((t[i - 1] as Vec2)[0] as number)));
}

//설정 읽기. 규격이 틀리면 던진다
export function parseSpaceConfig(raw: unknown): SpaceSlashConfig {
  const root = raw as { space?: SpaceSlashConfig } | null;
  const c = root?.space;
  if (!c || typeof c !== 'object') throw new SpaceConfigError('realtime-vfx.json 에 space 가 없다');
  if (!isTable(c.depthH) || !isTable(c.liftDeg)) throw new SpaceConfigError('space.depthH·liftDeg 는 u 가 커지는 [u, 값] 표');
  if (!(c.crossRows >= 2)) throw new SpaceConfigError('space.crossRows 는 2 이상');
  if (!(c.occluderAlphaCut > 0 && c.occluderAlphaCut < 1)) throw new SpaceConfigError('space.occluderAlphaCut 는 0~1 사이');
  if (!Array.isArray(c.droplets?.layers) || c.droplets.layers.length === 0) throw new SpaceConfigError('space.droplets.layers 가 없다');
  if (!(c.ripples?.speedH > 0) || !(c.ripples.lifeMs > 0) || !(c.ripples.rings >= 1)) throw new SpaceConfigError('space.ripples 의 speedH·lifeMs·rings 가 틀렸다');
  return c;
}

//u 자리 띠 중심 깊이 (H)
export function depthAt(space: SpaceSlashConfig, u: number): number {
  return tableAt(space.depthH, u);
}

//게임 카메라가 내려다보는 각 (도). 배경 기준 카메라 자리에서 계산한다
export function viewPitchDeg(camera: { back: number; height: number; lookAtHeight: number }): number {
  return (Math.atan2(camera.height - camera.lookAtHeight, camera.back) * 180) / Math.PI;
}

//3D 점이 게임 카메라에서 원화 판 위 어디에 겹쳐 보이는지 (평행 투영 근사). x 그대로, y 는 카메라 위 방향 성분
export function screenOf(p: Vec3, pitchDeg: number): [number, number] {
  const a = (pitchDeg * Math.PI) / 180;
  return [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a)];
}

//휘두름 면 법선 (뉴웰 방법). 위쪽을 향하게 맞춘다
export function swingNormal(points: readonly Vec3[]): Vec3 {
  let n: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Vec3;
    const b = points[(i + 1) % points.length] as Vec3;
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  const u = norm3(n);
  return u[1] < 0 ? [-u[0], -u[1], -u[2]] : u;
}

//띠 중심선 (§15.3.1). 원화 호 길이 등간격 점마다 깊이 z(u) 를 붙이고, 게임 카메라에서 원화 호에 겹치게 높이를 정한다
//단면 안쪽 = 휘두름 면 안에서 진행 방향에 직각, 원화의 안쪽(물결 몸통)과 같은 쪽. 그것을 월드 위로 liftDeg 만큼 세운다
export function spacePath(config: RibbonSlashConfig, space: SpaceSlashConfig, segments: number, pitchDeg: number): SpacePoint[] {
  const a = (pitchDeg * Math.PI) / 180;
  const flat = arcLengthPoints(config.path.points, segments);
  const centers: Vec3[] = flat.map((pt) => {
    const z = depthAt(space, pt.u);
    return [pt.p[0], (pt.p[1] + z * Math.sin(a)) / Math.cos(a), z];
  });
  const n = swingNormal(centers);
  const up: Vec3 = [0, 1, 0];
  return flat.map((pt, i) => {
    const prev = centers[Math.max(0, i - 1)] as Vec3;
    const next = centers[Math.min(centers.length - 1, i + 1)] as Vec3;
    const tangent = norm3(sub(next, prev));
    //휘두름 면 안의 진행 직각 방향. 원화 안쪽(왼쪽 법선의 반대)과 화면에서 같은 쪽이 되게 부호를 고른다
    let inward = norm3(cross3(n, tangent));
    const seen = screenOf(inward, pitchDeg);
    if (seen[0] * pt.tangent[1] - seen[1] * pt.tangent[0] < 0) inward = [-inward[0], -inward[1], -inward[2]];
    //위로 세운다. 진행 방향과 직교하게 다듬는다
    const lift = (tableAt(space.liftDeg, pt.u) * Math.PI) / 180;
    let w: Vec3 = [inward[0] * Math.cos(lift) + up[0] * Math.sin(lift), inward[1] * Math.cos(lift) + up[1] * Math.sin(lift), inward[2] * Math.cos(lift) + up[2] * Math.sin(lift)];
    const k = dot3(w, tangent);
    w = norm3([w[0] - tangent[0] * k, w[1] - tangent[1] * k, w[2] - tangent[2] * k]);
    const cross: Vec3 = [-w[0], -w[1], -w[2]];
    let normal = norm3(cross3(tangent, w));
    if (normal[1] < 0) normal = [-normal[0], -normal[1], -normal[2]];
    return { u: pt.u, p: centers[i] as Vec3, tangent, cross, normal };
  });
}

//단면 위 한 점. d 는 호에서 거리(H, + 바깥 · − 안쪽). 안쪽은 끝으로 갈수록 띠 면 위쪽 법선으로 말린다
//innerMax 는 안쪽 끝 거리(양수, 텍스처 아래 끝)
export function crossPoint(space: SpaceSlashConfig, pt: SpacePoint, d: number, innerMax: number): Vec3 {
  const t = d < 0 ? Math.min(1, -d / Math.max(1e-6, innerMax)) : 0;
  const curl = space.curlH * t * t;
  return [
    pt.p[0] + pt.cross[0] * d + pt.normal[0] * curl,
    pt.p[1] + pt.cross[1] * d + pt.normal[1] * curl,
    pt.p[2] + pt.cross[2] * d + pt.normal[2] * curl,
  ];
}

//깊이 물방울 자리. 층마다 씨앗 고정. u 는 칼끝 쪽에 몰리고, 바깥(호 볼록한 쪽)으로 떨어진다
export function spaceDroplets(config: RibbonSlashConfig, space: SpaceSlashConfig, pitchDeg: number): SpaceDroplet[] {
  const d = space.droplets;
  const rand = seeded(d.seed);
  const dense = spacePath(config, space, 256, pitchDeg);
  const lerp = (r: Vec2, t: number): number => r[0] + (r[1] - r[0]) * t;
  const out: SpaceDroplet[] = [];
  d.layers.forEach((layer, li) => {
    for (let i = 0; i < layer.count; i++) {
      const u = 0.04 + 0.96 * Math.sqrt(rand());
      const pt = dense[Math.round(u * (dense.length - 1))] as SpacePoint;
      //바깥 쪽 거리 (호 가까이 몰림), 칼끝 쪽일수록 멀리
      const off = lerp(d.offsetH, rand() * rand()) * (0.5 + 0.5 * u);
      const side = rand() < 0.75 ? 1 : -0.6;
      const z = lerp(layer.depthH, rand());
      const pos: Vec3 = [
        pt.p[0] + pt.cross[0] * off * side,
        Math.max(0, pt.p[1] + pt.cross[1] * off * side),
        (layer.relative ? pt.p[2] : 0) + z,
      ];
      //바깥 + 진행 반대쪽 조금 + 위로 조금
      const back = 0.3 * (rand() - 0.5);
      const dir = norm3([pt.cross[0] * side - pt.tangent[0] * back, pt.cross[1] * side - pt.tangent[1] * back + 0.25, (rand() - 0.5) * 0.6]);
      out.push({ layer: li, u, pos, dir, sizeH: lerp(layer.sizeH, rand()), lagU: lerp(d.lagU, rand()), driftH: lerp(d.driftH, rand()), dim: layer.dim, soft: layer.soft });
    }
  });
  return out;
}

//물방울 투명도 (0~1). 머리가 u 를 지나면 켜지고, 꼬리가 u + lag 를 넘으면 꺼진다. 끝 무렵 짧게 흐려진다 (셰이더와 같은 식)
export function spaceDropletAlpha(config: RibbonSlashConfig, drop: SpaceDroplet, ageMs: number): number {
  const s = slashSample(config, ageMs);
  if (!s.alive || drop.u > s.head) return 0;
  return clamp01((drop.u + drop.lagU - s.tail) / 0.025);
}

//물방울 자리 (H). 켜진 뒤 흐른 시간만큼 흩어지고 떨어진다. 바닥 밑으로는 안 간다 (셰이더와 같은 식)
export function spaceDropletPos(config: RibbonSlashConfig, space: SpaceSlashConfig, drop: SpaceDroplet, ageMs: number): Vec3 {
  const born = config.timingMs.reveal * drop.u;
  const t = Math.max(0, ageMs - born) / 1000;
  const g = 0.5 * space.droplets.gravityH * t * t;
  return [drop.pos[0] + drop.dir[0] * drop.driftH * t, Math.max(drop.sizeH * 0.5, drop.pos[1] + drop.dir[1] * drop.driftH * t - g), drop.pos[2] + drop.dir[2] * drop.driftH * t];
}

//지면 물결 출처. 궤적이 가장 낮은 곳에서 groundReachH 안쪽 구간에서 count 곳을 고르게, 발 자리 하나를 더한다
//시작 시각은 머리가 그 u 를 지나는 때 (전개 시간 × u)
export function rippleSources(config: RibbonSlashConfig, space: SpaceSlashConfig, pitchDeg: number): RippleSource[] {
  const r = space.ripples;
  const path = spacePath(config, space, 256, pitchDeg);
  const lowest = Math.min(...path.map((pt) => pt.p[1]));
  const near = path.filter((pt) => pt.p[1] <= lowest + r.groundReachH);
  const out: RippleSource[] = [];
  if (near.length > 0 && r.count > 0) {
    const u0 = (near[0] as SpacePoint).u;
    const u1 = (near[near.length - 1] as SpacePoint).u;
    for (let i = 0; i < r.count; i++) {
      const u = r.count === 1 ? (u0 + u1) / 2 : u0 + ((u1 - u0) * i) / (r.count - 1);
      const pt = path[Math.round(u * (path.length - 1))] as SpacePoint;
      out.push({ x: pt.p[0], z: pt.p[2], u, startMs: config.timingMs.reveal * u });
    }
  }
  if (r.footRipple) {
    //발 자리: 호가 몸 가운데(x=0)를 지나는 u
    let best = path[0] as SpacePoint;
    for (const pt of path) if (Math.abs(pt.p[0]) < Math.abs(best.p[0])) best = pt;
    out.push({ x: 0, z: 0, u: best.u, startMs: config.timingMs.reveal * best.u });
  }
  return out;
}

//물결 고리 k 의 반지름 (H)과 세기 (0~1). 아직 안 시작했거나 꺼졌으면 세기 0 (셰이더와 같은 식)
export function rippleRing(config: RibbonSlashConfig, space: SpaceSlashConfig, src: RippleSource, k: number, ageMs: number): { radiusH: number; strength: number } {
  const r = space.ripples;
  const s = slashSample(config, ageMs);
  const t = ageMs - src.startMs;
  const radiusH = Math.max(0, (r.speedH * t) / 1000 - k * r.ringGapH);
  if (!s.alive || t < 0 || radiusH <= 0) return { radiusH, strength: 0 };
  const life = clamp01(1 - t / r.lifeMs);
  const keep = clamp01((src.u + r.lagU - s.tail) / 0.03);
  return { radiusH, strength: life * keep * (1 - k / (r.rings + 1)) };
}
