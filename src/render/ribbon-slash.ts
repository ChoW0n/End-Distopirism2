//물금 실시간 VFX 계산 (SPEC-005 §15.1). 렌더러를 모른다
//베지어 경로를 호 길이로 등간격 샘플해 u(0 = 먼저 지나간 꼬리, 1 = 마지막 진행 끝)를 매기고,
//시각에 따라 보이는 구간 [tail, head] 를 정한다. 웹은 셰이더 uniform 으로, 유니티는 머티리얼 값으로 넘긴다

export type Vec2 = readonly [number, number];

//assets/kyle/realtime-vfx.json 모양
export interface RibbonSlashConfig {
  id: string;
  enabledInNormalPlay: boolean;
  bodyIntegration: string;
  timeDomain: 'game' | 'real';
  timingMs: { reveal: number; hold: number; erase: number; bodyAfterHold: number };
  erase: { exponent: number; edgeFeatherU: number; staticNoiseAmplitudeU: number };
  paletteSRGB: { body: string; middle: string; edge: string; core: string };
  path: { points: readonly Vec2[]; segments: number; maxWidthInCharacterHeights: number };
  widthProfile: { power: number };
  render: { edgeOpacity: number; edgeWidthV: number; seed: number };
  test: { backgrounds: string[]; playbackRates: number[]; fps: number[]; sampleTimesMs: number[] };
}

//설정 파일이 규격과 다를 때 던진다
export class RibbonConfigError extends Error {}

//한 시각의 상태. head·tail 은 u 비율, scale 은 늘 1 (소멸 중 메시를 줄이지 않는다)
export interface SlashSample {
  head: number;
  tail: number;
  scale: number;
  alive: boolean;
}

//경로 위 등간격 점 하나. u 는 호 길이 비율, tangent 는 진행 방향 단위 벡터
export interface RibbonPoint {
  p: Vec2;
  u: number;
  tangent: Vec2;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

//3차 베지어 한 점
export function bezier(points: readonly Vec2[], t: number): Vec2 {
  const [a, b, c, d] = points as [Vec2, Vec2, Vec2, Vec2];
  const s = 1 - t;
  const w0 = s * s * s;
  const w1 = 3 * s * s * t;
  const w2 = 3 * s * t * t;
  const w3 = t * t * t;
  return [w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0], w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1]];
}

//베지어를 호 길이로 등간격 segments 구간으로 나눈다. 매개변수 t 를 거리로 쓰지 않는다
//dense: 길이를 잴 때 쓰는 촘촘한 샘플 수
export function arcLengthPoints(points: readonly Vec2[], segments: number, dense = 2048): RibbonPoint[] {
  const raw: Vec2[] = [];
  for (let i = 0; i <= dense; i++) raw.push(bezier(points, i / dense));
  const cumulative = [0];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1] as Vec2;
    const b = raw[i] as Vec2;
    cumulative.push((cumulative[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cumulative[cumulative.length - 1] as number;
  const out: Vec2[] = [];
  let j = 1;
  for (let k = 0; k <= segments; k++) {
    const target = (total * k) / segments;
    while (j < cumulative.length - 1 && (cumulative[j] as number) < target) j++;
    const d0 = cumulative[j - 1] as number;
    const d1 = cumulative[j] as number;
    const t = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const a = raw[j - 1] as Vec2;
    const b = raw[j] as Vec2;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out.map((p, k) => {
    const prev = out[Math.max(0, k - 1)] as Vec2;
    const next = out[Math.min(out.length - 1, k + 1)] as Vec2;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    return { p, u: k / segments, tangent: [dx / len, dy / len] as const };
  });
}

//효과 전체 길이(ms). 전개 + 유지 + 소멸
export function slashDuration(config: RibbonSlashConfig): number {
  const { reveal, hold, erase } = config.timingMs;
  return reveal + hold + erase;
}

//시각 ageMs 의 보이는 구간. 전개는 0 → head, 소멸은 head 를 1 에 두고 tail 만 0 → 1 (p^k: 처음 천천히, 끝에 빠르게)
export function slashSample(config: RibbonSlashConfig, ageMs: number): SlashSample {
  const { reveal, hold, erase } = config.timingMs;
  const head = clamp01(ageMs / reveal);
  const tail = Math.pow(clamp01((ageMs - reveal - hold) / erase), config.erase.exponent);
  return { head, tail, scale: 1, alive: ageMs >= 0 && ageMs < slashDuration(config) };
}

//경계 깃털·질감을 뺀 기하 마스크. 셰이더와 같은 시각에 대조한다
export function slashVisible(config: RibbonSlashConfig, u: number, ageMs: number): boolean {
  const s = slashSample(config, ageMs);
  return s.alive && s.head > s.tail && u >= s.tail && u <= s.head;
}

//u 에 따른 폭 비율. 양 끝이 가늘고 가운데가 최대. 시간과 무관하다
export function widthAt(config: RibbonSlashConfig, u: number): number {
  return Math.pow(Math.max(0, Math.sin(Math.PI * clamp01(u))), config.widthProfile.power);
}

//고정 공간 노이즈 (-1~1). 시간 항이 없어서 소멸 중 위상이 떨리지 않는다. 셰이더 noiseAt 과 같은 식
export function staticNoise(u: number, v: number, seed: number): number {
  const cell = (x: number, y: number): number => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.618) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const x = u * 48;
  const y = Math.floor(v * 6);
  const i = Math.floor(x);
  const f = x - i;
  return cell(i, y) * (1 - f) + cell(i + 1, y) * f;
}

//한 점(u,v)이 이 시각에 지워졌는지. 노이즈로 흔든 u 가 tail 보다 앞이면 지워진다 (단조: tail 만 커진다)
export function erasedAt(config: RibbonSlashConfig, u: number, v: number, ageMs: number): boolean {
  const s = slashSample(config, ageMs);
  return u + staticNoise(u, v, config.render.seed) * config.erase.staticNoiseAmplitudeU < s.tail;
}

//JSON 을 검사해 설정으로. 시간이 0 이하거나 꼬리→머리 방향이 아니면 던진다
export function parseRibbonConfig(raw: unknown): RibbonSlashConfig {
  if (!raw || typeof raw !== 'object') throw new RibbonConfigError('realtime-vfx 가 객체가 아니다');
  const c = raw as RibbonSlashConfig & { erase: { direction?: string; shrinkWholeMesh?: boolean } };
  const { reveal, hold, erase } = c.timingMs ?? ({} as RibbonSlashConfig['timingMs']);
  if (![reveal, hold, erase].every((v) => Number.isFinite(v) && v > 0)) throw new RibbonConfigError('timingMs 의 reveal·hold·erase 는 0 보다 커야 한다');
  if (c.erase?.direction !== 'tail-to-head') throw new RibbonConfigError('소멸 방향은 tail-to-head 만 된다');
  if (c.erase.shrinkWholeMesh !== false) throw new RibbonConfigError('소멸 중 메시 전체를 줄이지 않는다 (shrinkWholeMesh false)');
  if (!(c.erase.exponent >= 1)) throw new RibbonConfigError('erase.exponent 는 1 이상');
  if (!Array.isArray(c.path?.points) || c.path.points.length !== 4) throw new RibbonConfigError('path.points 는 3차 베지어 점 4개');
  if (!(c.path.segments >= 2)) throw new RibbonConfigError('path.segments 는 2 이상');
  if (c.timeDomain !== 'game' && c.timeDomain !== 'real') throw new RibbonConfigError('timeDomain 은 game 또는 real');
  return c;
}
