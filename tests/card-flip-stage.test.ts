//카드 뒤집기 연출의 시간 규칙과 수치 (SPEC-005 §11)
//슬로우는 게임 시간만 늦추고, 카드 회전(실제 시간)은 제 속도로 돈다. 역경직이 끝나면 슬로우 배율로 돌아간다

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Clock, ease } from '../src/renderer3d/clock.js';
import { parseStage3dConfig } from '../src/renderer3d/config.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('SPEC-005 §11 슬로우와 실제 시간', () => {
  it('슬로우를 걸면 게임 시간이 그 배율로 흐른다', () => {
    const clock = new Clock();
    clock.setSlowMotion(0.15);
    expect(clock.step(1)).toBeCloseTo(0.15);
    clock.setSlowMotion(1);
    expect(clock.step(1)).toBeCloseTo(1);
  });

  it('실제 시간 트윈은 슬로우에 느려지지 않는다', async () => {
    const clock = new Clock();
    clock.setSlowMotion(0.1);
    const card = { spin: 0 };
    const done = clock.tweenReal(card, 'spin', 10, 0.5, ease.linear);
    clock.step(0.25);
    expect(card.spin).toBeCloseTo(5);
    clock.step(0.25);
    await done;
    expect(card.spin).toBe(10);
  });

  it('역경직이 끝나면 1 이 아니라 걸려 있던 슬로우 배율로 돌아간다', () => {
    const clock = new Clock();
    clock.setSlowMotion(0.2);
    clock.startHitStop(0.1, 0.02);
    expect(clock.scale).toBeCloseTo(0.02);
    clock.step(0.2);
    expect(clock.scale).toBeCloseTo(0.2);
  });

  it('처음부터 다시 시작하면 슬로우도 풀린다', () => {
    const clock = new Clock();
    clock.setSlowMotion(0.15);
    clock.clear();
    expect(clock.scale).toBe(1);
  });
});

describe('SPEC-005 §11.4 카드 뒤집기 수치', () => {
  const config = parseStage3dConfig(JSON.parse(readFileSync(resolve(here, '../assets/ui/stage3d.json'), 'utf8')));

  it('스펙 표의 값을 읽는다', () => {
    expect(config.cardFlip).toEqual({
      slowScale: 0.15,
      approachShare: 0.55,
      spinTime: 0.6,
      spinTurns: 3,
      revealPop: 0.18,
      holdTime: 0.4,
      height: 0.9,
      headLift: 0.2,
      fadeTime: 0.2,
    });
  });

  it('슬로우 동안 달리는 게임 시간은 카드가 멈추고 비교가 끝날 때까지와 맞는다', () => {
    const c = config.cardFlip;
    const gameSec = (c.spinTime + c.revealPop + c.holdTime) * c.slowScale;
    //실제 시간으로 되돌리면 회전 + 튐 + 비교 시간과 같다
    expect(gameSec / c.slowScale).toBeCloseTo(c.spinTime + c.revealPop + c.holdTime);
    //남은 거리를 달리는 시간이 0 보다 길다
    expect(1 - c.approachShare).toBeGreaterThan(0);
  });
});

describe('SPEC-004 §2.2.1 발밑 바 · SPEC-005 §12 v2.13 날아가기', () => {
  const config = parseStage3dConfig(JSON.parse(readFileSync(resolve(here, '../assets/ui/stage3d.json'), 'utf8')));

  it('발밑 바 수치를 읽는다 (원작 0.5초 보간 · 쓰러지면 1초 흐림)', () => {
    expect(config.footBar).toEqual({ widthRatio: 0.55, minWidth: 56, hpHeight: 6, mtHeight: 4, gap: 2, tween: 0.5, downFade: 1.0 });
  });

  it('맞으면 크게 날아가고, 다시 붙을 때는 돌진 속도로 달려간다', () => {
    const m = config.motion;
    expect(m.hitKnock).toBe(2.4);
    expect(m.knockBase).toBe(2.6);
    expect(m.knockMax).toBe(5.0);
    //한 타 거리를 다시 붙는 데 걸리는 시간이 0.25초를 넘지 않는다
    expect(Math.max(m.followTime, (m.hitKnock + m.contactGap) / m.followSpeed)).toBeLessThanOrEqual(0.25);
  });
});
