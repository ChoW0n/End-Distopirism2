//연출 실험 모드 수치(stage3d.json lab)가 SPEC-005 §15 를 채우는지 본다

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseStage3dConfig, Stage3dConfigError } from '../src/renderer3d/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(resolve(here, '../assets/ui/stage3d.json'), 'utf8')) as Record<string, unknown>;
const lab = parseStage3dConfig(raw).lab;

describe('연출 실험 모드 수치', () => {
  it('히트스톱은 중간 < 마지막 < 궁극기 마지막 순으로 길다 (A08)', () => {
    expect(lab.hitStop.light).toBeLessThan(lab.hitStop.heavy);
    expect(lab.hitStop.heavy).toBeLessThan(lab.hitStop.climax);
  });

  it('조사 §9 초기 튜닝값 범위 안에서 시작한다', () => {
    expect(lab.hitStop.light).toBeGreaterThanOrEqual(0.02);
    expect(lab.hitStop.light).toBeLessThanOrEqual(0.04);
    expect(lab.hitStop.heavy).toBeGreaterThanOrEqual(0.045);
    expect(lab.hitStop.heavy).toBeLessThanOrEqual(0.08);
    expect(lab.impactFrame.seconds).toBeLessThanOrEqual(0.1);
  });

  it('궁극기 베기 간격은 마지막 앞이 가장 길다 (짧게–짧게–멈춤–강하게)', () => {
    const iv = lab.ultimate.slashIntervals;
    expect(iv[iv.length - 1]).toBe(Math.max(...iv));
  });

  it('lab 절이 없으면 멈춘다', () => {
    const { lab: _lab, ...rest } = raw;
    expect(() => parseStage3dConfig(rest)).toThrow(Stage3dConfigError);
  });
});
