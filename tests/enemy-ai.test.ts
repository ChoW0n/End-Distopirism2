//적 AI 가 SPEC §13 의 가중치대로 선택 분포를 바꾸는지 본다
//난수가 섞인 부분이라 한 번의 선택이 아니라 여러 번 돌린 분포로 확인한다

import { describe, expect, it } from 'vitest';
import { RandomEnemyAi, WeightedEnemyAi, type EnemyAiContext } from '../src/domain/ai.js';
import { createSeededRng } from '../src/domain/rng.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver } from './helpers.js';
import type { Combatant } from '../src/domain/combatant.js';
import type { Rng } from '../src/domain/rng.js';

//방어 태세 1장 + 공격 카드 2장으로 이루어진 덱
const deck = [1006, 1001, 1004];

//AI 가 쓸 바깥 정보를 만든다
function makeContext(rng: Rng, members: Combatant[]): EnemyAiContext {
  return { catalog, resolver: makeResolver(rng, members), rng };
}

//같은 상황에서 여러 번 골라 카드별 선택 횟수를 센다
function sample(enemy: Combatant, opponent: Combatant, seed: number, times = 2000): Map<number, number> {
  const rng = createSeededRng(seed);
  const ai = new WeightedEnemyAi();
  const context = makeContext(rng, [enemy, opponent]);
  const counts = new Map<number, number>();

  for (let i = 0; i < times; i += 1) {
    const picked = ai.chooseSkill(enemy, [opponent], context);
    counts.set(picked, (counts.get(picked) ?? 0) + 1);
  }
  return counts;
}

describe('§13.2 인자 1 — 체력', () => {
  it('체력이 30% 이하로 떨어지면 방어 태세를 더 자주 고른다', () => {
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);

    const healthy = makeCombatant('e', 'main', 'enemy', deck);
    const healthyPicks = sample(healthy, opponent, 11).get(1006) ?? 0;

    const wounded = makeCombatant('e2', 'main', 'enemy', deck);
    wounded.hp = Math.floor(wounded.base.maxHp * 0.2);
    const woundedPicks = sample(wounded, opponent, 11).get(1006) ?? 0;

    expect(woundedPicks).toBeGreaterThan(healthyPicks);
  });
});

describe('§13.2 인자 2 — 정신력', () => {
  it('정신력이 40 이하면 도박 카드를 덜 고르고 안정 카드를 더 고른다', () => {
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);
    //안정(무모한 일격) / 도박(강력한 한 방) 두 장만 두고 비교한다
    const pair = [1002, 1004];

    const calm = makeCombatant('e', 'main', 'enemy', pair);
    const calmCounts = sample(calm, opponent, 23);

    const shaken = makeCombatant('e2', 'main', 'enemy', pair);
    shaken.mentality = 30;
    const shakenCounts = sample(shaken, opponent, 23);

    expect(shakenCounts.get(1002) ?? 0).toBeGreaterThan(calmCounts.get(1002) ?? 0);
    expect(shakenCounts.get(1004) ?? 0).toBeLessThan(calmCounts.get(1004) ?? 0);
  });

  it('혼란이 걸려 있으면 실효 정신력 기준으로 판단한다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    enemy.mentality = 55;
    enemy.applyStatus('confusion', 1, false);

    const resolver = makeResolver(alwaysFailRng, [enemy]);
    //55 - 20 = 35 라 정신력 위험 구간에 들어간다
    expect(resolver.effectiveMentality(enemy)).toBe(35);
    expect(resolver.effectiveMentality(enemy)).toBeLessThanOrEqual(
      catalog.enemyAi.mentalityDangerThreshold,
    );
  });
});

describe('§13.3 중복 상태이상 감점', () => {
  it('상대가 이미 독이면 독 바르기를 덜 고른다', () => {
    const cleanTarget = makeCombatant('a', 'main', 'ally', [1001]);
    const poisonedTarget = makeCombatant('a2', 'main', 'ally', [1001]);
    poisonedTarget.applyStatus('poison', 3, false);

    //독 바르기(중첩 불가) 와 연속 찌르기(출혈, 중첩 가능) 를 나란히 둔다
    const enemyA = makeCombatant('e', 'main', 'enemy', [1005, 1003]);
    const enemyB = makeCombatant('e2', 'main', 'enemy', [1005, 1003]);

    const before = sample(enemyA, cleanTarget, 41).get(1005) ?? 0;
    const after = sample(enemyB, poisonedTarget, 41).get(1005) ?? 0;

    expect(after).toBeLessThan(before);
  });

  it('중첩 가능한 출혈은 이미 걸려 있어도 감점하지 않는다', () => {
    const cleanTarget = makeCombatant('a', 'main', 'ally', [1001]);
    const bleedingTarget = makeCombatant('a2', 'main', 'ally', [1001]);
    bleedingTarget.applyStatus('bleed', 3, true);

    const enemyA = makeCombatant('e', 'main', 'enemy', [1003, 1001]);
    const enemyB = makeCombatant('e2', 'main', 'enemy', [1003, 1001]);

    expect(sample(enemyB, bleedingTarget, 57).get(1003) ?? 0).toBe(
      sample(enemyA, cleanTarget, 57).get(1003) ?? 0,
    );
  });
});

describe('재현성과 방어적 동작', () => {
  it('같은 씨앗이면 항상 같은 선택을 한다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);

    const first = [...sample(enemy, opponent, 99, 50).entries()].sort();
    const second = [...sample(enemy, opponent, 99, 50).entries()].sort();
    expect(first).toEqual(second);
  });

  it('덱에 없는 카드는 절대 고르지 않는다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);

    for (const picked of sample(enemy, opponent, 5, 200).keys()) {
      expect(deck).toContain(picked);
    }
  });

  it('덱이 비어 있으면 던진다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', []);
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);
    const context = makeContext(createSeededRng(1), [enemy, opponent]);

    expect(() => new WeightedEnemyAi().chooseSkill(enemy, [opponent], context)).toThrow();
    expect(() => new RandomEnemyAi().chooseSkill(enemy, [opponent], context)).toThrow();
  });
});
