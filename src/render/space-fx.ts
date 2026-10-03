//카일 전 스킬 공간형 계산 (SPEC-005 §15.4). 렌더러와 무관한 순수 계산만 둔다
//효과 분리 장 한 장을 격자로 깔고, 꼭짓점마다 곡면 깊이를 주고, 게임 카메라에서 원화 자리와 겹치게 높이를 정한다

import type { Vec3 } from './space-slash.js';

//곡면 하나. curve 는 2차 곡면 깊이, floor 는 장 전체를 바닥에 눕힌다
export interface SpaceFxSurface {
  readonly mode: 'curve' | 'floor';
  readonly origin: readonly [number, number];
  readonly c: number;
  readonly kx: number;
  readonly ky: number;
  readonly kxx: number;
  readonly kyy: number;
  readonly kxy: number;
}

//효과 장 한 장. flat·body 는 몸이 있는 스킬(S2·S3)만 쓴다
export interface SpaceFxFrame {
  readonly fx: string;
  readonly ms: number;
  readonly surface: string;
  readonly flat?: string;
  readonly body?: string;
}

export type SpaceFxAnchor = 'kyleFoot' | 'enemyHit' | 'enemyFoot';

//같은 캔버스·같은 기준점으로 이어 넘기는 장 묶음
export interface SpaceFxTrack {
  readonly name: string;
  readonly anchor: SpaceFxAnchor;
  readonly canvas: readonly [number, number];
  readonly pivot: readonly [number, number];
  //긴 변이 캐릭터 키 × scale. null 이면 캐릭터 장과 같은 배율(캐릭터 키 px 로 나눈다)
  readonly scale: number | null;
  //그림이 있는 칸 [x0, y0, x1, y1] (캔버스 px). 격자는 이 안에만 깐다
  readonly crop: readonly [number, number, number, number];
  readonly delayMs: number;
  readonly frames: readonly SpaceFxFrame[];
}

export interface SpaceFxSkill {
  readonly id: string;
  readonly name: string;
  readonly scene: 'self' | 'ultimate';
  readonly ready: { readonly flat: string; readonly ms: number } | null;
  readonly kyleFrame?: string;
  readonly enemyFrame?: string;
  readonly behindGap?: number;
  readonly durationMs?: number;
  readonly tracks: readonly SpaceFxTrack[];
}

export interface SpaceFxConfig {
  readonly grid: readonly [number, number];
  readonly groundLift: number;
  readonly surfaces: Readonly<Record<string, SpaceFxSurface>>;
  readonly skills: readonly SpaceFxSkill[];
}

export class SpaceFxError extends Error {}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SpaceFxError(`${where} 는 수여야 한다`);
  return v;
}

function pair(v: unknown, where: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) throw new SpaceFxError(`${where} 는 [수, 수] 여야 한다`);
  return [num(v[0], where), num(v[1], where)];
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SpaceFxError(`${where} 는 객체여야 한다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new SpaceFxError(`${where} 는 글자여야 한다`);
  return v;
}

//space-fx.json 을 읽어 검사한다. 장이 가리키는 곡면이 없거나 시간이 0 이하이면 멈춘다
export function parseSpaceFx(raw: unknown): SpaceFxConfig {
  const root = obj(raw, 'space-fx');
  const surfaces: Record<string, SpaceFxSurface> = {};
  for (const [name, value] of Object.entries(obj(root['surfaces'], 'surfaces'))) {
    const s = obj(value, `surfaces.${name}`);
    if (s['mode'] === 'floor') {
      surfaces[name] = { mode: 'floor', origin: [0, 0], c: 0, kx: 0, ky: 0, kxx: 0, kyy: 0, kxy: 0 };
      continue;
    }
    const k = (key: string): number => num(s[key], `surfaces.${name}.${key}`);
    surfaces[name] = { mode: 'curve', origin: pair(s['origin'], `surfaces.${name}.origin`), c: k('c'), kx: k('kx'), ky: k('ky'), kxx: k('kxx'), kyy: k('kyy'), kxy: k('kxy') };
  }
  const anchors: readonly SpaceFxAnchor[] = ['kyleFoot', 'enemyHit', 'enemyFoot'];
  const skills = (root['skills'] as unknown[]).map((sv, si): SpaceFxSkill => {
    const s = obj(sv, `skills[${si}]`);
    const tracks = (s['tracks'] as unknown[]).map((tv, ti): SpaceFxTrack => {
      const t = obj(tv, `skills[${si}].tracks[${ti}]`);
      const where = `${String(s['id'])}.${String(t['name'])}`;
      const anchor = t['anchor'] as SpaceFxAnchor;
      if (!anchors.includes(anchor)) throw new SpaceFxError(`${where} 기준점이 이상하다: ${String(anchor)}`);
      const crop = t['crop'] as number[];
      if (!Array.isArray(crop) || crop.length !== 4) throw new SpaceFxError(`${where}.crop 은 네 수여야 한다`);
      const frames = (t['frames'] as unknown[]).map((fv, fi): SpaceFxFrame => {
        const f = obj(fv, `${where}.frames[${fi}]`);
        const surface = str(f['surface'], `${where}.frames[${fi}].surface`);
        if (!surfaces[surface]) throw new SpaceFxError(`${where} 의 ${fi + 1}장 곡면 ${surface} 가 없다`);
        const ms = num(f['ms'], `${where}.frames[${fi}].ms`);
        if (ms <= 0) throw new SpaceFxError(`${where} 의 ${fi + 1}장 시간이 0 이하다`);
        return {
          fx: str(f['fx'], `${where}.frames[${fi}].fx`),
          ms,
          surface,
          ...(typeof f['flat'] === 'string' ? { flat: f['flat'] } : {}),
          ...(typeof f['body'] === 'string' ? { body: f['body'] } : {}),
        };
      });
      return {
        name: str(t['name'], `${where}.name`),
        anchor,
        canvas: pair(t['canvas'], `${where}.canvas`),
        pivot: pair(t['pivot'], `${where}.pivot`),
        scale: t['scale'] === null ? null : num(t['scale'], `${where}.scale`),
        crop: [num(crop[0], where), num(crop[1], where), num(crop[2], where), num(crop[3], where)],
        delayMs: num(t['delayMs'], `${where}.delayMs`),
        frames,
      };
    });
    const ready = s['ready'] === null || s['ready'] === undefined ? null : obj(s['ready'], `${String(s['id'])}.ready`);
    return {
      id: str(s['id'], `skills[${si}].id`),
      name: str(s['name'], `skills[${si}].name`),
      scene: s['scene'] === 'ultimate' ? 'ultimate' : 'self',
      ready: ready ? { flat: str(ready['flat'], 'ready.flat'), ms: num(ready['ms'], 'ready.ms') } : null,
      ...(typeof s['kyleFrame'] === 'string' ? { kyleFrame: s['kyleFrame'] } : {}),
      ...(typeof s['enemyFrame'] === 'string' ? { enemyFrame: s['enemyFrame'] } : {}),
      ...(typeof s['behindGap'] === 'number' ? { behindGap: s['behindGap'] } : {}),
      ...(typeof s['durationMs'] === 'number' ? { durationMs: s['durationMs'] } : {}),
      tracks,
    };
  });
  const grid = pair(root['grid'], 'grid');
  return { grid: [Math.max(2, Math.round(grid[0])), Math.max(2, Math.round(grid[1]))], groundLift: num(root['groundLift'], 'groundLift'), surfaces, skills };
}

//곡면 깊이 z (H 단위, 카메라 쪽이 +). X, Y 는 기준점에서 H 단위, 위가 +
export function surfaceDepth(s: SpaceFxSurface, x: number, y: number): number {
  if (s.mode === 'floor') return 0;
  const dx = x - s.origin[0];
  const dy = y - s.origin[1];
  return s.c + s.kx * dx + s.ky * dy + s.kxx * dx * dx + s.kyy * dy * dy + s.kxy * dx * dy;
}

//원화 한 점을 공간에 놓는다. 게임 카메라(내려다보는 각 p)에서 화면 자리는 (X, Y) 그대로다
//바닥 밑으로 가면 z 를 카메라 쪽으로 늘려 바닥(lift)에 올린다. floor 는 늘 바닥에 눕힌다
//base 는 기준점이 발에서 떨어진 정도(H). 곡면 깊이는 기준점 기준 (x, y), 높이는 발 기준 (x + bx, y + by) 로 정한다
export function placeOnSurface(s: SpaceFxSurface, x: number, y: number, pitchDeg: number, lift: number, base: readonly [number, number] = [0, 0]): Vec3 {
  const a = (pitchDeg * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  const X = x + base[0];
  const Y = y + base[1];
  const floorZ = (lift * cos - Y) / sin;
  if (s.mode === 'floor') return [X, lift, floorZ];
  const z = surfaceDepth(s, x, y);
  const h = (Y + z * sin) / cos;
  if (h >= lift) return [X, h, z];
  return [X, lift, floorZ];
}

//캔버스 px 한 칸이 몇 H 인지. 캐릭터 장과 같은 배율이면 캐릭터 키 px 로 나눈다
export function hPerPixel(track: SpaceFxTrack, characterHeightPx: number): number {
  return track.scale === null ? 1 / characterHeightPx : track.scale / Math.max(track.canvas[0], track.canvas[1]);
}

//장 묶음 하나를 다 넘기는 시간 (지연 빼고)
export function trackDuration(track: SpaceFxTrack): number {
  return track.frames.reduce((sum, f) => sum + f.ms, 0);
}

//t(ms, 스킬 시작 기준)에 보일 장 번호. 시작 전·끝난 뒤는 -1
export function trackFrameAt(track: SpaceFxTrack, tMs: number): number {
  let t = tMs - track.delayMs;
  if (t < 0) return -1;
  for (let i = 0; i < track.frames.length; i++) {
    const f = track.frames[i] as SpaceFxFrame;
    if (t < f.ms) return i;
    t -= f.ms;
  }
  return -1;
}

//스킬 하나 전체 시간 (준비 장 + 가장 늦게 끝나는 묶음). durationMs 가 있으면 그것과 큰 쪽
export function skillDuration(skill: SpaceFxSkill): number {
  const tracks = Math.max(0, ...skill.tracks.map((t) => t.delayMs + trackDuration(t)));
  return (skill.ready?.ms ?? 0) + Math.max(tracks, skill.durationMs ?? 0);
}

//격자 꼭짓점 (공간 좌표, 기준점 기준 H 단위)과 텍스처 좌표. 텍스처는 crop 칸만 잘라 올린 것이다
export function surfaceGrid(
  track: SpaceFxTrack,
  surface: SpaceFxSurface,
  hPerPx: number,
  pitchDeg: number,
  lift: number,
  grid: readonly [number, number],
  base: readonly [number, number] = [0, 0],
): { positions: Float32Array; uvs: Float32Array; indices: number[] } {
  const [gx, gy] = grid;
  const [x0, y0, x1, y1] = track.crop;
  const positions = new Float32Array((gx + 1) * (gy + 1) * 3);
  const uvs = new Float32Array((gx + 1) * (gy + 1) * 2);
  let p = 0;
  let q = 0;
  for (let j = 0; j <= gy; j++) {
    for (let i = 0; i <= gx; i++) {
      const px = x0 + ((x1 - x0) * i) / gx;
      const py = y0 + ((y1 - y0) * j) / gy;
      const X = (px - track.pivot[0]) * hPerPx;
      const Y = (track.pivot[1] - py) * hPerPx;
      const [wx, wy, wz] = placeOnSurface(surface, X, Y, pitchDeg, lift, base);
      positions[p++] = wx;
      positions[p++] = wy;
      positions[p++] = wz;
      uvs[q++] = i / gx;
      uvs[q++] = 1 - j / gy;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const a = j * (gx + 1) + i;
      const b = a + 1;
      const c = a + gx + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, uvs, indices };
}
