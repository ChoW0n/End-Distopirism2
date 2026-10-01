//발밑 반원 게이지 계산 (SPEC-004 §14.3·§14.4) 검증. 납품 test-gauge.cjs 의 검사를 옮겼다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extendEnds, GaugePath, pathData, pipStates, ultimateStage, type GaugeLayout, type GaugePoint } from '../src/render/arc-gauge.js';

const layout = JSON.parse(readFileSync(new URL('../assets/ui/kit/gauge-layout.json', import.meta.url), 'utf-8')) as GaugeLayout & {
  hp: { totalLength: number };
  sp: { totalLength: number };
};
const hp = new GaugePath(layout.hp.points);
const sp = new GaugePath(layout.sp.points);

//점들을 이은 길이
function length(points: readonly GaugePoint[]): number {
  return points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - (points[i] as GaugePoint)[0], p[1] - (points[i] as GaugePoint)[1]), 0);
}

describe('경로 길이 채움', () => {
  it('전체 길이가 레이아웃 값과 같다', () => {
    expect(hp.total).toBeCloseTo(layout.hp.totalLength, 8);
    expect(sp.total).toBeCloseTo(layout.sp.totalLength, 8);
  });

  it('앞부분 길이 = 전체 × 비율', () => {
    for (const p of [hp, sp]) {
      for (const ratio of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) expect(length(p.prefix(ratio))).toBeCloseTo(p.total * ratio, 8);
    }
  });

  it('0·음수·숫자 아님이면 비고, 1 넘으면 전체', () => {
    for (const p of [hp, sp]) {
      expect(p.prefix(0)).toEqual([]);
      expect(p.prefix(-1)).toEqual([]);
      expect(p.prefix(Number.NaN)).toEqual([]);
      expect(p.prefix(Number.POSITIVE_INFINITY)).toEqual([]);
      expect(length(p.prefix(2))).toBeCloseTo(p.total, 8);
    }
  });

  it('첫 점부터 채운다', () => {
    expect(hp.prefix(0.3)[0]).toEqual(layout.hp.points[0]);
    expect(sp.prefix(0.3)[0]).toEqual(layout.sp.points[0]);
  });

  it('감소 구간은 이전과 현재 사이만', () => {
    const lost = hp.segment(0.4, 0.75);
    expect(length(lost)).toBeCloseTo(hp.total * 0.35, 8);
    expect(lost[0]).toEqual(hp.prefix(0.4).at(-1));
    expect(lost.at(-1)).toEqual(hp.prefix(0.75).at(-1));
    expect(hp.segment(0.6, 0.6)).toEqual([]);
    expect(hp.segment(0.7, 0.2)).toEqual([]);
  });

  it('잘라 낸 점을 고쳐도 원본이 안 바뀐다', () => {
    const before = JSON.stringify(hp.prefix(1));
    const copy = hp.prefix(0.5) as [number, number][];
    for (const p of copy) p[0] = 999;
    expect(JSON.stringify(hp.prefix(1))).toBe(before);
  });

  it('가림판 끝 늘리기는 선분 방향으로만, 빈 경로는 그대로 비운다', () => {
    expect(extendEnds([], 8, true, true)).toEqual([]);
    const out = extendEnds([[0, 0], [10, 0]], 4, true, true);
    expect(out).toEqual([[-4, 0], [0, 0], [10, 0], [14, 0]]);
    expect(extendEnds([[0, 0], [10, 0]], 4, true, false)).toEqual([[-4, 0], [0, 0], [10, 0]]);
  });

  it('SVG 경로 글', () => {
    expect(pathData([])).toBe('');
    expect(pathData([[1, 2], [3.456, 4]])).toBe('M1 2L3.46 4');
  });
});

describe('결행 칸 네 상태', () => {
  it('흔적 합만큼 축적, 나머지 빈칸', () => {
    expect(pipStates(2, 3, 'charging')).toEqual(['charged', 'charged', 'empty']);
    expect(pipStates(3, 3, 'charging')).toEqual(['charged', 'charged', 'charged']);
    expect(pipStates(Number.NaN, 3, 'charging')).toEqual(['empty', 'empty', 'empty']);
    expect(pipStates(9, 3, 'charging')).toEqual(['charged', 'charged', 'charged']);
  });

  it('다음 턴 대기와 사용 가능을 가른다', () => {
    expect(pipStates(3, 3, 'pending')).toEqual(['pending', 'pending', 'pending']);
    expect(pipStates(3, 3, 'ready')).toEqual(['full', 'full', 'full']);
  });

  it('도메인 플래그로 단계를 정한다. 손에 있으면 사용 가능이 먼저', () => {
    expect(ultimateStage(false, false)).toBe('charging');
    expect(ultimateStage(false, true)).toBe('pending');
    expect(ultimateStage(true, false)).toBe('ready');
    expect(ultimateStage(true, true)).toBe('ready');
  });

  it('칸 자리는 세 칸, 기준점은 [160,30]', () => {
    expect(layout.pip.positions).toHaveLength(3);
    expect(layout.anchor).toEqual([160, 30]);
    expect(layout.canvas).toEqual([320, 110]);
  });
});
