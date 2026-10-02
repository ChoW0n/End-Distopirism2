//물금 실시간 VFX 계약 (SPEC-005 §15.1) 검증. 준비물 vfx-contract-check.mjs 의 검사를 옮기고 경로·노이즈를 더했다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  arcLengthPoints,
  dropletLayout,
  dropletVisible,
  erasedAt,
  erodeTimeOf,
  erosionValue,
  innerWidthAt,
  outerWidthAt,
  parseRibbonConfig,
  pickSprayTexels,
  slashDuration,
  slashSample,
  slashVisible,
  sprayProgress,
  staticNoise,
  textureVisible,
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

  it('두께: 꼬리 가늘고 칼끝 쪽 두껍다 (원본 물결 모양)', () => {
    expect(innerWidthAt(config, 0)).toBeLessThan(0.05);
    expect(innerWidthAt(config, 0.68)).toBeGreaterThan(innerWidthAt(config, 0.25));
    expect(innerWidthAt(config, 1)).toBeLessThan(0.05);
    expect(outerWidthAt(config, 0.5)).toBeGreaterThan(config.path.coreWidthH);
    //표 사이는 직선
    expect(innerWidthAt(config, 0.05)).toBeCloseTo((0.02 + 0.1) / 2, 9);
  });

  it('노이즈는 고정 (같은 자리 같은 값) · -1~1', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      const n = staticNoise(u, 0.3, config.render.seed);
      expect(n).toBe(staticNoise(u, 0.3, config.render.seed));
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });

  it('노이즈·가닥 지연을 넣어도 지워진 곳은 다시 켜지지 않는다', () => {
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

describe('물방울', () => {
  const drops = dropletLayout(config);

  it('씨앗이 같으면 자리가 같고, 칼끝 쪽에 더 많다', () => {
    expect(dropletLayout(config)).toEqual(drops);
    expect(drops).toHaveLength(config.droplets.count);
    const late = drops.filter((d) => d.u > 0.5).length;
    expect(late).toBeGreaterThan(drops.length / 2);
  });

  it('바깥 물방울은 호 바깥, 안쪽은 물결 몸통 안', () => {
    for (const d of drops) {
      if (d.offsetH > 0) expect(d.offsetH).toBeGreaterThan(outerWidthAt(config, d.u));
      else expect(-d.offsetH).toBeLessThanOrEqual(innerWidthAt(config, d.u) + 1e-9);
    }
  });

  it('머리가 지나가야 켜지고, 꺼지면 다시 켜지지 않으며, 끝에는 전부 꺼진다', () => {
    for (const d of drops) {
      let seen = false;
      let gone = false;
      for (let t = 0; t <= total; t += 5) {
        const v = dropletVisible(config, d, t);
        if (v && !seen) expect(slashSample(config, t).head).toBeGreaterThanOrEqual(d.u);
        if (v) seen = true;
        if (seen && !v) gone = true;
        if (gone) expect(v).toBe(false);
      }
      expect(dropletVisible(config, d, total)).toBe(false);
    }
  });

  it('잔여 물방울: 자기 자리 몸통보다 늦게 꺼진다', () => {
    const d = drops.find((x) => x.u < 0.6) as (typeof drops)[number];
    const t = reveal + hold + erase * Math.sqrt(d.u + 0.001);
    expect(slashVisible(config, d.u, t)).toBe(false);
    expect(dropletVisible(config, d, t)).toBe(true);
  });
});

describe('§15.2 질감 방식', () => {
  it('소멸 값 E: 시간과 무관, 0~0.999, 소멸 끝에는 모든 칸이 꺼진다', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      for (const t of [0, 0.3, 0.7, 1]) {
        const e = erosionValue(config, u, t);
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThan(1);
        expect(textureVisible(config, u, t, total)).toBe(false);
        expect(textureVisible(config, u, t, total - 1)).toBe(e > slashSample(config, total - 1).tail);
      }
    }
  });

  it('지워진 칸은 다시 켜지지 않는다 (단조)', () => {
    for (let u = 0; u <= 1; u += 0.04) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        let erased = false;
        for (let a = reveal; a <= total; a += 5) {
          const v = textureVisible(config, u, t, a);
          if (!v) erased = true;
          if (erased) expect(v).toBe(false);
        }
      }
    }
  });

  it('같은 원본 순서 T 라면 꼬리 쪽(u 작은 칸)이 먼저 지워진다', () => {
    for (const t of [0, 0.5, 1]) expect(erosionValue(config, 0.1, t)).toBeLessThan(erosionValue(config, 0.9, t));
  });

  it('흩어짐: 자기 칸이 지워지는 순간부터 sprayMs 동안 한 번만', () => {
    const life = config.options?.sprayMs ?? 0;
    for (const e of [0.05, 0.4, 0.95]) {
      const start = erodeTimeOf(config, e);
      expect(slashSample(config, start).tail).toBeCloseTo(e, 6);
      expect(sprayProgress(config, e, start - 1)).toBeNull();
      expect(sprayProgress(config, e, start)).toBe(0);
      expect(sprayProgress(config, e, start + life / 2)).toBeCloseTo(0.5, 6);
      expect(sprayProgress(config, e, start + life)).toBeNull();
    }
  });

  it('흩어짐 칸 고르기: 밝고 덮인 칸만, 씨앗이 같으면 같다', () => {
    const w = 40;
    const h = 10;
    const px = new Uint8ClampedArray(w * h * 4);
    //왼쪽 절반만 밝다
    for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) px.set([230, 128, 50, 255], (y * w + x) * 4);
    const a = pickSprayTexels(config, px, w, h);
    expect(a.length).toBeGreaterThan(0);
    expect(pickSprayTexels(config, px, w, h)).toEqual(a);
    const [u0, u1] = config.texture?.uRange ?? [0, 1];
    for (const t of a) expect(t.u).toBeLessThanOrEqual(u0 + (u1 - u0) / 2 + 1e-9);
  });

  it('텍스처 자리: 바깥이 위, 가로가 0~1 을 덮는다', () => {
    const tex = config.texture;
    expect(tex).toBeDefined();
    expect(tex?.dRangeH[0]).toBeGreaterThan(0);
    expect(tex?.dRangeH[1]).toBeLessThan(0);
    expect(tex?.uRange[0]).toBeLessThanOrEqual(0);
    expect(tex?.uRange[1]).toBeGreaterThanOrEqual(1);
  });
});
