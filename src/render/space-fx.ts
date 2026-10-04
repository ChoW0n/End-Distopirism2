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

//효과의 발 기준 로컬 좌표계로 바꾼 원근 카메라. 모든 길이는 캐릭터 키 H 단위다
export interface SpacePaintView {
  readonly eye: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

//원화 판 위 점. 인형과 같은 카메라 회전을 적용하므로 기울어진 교전 화면도 맞는다
export function paintPoint(view: SpacePaintView, x: number, y: number): Vec3 {
  return [view.right[0] * x + view.up[0] * y, view.right[1] * x + view.up[1] * y, view.right[2] * x + view.up[2] * y];
}

//원화 점을 통과하는 실제 원근 광선 위에서 깊이만 바꾼다. 같은 광선이라 화면 위치가 보존된다
export function placePaintPoint(view: SpacePaintView, point: Vec3, depth: number, lift?: number, floor = false): Vec3 {
  const eye = view.eye;
  const ray: Vec3 = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  let t = Math.abs(ray[2]) > 1e-8 ? 1 + depth / ray[2] : 1;
  if (lift !== undefined && (floor || eye[1] + ray[1] * t < lift) && Math.abs(ray[1]) > 1e-8) {
    const floorT = (lift - eye[1]) / ray[1];
    if (floorT > 0) t = floorT;
  }
  return [eye[0] + ray[0] * t, eye[1] + ray[1] * t, eye[2] + ray[2] * t];
}

//카메라 정면으로 잰 깊이. 인형 원화 판은 이 깊이가 같은 평면이다
export function paintDepth(view: SpacePaintView, point: Vec3): number {
  const r = view.right;
  const u = view.up;
  const normal: Vec3 = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
  return (view.eye[0] - point[0]) * normal[0] + (view.eye[1] - point[1]) * normal[1] + (view.eye[2] - point[2]) * normal[2];
}

//원본 합성에서 앞에 있던 적 판 뒤로 곡면 전체를 물린다. 깊이 차와 화면 자리를 함께 보존한다
//발보다 아래인 광선은 지면에서 멈춘다. 적 실루엣과 겹치는 몸 높이의 점은 적 판 뒤에 남는다
export function placeGridBehind(view: SpacePaintView, positions: Float32Array, minimumDepth: number, lift: number): void {
  let nearest = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    nearest = Math.min(nearest, paintDepth(view, [positions[i] as number, positions[i + 1] as number, positions[i + 2] as number]));
  }
  const shift = Math.max(0, minimumDepth - nearest);
  if (shift === 0) return;
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i] as number, positions[i + 1] as number, positions[i + 2] as number];
    const depth = paintDepth(view, p);
    if (depth <= 0) continue;
    let t = 1 + shift / depth;
    const ray: Vec3 = [p[0] - view.eye[0], p[1] - view.eye[1], p[2] - view.eye[2]];
    if (view.eye[1] + ray[1] * t < lift && ray[1] < 0) t = (lift - view.eye[1]) / ray[1];
    positions[i] = view.eye[0] + ray[0] * t;
    positions[i + 1] = view.eye[1] + ray[1] * t;
    positions[i + 2] = view.eye[2] + ray[2] * t;
  }
}

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

//깊이는 몸 판에서 떨어진 양이다. 바닥 보정도 같은 광선에서 하므로 원화와 어긋나지 않는다
export function placeOnSurface(s: SpaceFxSurface, x: number, y: number, view: SpacePaintView, lift: number, base: readonly [number, number] = [0, 0]): Vec3 {
  return placePaintPoint(view, paintPoint(view, x + base[0], y + base[1]), surfaceDepth(s, x, y), lift, s.mode === 'floor');
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
  view: SpacePaintView,
  lift: number,
  grid: readonly [number, number],
  base: readonly [number, number] = [0, 0],
  flat = false,
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
      const [wx, wy, wz] = flat ? paintPoint(view, X + base[0], Y + base[1]) : placeOnSurface(surface, X, Y, view, lift, base);
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
