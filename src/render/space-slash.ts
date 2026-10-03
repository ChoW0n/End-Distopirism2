//물금 공간형 VFX 계산 (SPEC-005 §15.3). 렌더러를 모른다
//§15.1 화면 평면 경로(x·y)에 깊이 z(u)를 더해 띠를 캐릭터 뒤 → 옆 → 앞으로 감는다.
//깊이별 물방울·지면 물결 출처도 여기서 정하고, 시각마다 보이는지·어디 있는지를 셰이더와 같은 식으로 계산한다
//길이는 캐릭터 키 H 배수(발 기준, x 오른쪽 · y 위 · z 카메라 쪽), 시간은 게임 ms

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
  //[u, 깊이 H] 표. 꼬리 음수(몸 뒤) → 머리 양수(몸 앞)
  depthH: readonly Vec2[];
  //[u, 도] 표. 단면을 진행 축으로 기울이는 각
  bankDeg: readonly Vec2[];
  //안쪽 물결이 카메라 쪽으로 말리는 양 (H, 안쪽 끝에서)
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
    //호가 바닥에 이보다 가까운 구간에서 고른다 (H)
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

//띠 중심선 한 점. p 위치(H), tangent 진행 방향, cross 단면 바깥 방향(단위), 모두 3D
export interface SpacePoint {
  u: number;
  p: Vec3;
  tangent: Vec3;
  cross: Vec3;
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
  if (!isTable(c.depthH) || !isTable(c.bankDeg)) throw new SpaceConfigError('space.depthH·bankDeg 는 u 가 커지는 [u, 값] 표');
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

//띠 중심선. §15.1 호 길이 등간격 점에 깊이를 붙이고, 3D 진행 방향과 단면 방향(바깥 법선을 진행 축으로 bank 만큼 돌린 것)을 구한다
export function spacePath(config: RibbonSlashConfig, space: SpaceSlashConfig, segments: number): SpacePoint[] {
  const flat = arcLengthPoints(config.path.points, segments);
  const centers: Vec3[] = flat.map((pt) => [pt.p[0], pt.p[1], depthAt(space, pt.u)]);
  return flat.map((pt, i) => {
    const prev = centers[Math.max(0, i - 1)] as Vec3;
    const next = centers[Math.min(centers.length - 1, i + 1)] as Vec3;
    const tangent = norm3(sub(next, prev));
    //화면 평면 바깥 법선 (진행 방향 왼쪽). 3D 진행 방향에 직교하게 다듬는다
    const n0: Vec3 = [-pt.tangent[1], pt.tangent[0], 0];
    const k = dot3(n0, tangent);
    const n = norm3([n0[0] - tangent[0] * k, n0[1] - tangent[1] * k, n0[2] - tangent[2] * k]);
    const b = cross3(tangent, n);
    const a = (tableAt(space.bankDeg, pt.u) * Math.PI) / 180;
    const cross = norm3([n[0] * Math.cos(a) + b[0] * Math.sin(a), n[1] * Math.cos(a) + b[1] * Math.sin(a), n[2] * Math.cos(a) + b[2] * Math.sin(a)]);
    return { u: pt.u, p: centers[i] as Vec3, tangent, cross };
  });
}

//단면 위 한 점. d 는 호에서 거리(H, + 바깥 · − 안쪽). 안쪽은 끝으로 갈수록 카메라 쪽(z+)으로 말린다
//innerMax 는 안쪽 끝 거리(양수, 텍스처 아래 끝)
export function crossPoint(space: SpaceSlashConfig, pt: SpacePoint, d: number, innerMax: number): Vec3 {
  const t = d < 0 ? Math.min(1, -d / Math.max(1e-6, innerMax)) : 0;
  const curl = space.curlH * t * t;
  return [pt.p[0] + pt.cross[0] * d, pt.p[1] + pt.cross[1] * d, pt.p[2] + pt.cross[2] * d + curl];
}

//깊이 물방울 자리. 층마다 씨앗 고정. u 는 칼끝 쪽에 몰리고, 바깥(호 볼록한 쪽)으로 떨어진다
export function spaceDroplets(config: RibbonSlashConfig, space: SpaceSlashConfig): SpaceDroplet[] {
  const d = space.droplets;
  const rand = seeded(d.seed);
  const dense = spacePath(config, space, 256);
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

//지면 물결 출처. 호가 바닥에 groundReachH 보다 가까운 구간에서 count 곳을 고르게, 발 자리 하나를 더한다
//시작 시각은 머리가 그 u 를 지나는 때 (전개 시간 × u)
export function rippleSources(config: RibbonSlashConfig, space: SpaceSlashConfig): RippleSource[] {
  const r = space.ripples;
  const path = spacePath(config, space, 256);
  const near = path.filter((pt) => pt.p[1] <= r.groundReachH);
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
