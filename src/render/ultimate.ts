//캐릭터 궁극기 연출 시간표 ultimate.json 을 읽는다 (SPEC-005 §10.2)
//렌더러를 모른다. 웹 3D 무대와 유니티가 같은 시간표를 읽는다. 파일은 읽지 않고 검증만 한다

//한 방이 시작된 뒤 각 사건의 시각(초, 실제 시간)
export interface UltimateTimeline {
  poolIn: number;
  swapEnvironment: number;
  cutsceneStart: number;
  cutLine: number;
  cutsceneEnd: number;
  appearBehind: number;
  sheathClick: number;
  water: number;
  effectsEnd: number;
  restoreEnvironment: number;
  restoreFade: number;
  end: number;
}

//컷신 한 장면. 전경 확대와 화면을 가르는 선
export interface UltimateCutscene {
  foreground: string;
  line: string;
  size: { width: number; height: number };
  zoomFrom: number;
  zoomTo: number;
  //선이 지나가는 화면 높이 (0~1)
  lineY: number;
  //선을 긋는 시간(초)
  lineWipe: number;
  //컷신이 나타나고 걷히는 시간(초)
  fade: number;
}

//여러 번 베기 (SPEC-005 §10.2 v2.11). 벤 횟수·간격과 베기선마다 기울기·자리
export interface UltimateSlashes {
  count: number;
  //베기 사이 간격(초)
  interval: number;
  //베기선마다 기울기(도). 횟수보다 짧으면 되풀이한다
  rollDeg: number[];
  //베기선마다 자리 (캐릭터 키 비율 x, y). 횟수보다 짧으면 되풀이한다
  offset: [number, number][];
  //중간 베기마다 맞은 쪽이 튕겨 가는 자리 (캐릭터 키 비율 [베인 방향, 위]). 누적하지 않는다. 횟수보다 짧으면 되풀이한다 (v2.22)
  jolt: [number, number][];
  //튕겨 가는 시간(초)
  joltTime: number;
}

export interface UltimateArt {
  character: string;
  //잠시 바꿀 전장 폴더 (assets/<environment>). 없으면 null
  environment: string | null;
  frames: { ready: string; open: string; closed: string };
  effects: { pool: string; slash: string; water: string };
  cutscene: UltimateCutscene;
  timeline: UltimateTimeline;
  slashes: UltimateSlashes;
  //적 뒤편에 나타날 때 적과 벌어지는 거리(월드)
  behindGap: number;
}

export class UltimateArtError extends Error {
  constructor(message: string) {
    super(`ultimate: ${message}`);
    this.name = 'UltimateArtError';
  }
}

type Json = Record<string, unknown>;

function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new UltimateArtError(`${path} 가 객체가 아니다`);
  return value as Json;
}

function num(source: Json, key: string, path: string): number {
  const v = source[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new UltimateArtError(`${path}.${key} 가 숫자가 아니다`);
  return v;
}

function str(source: Json, key: string, path: string): string {
  const v = source[key];
  if (typeof v !== 'string' || v.length === 0) throw new UltimateArtError(`${path}.${key} 가 문자열이 아니다`);
  return v;
}

//시간표 키 순서. 이 순서대로 시각이 늘어나야 한다
const ORDER: readonly (keyof UltimateTimeline)[] = ['swapEnvironment', 'cutsceneStart', 'cutLine', 'cutsceneEnd', 'sheathClick', 'water', 'effectsEnd', 'restoreEnvironment', 'end'];

//JSON.parse 결과를 검증된 시간표로 바꾼다
export function parseUltimateArt(raw: unknown): UltimateArt {
  const root = obj(raw, 'root');
  const frames = obj(root['frames'], 'frames');
  const effects = obj(root['effects'], 'effects');
  const cut = obj(root['cutscene'], 'cutscene');
  const size = cut['size'];
  if (!Array.isArray(size) || size.length !== 2 || size.some((v) => typeof v !== 'number')) throw new UltimateArtError('cutscene.size 가 숫자 2개가 아니다');
  const t = obj(root['timeline'], 'timeline');
  const keys: (keyof UltimateTimeline)[] = ['poolIn', 'swapEnvironment', 'cutsceneStart', 'cutLine', 'cutsceneEnd', 'appearBehind', 'sheathClick', 'water', 'effectsEnd', 'restoreEnvironment', 'restoreFade', 'end'];
  const timeline = Object.fromEntries(keys.map((k) => [k, num(t, k, 'timeline')])) as unknown as UltimateTimeline;

  //시각이 거꾸로 가면 await 순서가 꼬인다
  for (let i = 1; i < ORDER.length; i++) {
    const before = ORDER[i - 1] as keyof UltimateTimeline;
    const after = ORDER[i] as keyof UltimateTimeline;
    if (timeline[after] < timeline[before]) throw new UltimateArtError(`timeline.${after} 가 ${before} 보다 이르다`);
  }
  if (timeline.appearBehind < timeline.cutsceneEnd) throw new UltimateArtError('timeline.appearBehind 가 컷신이 걷히기 전이다');
  if (timeline.restoreEnvironment + timeline.restoreFade > timeline.end + 1e-9) throw new UltimateArtError('전장 복귀가 끝보다 늦다');

  const slashes = parseSlashes(root['slashes']);
  const environment = root['environment'];
  return {
    character: str(root, 'character', 'root'),
    environment: typeof environment === 'string' && environment.length > 0 ? environment : null,
    frames: { ready: str(frames, 'ready', 'frames'), open: str(frames, 'open', 'frames'), closed: str(frames, 'closed', 'frames') },
    effects: { pool: str(effects, 'pool', 'effects'), slash: str(effects, 'slash', 'effects'), water: str(effects, 'water', 'effects') },
    cutscene: {
      foreground: str(cut, 'foreground', 'cutscene'),
      line: str(cut, 'line', 'cutscene'),
      size: { width: size[0] as number, height: size[1] as number },
      zoomFrom: num(cut, 'zoomFrom', 'cutscene'),
      zoomTo: num(cut, 'zoomTo', 'cutscene'),
      lineY: num(cut, 'lineY', 'cutscene'),
      lineWipe: num(cut, 'lineWipe', 'cutscene'),
      fade: num(cut, 'fade', 'cutscene'),
    },
    timeline,
    slashes,
    behindGap: num(root, 'behindGap', 'root'),
  };
}

//여러 번 베기. 없으면 한 번 벤다
function parseSlashes(value: unknown): UltimateSlashes {
  if (value === undefined) return { count: 1, interval: 0, rollDeg: [0], offset: [[0, 0]], jolt: [[0, 0]], joltTime: 0.06 };
  const o = obj(value, 'slashes');
  const count = num(o, 'count', 'slashes');
  if (!Number.isInteger(count) || count < 1) throw new UltimateArtError('slashes.count 가 1 이상 정수가 아니다');
  const rollDeg = o['rollDeg'];
  const offset = o['offset'];
  const jolt = o['jolt'] ?? [[0, 0]];
  if (!Array.isArray(rollDeg) || rollDeg.length === 0 || rollDeg.some((v) => typeof v !== 'number')) throw new UltimateArtError('slashes.rollDeg 가 숫자 목록이 아니다');
  if (!Array.isArray(offset) || offset.length === 0 || offset.some((v) => !Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'number'))) {
    throw new UltimateArtError('slashes.offset 이 숫자 2개짜리 목록이 아니다');
  }
  if (!Array.isArray(jolt) || jolt.length === 0 || jolt.some((v) => !Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'number'))) {
    throw new UltimateArtError('slashes.jolt 가 숫자 2개짜리 목록이 아니다');
  }
  const joltTime = o['joltTime'] === undefined ? 0.06 : num(o, 'joltTime', 'slashes');
  if (!(joltTime > 0)) throw new UltimateArtError('slashes.joltTime 이 0 보다 커야 한다');
  return { count, interval: num(o, 'interval', 'slashes'), rollDeg: rollDeg as number[], offset: offset as [number, number][], jolt: jolt as [number, number][], joltTime };
}
