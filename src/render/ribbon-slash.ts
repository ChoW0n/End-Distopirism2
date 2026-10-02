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
  erase: { exponent: number; edgeFeatherU: number; staticNoiseAmplitudeU: number; strandLagU: number; thinU: number };
  paletteSRGB: { deep: string; body: string; bright: string; light: string; foam: string; core: string };
  path: {
    points: readonly Vec2[];
    segments: number;
    //[u, 두께 H] 표. 사이는 직선으로 잇는다
    innerWidthsH: readonly Vec2[];
    outerWidthsH: readonly Vec2[];
    coreWidthH: number;
  };
  waves: { count: number; base: number; lean: number; foam: number };
  droplets: {
    count: number;
    seed: number;
    outerShare: number;
    offsetH: Vec2;
    sizeH: Vec2;
    lagU: Vec2;
    driftH: Vec2;
  };
  render: { glowOpacity: number; seed: number };
  //§15.2 받은 효과 레이어 질감. 없으면 절차적 그리기만 쓴다
  texture?: {
    source: string;
    file: string;
    uRange: Vec2;
    //세로 위 끝·아래 끝의 호에서 거리 (H, + 바깥)
    dRangeH: Vec2;
    //밝기 → 덮임 [바닥, 폭]
    coverage: Vec2;
    erosionWeight: number;
    //밝기 자리(0~1) → 팔레트 이름
    gradient: readonly (readonly [number, keyof RibbonSlashConfig['paletteSRGB']])[];
  };
  //§15.2 화려함 옵션 기본값과 수치
  options?: RibbonOptions & {
    flowSpeedU: number;
    flareMs: number;
    sparkleDensity: number;
    sprayCount: number;
    sprayMs: number;
    sprayDistH: number;
  };
  test: { backgrounds: string[]; playbackRates: number[]; fps: number[]; sampleTimesMs: number[] };
}

//화려함 옵션 켜짐 (§15.2). 소멸 박자·덮임 모양은 바꾸지 않고 색·빛·입자만 더한다
export interface RibbonOptions {
  flow: boolean;
  flare: boolean;
  glow: boolean;
  sparkle: boolean;
  spray: boolean;
  extraDroplets: boolean;
}

//흩어짐 물방울 하나. 띠 텍스처의 밝은 칸 자리(u, 거리 H)와 그 칸의 소멸 값 E
export interface SprayTexel {
  u: number;
  dH: number;
  e: number;
}

//물방울 하나. u 는 붙은 자리, offsetH 는 호에서 떨어진 거리(+ 바깥, − 안쪽), lagU 만큼 늦게 지워진다
export interface Droplet {
  u: number;
  offsetH: number;
  sizeH: number;
  lagU: number;
  driftH: number;
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

//[u, 값] 표를 직선으로 이어 u 자리 값을 읽는다
export function tableAt(table: readonly Vec2[], u: number): number {
  const x = clamp01(u);
  const first = table[0] as Vec2;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1] as Vec2;
    const b = table[i] as Vec2;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-9, b[0] - a[0]);
  }
  return (table[table.length - 1] as Vec2)[1];
}

//호 안쪽 물결 몸통 두께(H). 꼬리 가늘고 칼끝 쪽 두껍다. 시간과 무관하다
export function innerWidthAt(config: RibbonSlashConfig, u: number): number {
  return tableAt(config.path.innerWidthsH, u);
}

//호 바깥 흰 심·번짐 두께(H)
export function outerWidthAt(config: RibbonSlashConfig, u: number): number {
  return tableAt(config.path.outerWidthsH, u);
}

//씨앗 고정 난수 (mulberry32). 물방울 자리를 매번 같게 만든다
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

//물방울 자리. 칼끝 쪽(u 큰 쪽)에 더 많다. 바깥 비율 outerShare, 안쪽은 물결 몸통 안에
export function dropletLayout(config: RibbonSlashConfig): Droplet[] {
  const d = config.droplets;
  const rand = seeded(d.seed);
  const lerp = (r: Vec2, t: number): number => r[0] + (r[1] - r[0]) * t;
  return Array.from({ length: d.count }, () => {
    //u 는 0.05~1, 제곱근으로 칼끝 쪽에 몰린다
    const u = 0.05 + 0.95 * Math.sqrt(rand());
    const outer = rand() < d.outerShare;
    //바깥은 호 가까이에 몰리고(제곱 분포), 칼끝 쪽일수록 멀리 튄다
    const reach = lerp(d.offsetH, rand() * rand()) * (0.45 + 0.55 * u);
    const offsetH = outer ? outerWidthAt(config, u) + reach : -innerWidthAt(config, u) * (0.2 + 0.75 * rand());
    return { u, offsetH, sizeH: lerp(d.sizeH, rand()), lagU: lerp(d.lagU, rand()), driftH: outer ? lerp(d.driftH, rand()) : 0 };
  });
}

//물방울이 이 시각에 보이는지. 머리가 지나간 뒤 켜지고, 꼬리가 자기 u + lag 를 넘으면 꺼진다 (다시 켜지지 않는다)
export function dropletVisible(config: RibbonSlashConfig, drop: Droplet, ageMs: number): boolean {
  const s = slashSample(config, ageMs);
  return s.alive && drop.u <= s.head && s.tail < drop.u + drop.lagU;
}

//물줄기 가닥 지연. 안쪽 깊이(0 호 ~ 1 안쪽 끝)를 띠로 나눠 띠마다 0~strandLagU 만큼 늦게 지운다. 셰이더 strandLag 와 같은 식
export function strandLag(config: RibbonSlashConfig, depth: number): number {
  const band = Math.floor(clamp01(depth) * 11);
  const s = Math.sin(band * 91.7 + config.render.seed * 1.3) * 43758.5453;
  return (s - Math.floor(s)) * config.erase.strandLagU;
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

//물줄기 결 (0~1). 호를 따라 흐르는 가는 줄. 셰이더 streakAt 과 같은 식
export function streakAt(config: RibbonSlashConfig, u: number, depth: number): number {
  return 0.5 + 0.5 * Math.sin(depth * 46 + u * 18 + staticNoise(u * 0.5, depth, config.render.seed) * 6);
}

//줄결이 아닌 곳은 thinU 만큼 먼저 지워져 끝이 가닥으로 남는다 (원본 S1 소멸처럼)
export function thinningAt(config: RibbonSlashConfig, u: number, depth: number): number {
  const s = streakAt(config, u, depth);
  return config.erase.thinU * (1 - s * s);
}

//한 점이 이 시각에 지워졌는지. depth 는 호 안쪽 깊이(0~1). 노이즈·가닥 지연으로 흔든 u 가 tail 보다 앞이면 지워진다
//노이즈·지연·가닥 남김이 시간에 따라 바뀌지 않으므로 단조다 (tail 만 커진다)
export function erasedAt(config: RibbonSlashConfig, u: number, depth: number, ageMs: number): boolean {
  const s = slashSample(config, ageMs);
  return u + staticNoise(u, depth, config.render.seed) * config.erase.staticNoiseAmplitudeU + strandLag(config, depth) - thinningAt(config, u, depth) < s.tail;
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
  for (const key of ['innerWidthsH', 'outerWidthsH'] as const) {
    const t = c.path[key];
    if (!Array.isArray(t) || t.length < 2 || t.some((p, i) => i > 0 && p[0] <= (t[i - 1] as Vec2)[0])) throw new RibbonConfigError(`path.${key} 는 u 가 커지는 [u, H] 표`);
  }
  if (!(c.waves?.count >= 1) || !(c.droplets?.count >= 0)) throw new RibbonConfigError('waves.count·droplets.count 가 없다');
  if (c.timeDomain !== 'game' && c.timeDomain !== 'real') throw new RibbonConfigError('timeDomain 은 game 또는 real');
  return c;
}

//밝기 → 덮임 (0~1). 셰이더와 같은 식
export function coverageOf(config: RibbonSlashConfig, lum: number): number {
  const [lo, span] = config.texture?.coverage ?? [0.04, 0.2];
  return clamp01((lum - lo) / span);
}

//질감 방식의 소멸 값. E = mix(u, T, w) 를 0~0.999 로 자른다. 보이는 곳은 E > tail (tail = 1 이면 전부 사라진다)
export function erosionValue(config: RibbonSlashConfig, u: number, t: number): number {
  const w = config.texture?.erosionWeight ?? 0;
  return Math.min(0.999, clamp01(u * (1 - w) + clamp01(t) * w));
}

//질감 방식에서 한 칸이 이 시각에 보이는지. 머리가 지나갔고 소멸 값이 꼬리보다 크다
export function textureVisible(config: RibbonSlashConfig, u: number, t: number, ageMs: number): boolean {
  const s = slashSample(config, ageMs);
  return s.alive && u <= s.head && erosionValue(config, u, t) > s.tail;
}

//꼬리가 소멸 값 e 에 닿는 시각(ms). tail(a) = ((a − reveal − hold) / erase)^k 를 거꾸로 푼다
export function erodeTimeOf(config: RibbonSlashConfig, e: number): number {
  const { reveal, hold, erase } = config.timingMs;
  return reveal + hold + erase * Math.pow(clamp01(e), 1 / config.erase.exponent);
}

//흩어짐 물방울 진행 (0~1). 자기 칸이 지워지는 순간부터 sprayMs 동안만, 그 밖은 null. 칸마다 한 번뿐이다
export function sprayProgress(config: RibbonSlashConfig, e: number, ageMs: number): number | null {
  const life = config.options?.sprayMs ?? 250;
  const start = erodeTimeOf(config, e);
  if (ageMs < start || ageMs >= start + life) return null;
  return (ageMs - start) / life;
}

//띠 텍스처(RGB, 위 = 바깥)에서 흩어짐을 낼 밝은 칸을 고른다. 덮임이 크고 밝은 칸만, 씨앗 고정
//pixels: RGBA 바이트 (ImageData.data 모양), width·height: 텍스처 크기
export function pickSprayTexels(config: RibbonSlashConfig, pixels: ArrayLike<number>, width: number, height: number): SprayTexel[] {
  const tex = config.texture;
  const count = config.options?.sprayCount ?? 0;
  if (!tex || count <= 0) return [];
  const rand = seeded(config.render.seed + 17);
  const out: SprayTexel[] = [];
  const [u0, u1] = tex.uRange;
  const [dTop, dBottom] = tex.dRangeH;
  for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    const i = (y * width + x) * 4;
    const lum = (pixels[i] ?? 0) / 255;
    if (lum < 0.55 || coverageOf(config, lum) < 0.9) continue;
    const u = u0 + ((x + 0.5) / width) * (u1 - u0);
    if (u < 0 || u > 1) continue;
    const dH = dTop + ((y + 0.5) / height) * (dBottom - dTop);
    out.push({ u, dH, e: erosionValue(config, u, (pixels[i + 1] ?? 0) / 255) });
  }
  return out;
}
