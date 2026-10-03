//물금 공간형 VFX 계산 (SPEC-005 §15.3) 검증. 뒤 → 옆 → 앞, 꼬리부터 소멸, 다시 켜지지 않음, 끝나면 전부 꺼짐
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { originalFrameAt, parseRibbonConfig, slashDuration } from '../src/render/ribbon-slash.js';
import {
  crossPoint,
  depthAt,
  parseSpaceConfig,
  rippleRing,
  rippleSources,
  spaceDropletAlpha,
  spaceDropletPos,
  spaceDroplets,
  spacePath,
} from '../src/render/space-slash.js';

const raw = JSON.parse(readFileSync('assets/kyle/realtime-vfx.json', 'utf8')) as unknown;
const config = parseRibbonConfig(raw);
const space = parseSpaceConfig(raw);
const total = slashDuration(config);
const times = Array.from({ length: 101 }, (_, i) => (total * i) / 100);

describe('공간형 띠 경로', () => {
  it('꼬리는 몸 뒤(z<0), 머리는 몸 앞(z>0), 중간에 몸 판(z=0)을 한 번 지난다', () => {
    const path = spacePath(config, space, 128);
    expect((path[0] as (typeof path)[number]).p[2]).toBeLessThan(0);
    expect((path[path.length - 1] as (typeof path)[number]).p[2]).toBeGreaterThan(0);
    let crossings = 0;
    for (let i = 1; i < path.length; i++) if (Math.sign((path[i - 1] as (typeof path)[number]).p[2]) !== Math.sign((path[i] as (typeof path)[number]).p[2])) crossings++;
    expect(crossings).toBe(1);
  });

  it('화면 평면 x·y 는 §15.1 경로 그대로이고, 진행·단면 방향은 단위 벡터로 서로 직교한다', () => {
    for (const pt of spacePath(config, space, 64)) {
      expect(Math.hypot(...pt.tangent)).toBeCloseTo(1, 6);
      expect(Math.hypot(...pt.cross)).toBeCloseTo(1, 6);
      expect(pt.tangent[0] * pt.cross[0] + pt.tangent[1] * pt.cross[1] + pt.tangent[2] * pt.cross[2]).toBeCloseTo(0, 6);
      expect(pt.p[2]).toBeCloseTo(depthAt(space, pt.u), 9);
    }
  });

  it('안쪽 끝은 카메라 쪽으로 말리고, 바깥은 말리지 않는다', () => {
    const pt = spacePath(config, space, 64)[32] as ReturnType<typeof spacePath>[number];
    const inner = crossPoint(space, pt, -0.6, 0.6);
    const flatInner = [pt.p[2] + pt.cross[2] * -0.6];
    expect(inner[2] - (flatInner[0] as number)).toBeCloseTo(space.curlH, 9);
    const outer = crossPoint(space, pt, 0.3, 0.6);
    expect(outer[2]).toBeCloseTo(pt.p[2] + pt.cross[2] * 0.3, 9);
  });
});

describe('깊이별 물방울', () => {
  const drops = spaceDroplets(config, space);

  it('층마다 정한 수만큼, 씨앗이 같으면 같은 자리', () => {
    expect(drops.length).toBe(space.droplets.layers.reduce((n, l) => n + l.count, 0));
    expect(spaceDroplets(config, space)).toEqual(drops);
  });

  it('far 층은 몸 뒤, near 층은 카메라 쪽에 있다', () => {
    const far = space.droplets.layers.findIndex((l) => l.name === 'far');
    const near = space.droplets.layers.findIndex((l) => l.name === 'near');
    for (const d of drops) {
      if (d.layer === far) expect(d.pos[2]).toBeLessThan(0);
      if (d.layer === near) expect(d.pos[2]).toBeGreaterThan(0.4);
    }
  });

  it('한 번 꺼진 물방울은 다시 켜지지 않고, 끝 시각엔 전부 꺼진다. 바닥 밑으로 안 간다', () => {
    for (const d of drops) {
      let wasOn = false;
      let offAfterOn = false;
      for (const t of times) {
        const a = spaceDropletAlpha(config, d, t);
        if (a > 0) {
          expect(offAfterOn).toBe(false);
          wasOn = true;
        } else if (wasOn) offAfterOn = true;
        expect(spaceDropletPos(config, space, d, t)[1]).toBeGreaterThanOrEqual(0);
      }
      expect(spaceDropletAlpha(config, d, total)).toBe(0);
    }
  });

  it('꼬리 쪽(u 작은) 물방울이 먼저 꺼진다', () => {
    const offAt = (u: number): number => {
      const d = { ...(drops[0] as (typeof drops)[number]), u, lagU: 0.05 };
      return times.find((t) => t > config.timingMs.reveal && spaceDropletAlpha(config, d, t) === 0) ?? total;
    };
    expect(offAt(0.2)).toBeLessThan(offAt(0.6));
    expect(offAt(0.6)).toBeLessThanOrEqual(offAt(0.95));
  });
});

describe('지면 물결', () => {
  const sources = rippleSources(config, space);

  it('호가 바닥 가까운 구간에서 count 곳 + 발 자리 하나', () => {
    expect(sources.length).toBe(space.ripples.count + (space.ripples.footRipple ? 1 : 0));
    for (const s of sources) expect(s.startMs).toBeCloseTo(config.timingMs.reveal * s.u, 9);
  });

  it('고리는 시작 전엔 없고, 퍼지며, 꼬리가 출처를 지나면 꺼져 다시 켜지지 않는다', () => {
    for (const src of sources) {
      for (let k = 0; k < space.ripples.rings; k++) {
        let wasOn = false;
        let offAfterOn = false;
        let lastR = 0;
        for (const t of times) {
          const ring = rippleRing(config, space, src, k, t);
          if (t < src.startMs) expect(ring.strength).toBe(0);
          expect(ring.radiusH).toBeGreaterThanOrEqual(lastR);
          lastR = ring.radiusH;
          if (ring.strength > 0) {
            expect(offAfterOn).toBe(false);
            wasOn = true;
          } else if (wasOn) offAfterOn = true;
        }
        expect(rippleRing(config, space, src, k, total).strength).toBe(0);
      }
    }
  });
});

describe('평면 비교 장 박자', () => {
  it('전개 동안 01 장, 끝나면 15 장, 그 사이는 앞으로만 넘어간다', () => {
    expect(originalFrameAt(0, config.timingMs.reveal)).toBe(0);
    expect(originalFrameAt(5000, config.timingMs.reveal)).toBe(14);
    let last = 0;
    for (const t of times) {
      const f = originalFrameAt(t, config.timingMs.reveal);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
  });
});
