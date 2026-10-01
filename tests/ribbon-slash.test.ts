//물금 실시간 VFX 계약 (SPEC-005 §15.1) 검증. 준비물 vfx-contract-check.mjs 의 검사를 옮기고 경로·노이즈를 더했다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  arcLengthPoints,
  erasedAt,
  parseRibbonConfig,
  slashDuration,
  slashSample,
  slashVisible,
  staticNoise,
  widthAt,
} from '../src/render/ribbon-slash.js';

const config = parseRibbonConfig(JSON.parse(readFileSync(new URL('../assets/kyle/realtime-vfx.json', import.meta.url), 'utf-8')));
const { reveal, hold, erase } = config.timingMs;
const total = slashDuration(config);

describe('설정값', () => {
  it('시간은 양수, 일반 플레이 꺼짐, 꼬리→머리, 지수 1 이상', () => {
    expect([reveal, hold, erase].every((v) => v > 0)).toBe(true);
    expect(config.enabledInNormalPlay).toBe(false);
    expect(config.erase.exponent).toBeGreaterThanOrEqual(1);
    expect(total).toBe(1000);
  });

  it('본체 합성은 막혀 있다 (깨끗한 본체·앵커 승인 전)', () => {
    expect(config.bodyIntegration.startsWith('blocked')).toBe(true);
  });

  it('규격 밖이면 던진다', () => {
    expect(() => parseRibbonConfig({ ...config, erase: { ...config.erase, direction: 'head-to-tail' } })).toThrow();
    expect(() => parseRibbonConfig({ ...config, erase: { ...config.erase, shrinkWholeMesh: true } })).toThrow();
    expect(() => parseRibbonConfig({ ...config, timingMs: { ...config.timingMs, erase: 0 } })).toThrow();
  });
});

describe('진행률', () => {
  it('시작은 비어 있고 전개 뒤 최대 형태', () => {
    expect(slashVisible(config, 0, 0)).toBe(false);
    expect(slashSample(config, reveal).head).toBe(1);
    expect(slashSample(config, reveal + hold).tail).toBe(0);
  });

  it('소멸 절반 시각에서 꼬리는 1/4 (p²), 지나간 쪽만 지워진다', () => {
    const t = reveal + hold + erase / 2;
    expect(slashSample(config, t).tail).toBe(0.25);
    expect(slashVisible(config, 0.1, t)).toBe(false);
    expect(slashVisible(config, 0.8, t)).toBe(true);
  });

  it('지워진 부분이 다시 켜지지 않는다', () => {
    for (let u = 0; u <= 1; u += 0.01) {
      let erased = false;
      for (let t = reveal + hold; t <= total; t += 5) {
        if (!slashVisible(config, u, t)) erased = true;
        if (erased) expect(slashVisible(config, u, t)).toBe(false);
      }
    }
  });

  it('소멸 중 head 는 1, 크기는 1 (중심 수축 없음)', () => {
    for (let t = reveal; t < total; t += 7) {
      expect(slashSample(config, t).head).toBe(1);
      expect(slashSample(config, t).scale).toBe(1);
    }
  });

  it('끝과 끝 이후는 완전히 사라진다', () => {
    for (const t of [total, total + 1, total + 1000]) {
      expect(slashSample(config, t).alive).toBe(false);
      expect(slashVisible(config, 1, t)).toBe(false);
    }
  });

  it('좌우 반전과 u 진행률은 독립', () => {
    const t = reveal + hold + erase / 2;
    for (const facing of [-1, 1]) {
      const pts = arcLengthPoints(config.path.points, config.path.segments).map((p) => ({ x: p.p[0] * facing, u: p.u }));
      expect(pts[0]?.u).toBe(0);
      expect(slashVisible(config, pts[6]?.u ?? 0, t)).toBe(false);
      expect(slashVisible(config, pts[60]?.u ?? 0, t)).toBe(true);
    }
  });

  it('프레임율과 무관 (30·60·120fps 로 같은 시각에 닿으면 같은 head/tail)', () => {
    for (const target of config.test.sampleTimesMs) {
      const expected = slashSample(config, target);
      for (const fps of config.test.fps) {
        let t = 0;
        while (target - t > 1e-9) t += Math.min(1000 / fps, target - t);
        expect(Math.abs(slashSample(config, t).tail - expected.tail)).toBeLessThan(1e-8);
        expect(Math.abs(slashSample(config, t).head - expected.head)).toBeLessThan(1e-8);
      }
    }
  });

  it('배속은 바깥에서 한 번만 곱한다', () => {
    for (const rate of config.test.playbackRates) {
      const wall = 610 / rate;
      expect(slashSample(config, wall * rate).tail).toBe(slashSample(config, 610).tail);
    }
  });
});

describe('경로·폭·노이즈', () => {
  const pts = arcLengthPoints(config.path.points, config.path.segments);

  it('호 길이 등간격 (베지어 t 를 거리로 쓰지 않는다)', () => {
    expect(pts).toHaveLength(config.path.segments + 1);
    const steps = pts.slice(1).map((p, i) => Math.hypot(p.p[0] - (pts[i] as typeof p).p[0], p.p[1] - (pts[i] as typeof p).p[1]));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    for (const s of steps) expect(Math.abs(s - mean) / mean).toBeLessThan(0.01);
    expect(pts[0]?.p).toEqual(config.path.points[0]);
    const last = pts.at(-1)?.p as readonly [number, number];
    expect(last[0]).toBeCloseTo((config.path.points[3] as readonly [number, number])[0], 6);
  });

  it('폭은 양 끝 0, 가운데 최대, 시간과 무관', () => {
    expect(widthAt(config, 0)).toBe(0);
    expect(widthAt(config, 0.5)).toBe(1);
    expect(widthAt(config, 1)).toBeCloseTo(0, 6);
  });

  it('노이즈는 고정 (같은 자리 같은 값) · -1~1', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      const n = staticNoise(u, 0.3, config.render.seed);
      expect(n).toBe(staticNoise(u, 0.3, config.render.seed));
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });

  it('노이즈를 넣어도 지워진 곳은 다시 켜지지 않는다', () => {
    for (let u = 0; u <= 1; u += 0.02) {
      for (const v of [0.1, 0.5, 0.9]) {
        let erased = false;
        for (let t = 0; t <= total; t += 4) {
          if (erasedAt(config, u, v, t)) erased = true;
          if (erased) expect(erasedAt(config, u, v, t)).toBe(true);
        }
      }
    }
  });
});
