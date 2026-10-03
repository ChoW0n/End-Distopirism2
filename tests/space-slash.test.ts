//물금 공간형 VFX 계산 (SPEC-005 §15.3·§15.3.1) 검증. 몸 둘레 휘두름 궤적, 게임 카메라에서 원화 호와 겹침, 꼬리부터 소멸, 다시 켜지지 않음, 끝나면 전부 꺼짐
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { originalFrameAt, parseRibbonConfig, slashDuration } from '../src/render/ribbon-slash.js';
import {
  crossPoint,
  depthAt,
  parseSpaceConfig,
  rippleRing,
  rippleSources,
  screenOf,
  spaceDropletAlpha,
  spaceDropletPos,
  spaceDroplets,
  spacePath,
  viewPitchDeg,
} from '../src/render/space-slash.js';
import { arcLengthPoints } from '../src/render/ribbon-slash.js';

const raw = JSON.parse(readFileSync('assets/kyle/realtime-vfx.json', 'utf8')) as unknown;
const config = parseRibbonConfig(raw);
const space = parseSpaceConfig(raw);
const total = slashDuration(config);
//제3 수문 배경 기준 카메라가 내려다보는 각
const placement = JSON.parse(readFileSync('assets/map-gate3-v4/placement.json', 'utf8')) as { projection: { camera: { back: number; height: number; lookAtHeight: number } } };
const pitch = viewPitchDeg(placement.projection.camera);
const times = Array.from({ length: 101 }, (_, i) => (total * i) / 100);

describe('휘두름 궤적', () => {
  const path = spacePath(config, space, 128, pitch);

  it('꼬리는 몸 뒤(z<0), 가운데는 몸 앞, 몸 판(z=0)을 뒤→앞으로 한 번 지난다', () => {
    expect((path[0] as (typeof path)[number]).p[2]).toBeLessThan(0);
    expect(Math.max(...path.map((pt) => pt.p[2]))).toBeGreaterThan(0.5);
    let crossings = 0;
    for (let i = 1; i < path.length; i++) if (Math.sign((path[i - 1] as (typeof path)[number]).p[2]) !== Math.sign((path[i] as (typeof path)[number]).p[2])) crossings++;
    expect(crossings).toBe(1);
  });

  it('게임 카메라에서 보면 원화 호와 겹친다', () => {
    const art = arcLengthPoints(config.path.points, 128);
    path.forEach((pt, i) => {
      const [x, y] = screenOf(pt.p, pitch);
      expect(x).toBeCloseTo((art[i] as (typeof art)[number]).p[0], 9);
      expect(y).toBeCloseTo((art[i] as (typeof art)[number]).p[1], 9);
    });
  });

  it('세로 평면이 아니다: 깊이 폭이 1H 를 넘고, 위에서 보면 몸 둘레를 돈다', () => {
    const zs = path.map((pt) => pt.p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1);
    //위에서 본 궤적이 한쪽으로 꾸준히 돈다: 굵게 나눈 마디(8칸)마다 외적 부호가 같고, 꺾임 없이 120° 넘게 방향이 바뀐다
    const coarse = path.filter((_, i) => i % 8 === 0);
    let heading = 0;
    for (let i = 2; i < coarse.length; i++) {
      const a = coarse[i - 2] as (typeof path)[number];
      const b = coarse[i - 1] as (typeof path)[number];
      const c = coarse[i] as (typeof path)[number];
      const h0 = Math.atan2(b.p[2] - a.p[2], b.p[0] - a.p[0]);
      const h1 = Math.atan2(c.p[2] - b.p[2], c.p[0] - b.p[0]);
      let d = h1 - h0;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      //한 마디에서 60° 넘게 꺾이지 않는다
      expect(Math.abs(d)).toBeLessThan(Math.PI / 3);
      heading += d;
    }
    expect(Math.abs(heading)).toBeGreaterThan((120 * Math.PI) / 180);
  });

  it('진행·단면·면 법선은 단위 벡터로 서로 직교하고, 단면 안쪽은 원화 안쪽과 같은 쪽', () => {
    path.forEach((pt) => {
      expect(Math.hypot(...pt.tangent)).toBeCloseTo(1, 6);
      expect(Math.hypot(...pt.cross)).toBeCloseTo(1, 6);
      expect(pt.tangent[0] * pt.cross[0] + pt.tangent[1] * pt.cross[1] + pt.tangent[2] * pt.cross[2]).toBeCloseTo(0, 6);
      expect(pt.normal[0] * pt.cross[0] + pt.normal[1] * pt.cross[1] + pt.normal[2] * pt.cross[2]).toBeCloseTo(0, 6);
      expect(pt.p[2]).toBeCloseTo(depthAt(space, pt.u), 9);
    });
    const art = arcLengthPoints(config.path.points, 128);
    const mid = path[64] as (typeof path)[number];
    const t = (art[64] as (typeof art)[number]).tangent;
    const inner = screenOf([-mid.cross[0], -mid.cross[1], -mid.cross[2]], pitch);
    expect(inner[0] * t[1] - inner[1] * t[0]).toBeGreaterThan(0);
  });

  it('안쪽 끝은 띠 면 위쪽으로 말리고, 바깥은 말리지 않는다', () => {
    const pt = path[32] as (typeof path)[number];
    const inner = crossPoint(space, pt, -0.6, 0.6);
    const flat = [0, 1, 2].map((k) => (pt.p[k] as number) + (pt.cross[k] as number) * -0.6);
    const lift = [0, 1, 2].map((k) => (inner[k] as number) - (flat[k] as number));
    expect(Math.hypot(...lift)).toBeCloseTo(space.curlH, 9);
    expect(lift[1]).toBeGreaterThanOrEqual(0);
    const outer = crossPoint(space, pt, 0.3, 0.6);
    expect(outer[2]).toBeCloseTo(pt.p[2] + pt.cross[2] * 0.3, 9);
  });
});

describe('깊이별 물방울', () => {
  const drops = spaceDroplets(config, space, pitch);

  it('층마다 정한 수만큼, 씨앗이 같으면 같은 자리', () => {
    expect(drops.length).toBe(space.droplets.layers.reduce((n, l) => n + l.count, 0));
    expect(spaceDroplets(config, space, pitch)).toEqual(drops);
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
  const sources = rippleSources(config, space, pitch);

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
