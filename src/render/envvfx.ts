//공용 환경 이펙트 v1 (SPEC-005 §16). 납품 manifest·camera-presets 와 우리 bindings 를 읽는다
//렌더러를 모른다. 웹 3D 무대와 유니티가 같은 데이터를 읽는다. 파일은 읽지 않고 검증만 한다

//스프라이트 한 장. 좌표는 좌상단 원점 픽셀
export interface EnvSprite {
  id: string;
  //아틀라스 파일 (env-vfx 폴더 기준)
  atlas: string;
  //아틀라스 안 자리 [x, y, 폭, 높이]
  rect: [number, number, number, number];
  //캔버스 크기 (512)
  canvas: [number, number];
  //캔버스 안 발생 지점
  pivot: [number, number];
  //multiply_rgb: 맵 색을 곱한다. alpha_silhouette: 색을 바꾸고 알파만 쓴다 (균열)
  tint: 'multiply_rgb' | 'alpha_silhouette';
  //screen_edge_only: 화면 가장자리 가림 전용 (H_03)
  usage: string;
}

//4장 애니메이션 (D·E·F)
export interface EnvAnimation {
  id: string;
  frames: string[];
  durations: number[];
  //마지막 장을 붙잡은 뒤 흐려지는 시간(ms)
  fadeLast: number;
}

//카메라 프리셋. 화면 높이 비율·ms
export interface EnvCameraPreset {
  amplitude: number;
  duration: number;
  zoom: number;
}

//사건 하나에서 낼 이펙트 한 개
export interface EnvSpawn {
  //애니메이션 id 또는 스프라이트 id
  play: string;
  //foot: 발밑 · floor: 발밑 바닥에 눕힘 · chest: 몸 가운데 · contact: 맞닿은 자리
  anchor: 'foot' | 'floor' | 'chest' | 'contact';
  //캐릭터 키 비율 [앞쪽, 위쪽]. 앞쪽은 face 방향 기준
  offset: [number, number];
  //512 캔버스 한 변 = 캐릭터 키 × scale
  scale: number;
  //toward: 힘 방향을 본다 · away: 반대
  face: 'toward' | 'away';
  //한 장짜리의 붙잡는 시간·흐려지는 시간(ms). 애니메이션은 manifest 를 따른다
  hold: number;
  fade: number;
}

export interface EnvBinding {
  surfaces: string[];
  camera: string;
  //크게 맞았을 때 쓰는 카메라 (없으면 camera)
  heavyCamera: string | null;
  spawns: EnvSpawn[];
}

export interface EnvVfx {
  sprites: Map<string, EnvSprite>;
  animations: Map<string, EnvAnimation>;
  camera: { cap: number; presets: Map<string, EnvCameraPreset> };
  events: Map<string, EnvBinding>;
}

export class EnvVfxError extends Error {
  constructor(message: string) {
    super(`env-vfx: ${message}`);
    this.name = 'EnvVfxError';
  }
}

type Json = Record<string, unknown>;

function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new EnvVfxError(`${path} 가 객체가 아니다`);
  return value as Json;
}

function nums(value: unknown, n: number, path: string): number[] {
  if (!Array.isArray(value) || value.length !== n || value.some((v) => typeof v !== 'number')) throw new EnvVfxError(`${path} 가 숫자 ${n}개가 아니다`);
  return value as number[];
}

//납품 manifest.json · camera-presets.json 과 우리 bindings.json 을 묶어 검증한다. 바인딩이 없는 그림을 가리키면 멈춘다
export function parseEnvVfx(manifestRaw: unknown, cameraRaw: unknown, bindingsRaw: unknown): EnvVfx {
  const manifest = obj(manifestRaw, 'manifest');
  const sprites = new Map<string, EnvSprite>();
  for (const [i, raw] of ((manifest['sprites'] as unknown[]) ?? []).entries()) {
    const s = obj(raw, `sprites[${i}]`);
    const id = String(s['id']);
    const tint = s['tint_mode'] === 'alpha_silhouette' ? 'alpha_silhouette' : 'multiply_rgb';
    sprites.set(id, {
      id,
      atlas: String(s['atlas']),
      rect: nums(s['atlas_rect_xywh'], 4, `${id}.atlas_rect_xywh`) as [number, number, number, number],
      canvas: nums(s['canvas'], 2, `${id}.canvas`) as [number, number],
      pivot: nums(s['pivot_top_left_px'], 2, `${id}.pivot_top_left_px`) as [number, number],
      tint,
      usage: String(s['usage'] ?? 'general'),
    });
  }
  const animations = new Map<string, EnvAnimation>();
  for (const [i, raw] of ((manifest['animations'] as unknown[]) ?? []).entries()) {
    const a = obj(raw, `animations[${i}]`);
    const frames = a['frames'];
    const durations = a['durations_ms'];
    if (!Array.isArray(frames) || !Array.isArray(durations) || frames.length !== durations.length) throw new EnvVfxError(`animations[${i}] 장 수와 시간 수가 다르다`);
    for (const f of frames) if (!sprites.has(String(f))) throw new EnvVfxError(`animations[${i}] 의 ${String(f)} 장이 없다`);
    animations.set(String(a['id']), { id: String(a['id']), frames: frames.map(String), durations: durations.map(Number), fadeLast: Number(a['fade_last_ms'] ?? 0) });
  }

  const cam = obj(cameraRaw, 'camera-presets');
  const presets = new Map<string, EnvCameraPreset>();
  for (const [name, raw] of Object.entries(obj(cam['presets'], 'camera-presets.presets'))) {
    const p = obj(raw, `presets.${name}`);
    presets.set(name, { amplitude: Number(p['amplitude_height_ratio'] ?? 0), duration: Number(p['duration_ms'] ?? 0), zoom: Number(p['zoom_delta'] ?? 0) });
  }
  const cap = Number(cam['amplitude_cap_height_ratio'] ?? 0.008);

  const events = new Map<string, EnvBinding>();
  for (const [name, raw] of Object.entries(obj(obj(bindingsRaw, 'bindings')['events'], 'bindings.events'))) {
    const b = obj(raw, `events.${name}`);
    const camera = String(b['camera'] ?? 'none');
    const heavyCamera = b['heavyCamera'] === undefined ? null : String(b['heavyCamera']);
    for (const c of [camera, heavyCamera]) if (c !== null && !presets.has(c)) throw new EnvVfxError(`events.${name} 의 카메라 ${c} 가 없다`);
    const spawns = ((b['spawns'] as unknown[]) ?? []).map((sr, j): EnvSpawn => {
      const sp = obj(sr, `events.${name}.spawns[${j}]`);
      const play = String(sp['play']);
      if (!animations.has(play) && !sprites.has(play)) throw new EnvVfxError(`events.${name} 의 ${play} 가 manifest 에 없다`);
      const anchor = String(sp['anchor']);
      if (!['foot', 'floor', 'chest', 'contact'].includes(anchor)) throw new EnvVfxError(`events.${name}.anchor ${anchor} 를 모른다`);
      return {
        play,
        anchor: anchor as EnvSpawn['anchor'],
        offset: nums(sp['offset'] ?? [0, 0], 2, `events.${name}.offset`) as [number, number],
        scale: Number(sp['scale'] ?? 1),
        face: sp['face'] === 'away' ? 'away' : 'toward',
        hold: Number(sp['hold'] ?? 0),
        fade: Number(sp['fade'] ?? 0),
      };
    });
    const surfaces = b['surfaces'];
    if (!Array.isArray(surfaces)) throw new EnvVfxError(`events.${name}.surfaces 가 목록이 아니다`);
    events.set(name, { surfaces: surfaces.map(String), camera, heavyCamera, spawns });
  }
  return { sprites, animations, camera: { cap, presets }, events };
}

//바인딩이 쓰는 아틀라스 파일만 (안 쓰는 계열은 받지 않는다)
export function usedAtlases(vfx: EnvVfx): string[] {
  const out = new Set<string>();
  for (const b of vfx.events.values()) {
    for (const sp of b.spawns) {
      const ids = vfx.animations.get(sp.play)?.frames ?? [sp.play];
      for (const id of ids) {
        const s = vfx.sprites.get(id);
        if (s) out.add(s.atlas);
      }
    }
  }
  return [...out].sort();
}
