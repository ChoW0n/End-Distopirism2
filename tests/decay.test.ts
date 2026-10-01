//휘두르기 잔흔 지우기 곡선 (SPEC-005 §12.5)

import { describe, expect, it } from 'vitest';
import { decayDurations } from '../src/render/decay.js';

describe('잔흔 장 시간 다시 나누기', () => {
  const s1 = Array(13).fill(60) as number[];
  const d = decayDurations(s1, 2);

  it('합은 납품 그대로다', () => {
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(780, 6);
  });

  it('앞 장이 길고 뒤 장으로 갈수록 짧아진다', () => {
    for (let i = 1; i < d.length; i++) expect(d[i] as number).toBeLessThan(d[i - 1] as number);
    expect(d[0]).toBeCloseTo(216.3, 0);
    expect(d[12]).toBeCloseTo(30.4, 0);
  });

  it('k = 1 이면 납품 그대로', () => {
    expect(decayDurations(s1, 1)).toEqual(s1);
  });
});
