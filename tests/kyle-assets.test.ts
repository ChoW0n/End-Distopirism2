//카일 완성 스프라이트 매니페스트가 3D 무대 장 매핑(SPEC-005 §9.4)과 반입 규칙(SPEC-002 §9.7)을 채우는지 본다

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';
import { parseUltimateArt } from '../src/render/ultimate.js';
import { parseBackdropConfig } from '../src/renderer3d/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const kyle = loadCharacterAssets(resolve(here, '../assets'), 'kyle');
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(here, '..', path), 'utf8'));

describe('카일 매니페스트', () => {
  it('읽힌다', () => {
    expect(kyle).not.toBeNull();
  });

  it.each(['idle', 'advance', 'guard', 'hit', 'retreat'])('%s 장이 있다', (suffix) => {
    expect(kyle?.frameEndingWith(suffix)).not.toBeNull();
  });

  it('모든 장이 공통 캔버스 1700x720, 발 (760,600) 에 앉는다 (SPEC-002 §9.7)', () => {
    expect(kyle?.manifest.canvas).toEqual({ width: 1700, height: 720 });
    for (const frame of kyle?.manifest.frames ?? []) expect(frame.anchor).toEqual({ x: 760, y: 600 });
  });

  it('전용기 1 은 준비 장 + 통합 15장, 01~14 60ms · 15 160ms', () => {
    const seq = kyle?.frameSequence('S1') ?? [];
    expect(seq).toHaveLength(16);
    expect(seq[0]).toBe('11-skill1-ready');
    const ms = seq.slice(1).map((id) => kyle?.frame(id).ms);
    expect(ms).toEqual([...Array(14).fill(60), 160]);
  });

  it('전용기 2 는 막기 장에서 찌르는 15장, 01~14 70ms · 15 120ms', () => {
    const seq = kyle?.frameSequence('S2') ?? [];
    expect(seq).toHaveLength(16);
    expect(kyle?.frame(seq[0] as string).file).toBe(kyle?.frameEndingWith('guard')?.file);
    expect(seq.slice(1).map((id) => kyle?.frame(id).ms)).toEqual([...Array(14).fill(70), 120]);
  });

  //타 장 수는 SPEC-001 [D-22] 타수 표와 같다 (SPEC-005 §12.1)
  it.each([
    ['S1', ['11-skill1-01']],
    ['S2', ['12-skill2-ready', '12-skill2-01']],
    ['S3', ['13-skill3-03-parry-impact', '13-skill3-08-upcut-impact', '13-skill3-22-downcut-impact']],
  ] as const)('%s 타 장이 타수만큼 있다', (slot, hits) => {
    const seq = kyle?.frameSequence(slot) ?? [];
    expect(seq.filter((id) => kyle?.frame(id).impact)).toEqual(hits);
  });

  it('전용기 2 는 받아내기(준비 장)가 첫 타다', () => {
    expect(kyle?.frame('12-skill2-ready').impact).toBe(true);
    expect(kyle?.frame('11-skill1-ready').impact).toBe(false);
    expect(kyle?.frame('13-skill3-ready').impact).toBe(false);
  });

  it('전용기 3 은 낮게 진입 → 칼집 쳐내기 → 올려베기·내려베기', () => {
    const seq = kyle?.frameSequence('S3') ?? [];
    expect(seq[0]).toBe('13-skill3-ready');
    expect(seq[1]).toBe('13-skill3-03-parry-impact');
    expect(seq.at(-1)).toBe('13-skill3-38-follow-through');
    //납품 animation.json 시간 합 (대기 01·복귀 39 를 뺀 03~38)
    const total = seq.slice(1).reduce((sum, id) => sum + (kyle?.frame(id).ms ?? 0), 0);
    expect(total).toBe(3170 - 380 - 70 - 450);
  });

  it('궁극기 장은 최신본 v2 두 장(준비·납도 마무리)뿐이다 (SPEC-005 §10.2 v2.16)', () => {
    expect(kyle?.frameSequence('ULT')).toEqual(['14-ult-ready', '14-ult-post-closed']);
  });

  it('궁극기 이펙트는 적 자리에 붙는 베기선·물보라와 발밑 밤물이다 (15장 × 60ms)', () => {
    const slash = kyle?.effect('ult-slash');
    const water = kyle?.effect('ult-water');
    expect(slash?.frames).toHaveLength(15);
    expect(water?.frames.every((f) => f.ms === 60)).toBe(true);
    expect(slash?.pivot).toEqual({ x: 400, y: 280 });
    expect(water?.pivot).toEqual({ x: 384, y: 490 });
    expect(kyle?.effect('ult-night-pool').size).toEqual({ width: 470, height: 120 });
  });
});

describe('카일 궁극기 시간표 (SPEC-005 §10.2)', () => {
  const art = parseUltimateArt(readJson('assets/kyle/ultimate.json'));

  it('옛 몸(납도 직전·옛 확대 전경)을 쓰지 않는다 (§10.2 v2.16)', () => {
    expect(art.frames.open).toBe('14-ult-post-closed');
    expect(art.cutscene.foreground).toBe('norm/ult-cutscene.png');
  });

  it('납품 README 시각을 그대로 옮긴다', () => {
    expect(art.timeline).toMatchObject({
      swapEnvironment: 0.15,
      cutsceneStart: 0.6,
      cutLine: 1.6,
      cutsceneEnd: 2.1,
      appearBehind: 2.1,
      sheathClick: 2.35,
      water: 2.4,
      effectsEnd: 3.3,
      restoreEnvironment: 3.5,
      end: 4.0,
    });
    //컷신은 정확히 1.5초
    expect(art.timeline.cutsceneEnd - art.timeline.cutsceneStart).toBeCloseTo(1.5);
  });

  it('장·이펙트 이름이 매니페스트에 있다', () => {
    for (const id of Object.values(art.frames)) expect(kyle?.frame(id)).toBeTruthy();
    for (const id of Object.values(art.effects)) expect(kyle?.effect(id)).toBeTruthy();
  });

  it('여러 번 벤다 (v2.11): 4번, 0.08초 간격, 베기선마다 기울기가 다르다', () => {
    expect(art.slashes.count).toBe(4);
    expect(art.slashes.interval).toBeCloseTo(0.08);
    expect(new Set(art.slashes.rollDeg.slice(0, 4)).size).toBe(4);
  });

  it('마지막 베기선의 잔흔(15장 × 60ms)도 전장 복귀 전에 끝난다', () => {
    const slash = kyle?.effect(art.effects.slash);
    const seconds = (slash?.frames.reduce((s, f) => s + f.ms, 0) ?? 0) / 1000;
    const lastCut = art.timeline.sheathClick + (art.slashes.count - 1) * art.slashes.interval;
    expect(lastCut + seconds).toBeLessThanOrEqual(art.timeline.restoreEnvironment + 1e-9);
  });

  it('여러 번 베기가 없으면 한 번 벤다', () => {
    const raw = readJson('assets/kyle/ultimate.json') as Record<string, unknown>;
    delete raw['slashes'];
    expect(parseUltimateArt(raw).slashes.count).toBe(1);
  });

  it('시각이 거꾸로 가면 멈춘다', () => {
    const raw = readJson('assets/kyle/ultimate.json') as { timeline: Record<string, number> };
    raw.timeline['water'] = 2.0;
    expect(() => parseUltimateArt(raw)).toThrow(/water/);
  });

  it('고유 전장 밤바다는 제3 수문 v4 와 같은 기준 카메라, 먼 도시는 좌우 절반 0.68 배로 합친다', () => {
    expect(art.environment).toBe('map-nightsea');
    const sea = parseBackdropConfig(readJson('assets/map-nightsea/placement.json'));
    const v4 = parseBackdropConfig(readJson('assets/map-gate3-v4/placement.json'));
    expect(sea.camera).toEqual(v4.camera);
    expect(sea.viewport).toEqual([1672, 941]);
    const city = sea.layers.find((l) => l.file === '02-distant-city.png');
    expect(city?.draws).toEqual([
      { source: [0, 0, 836, 941], destination: [0, 0, 568.48, 639.88] },
      { source: [836, 0, 836, 941], destination: [1103.52, 0, 568.48, 639.88] },
    ]);
    expect((city?.draws[0]?.destination[2] ?? 0) / 836).toBeCloseTo(0.68);
    //앞 잔물결은 인형(10 대)보다 위에 그린다
    expect(sea.layers.find((l) => l.file === '04-foreground-ripples.png')?.order).toBeGreaterThan(20);
    expect(sea.layers.every((l) => !l.hideInCombat)).toBe(true);
  });
});
