//적 AI 가 SPEC §13 의 가중치대로 타겟과 카드를 고르는지 본다
//난수가 섞인 부분이라 한 번의 선택이 아니라 여러 번 돌린 분포로 확인한다

import { describe, expect, it } from 'vitest';
import {
  RandomEnemyAi,
  WeightedEnemyAi,
  type EnemyAiContext,
  type EnemyEngagement,
} from '../src/domain/ai.js';
import { createSeededRng } from '../src/domain/rng.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver } from './helpers.js';
import type { Combatant } from '../src/domain/combatant.js';
import type { Rng } from '../src/domain/rng.js';

//방어 태세 1장 + 공격 카드 2장으로 이루어진 덱
const deck = [1006, 1001, 1004];
const TRIALS = 3000;

//AI 가 쓸 바깥 정보를 만든다
function makeContext(rng: Rng, members: Combatant[]): EnemyAiContext {
  return { catalog, resolver: makeResolver(rng, members), rng };
}

//같은 상황에서 여러 번 골라 카드별 선택 횟수를 센다
function sampleSkills(
  enemy: Combatant,
  engagement: EnemyEngagement,
  seed: number,
  times = TRIALS,
): Map<number, number> {
  const rng = createSeededRng(seed);
  const ai = new WeightedEnemyAi();
  const context = makeContext(rng, [enemy, engagement.target]);
  const counts = new Map<number, number>();

  for (let i = 0; i < times; i += 1) {
    const picked = ai.chooseSkill(enemy, engagement, context);
    counts.set(picked, (counts.get(picked) ?? 0) + 1);
  }
  return counts;
}

//합 상황을 하나 만든다. 상대가 낼 카드를 알고 있는 상태다
function clashWith(target: Combatant, opponentSkillId: number): EnemyEngagement {
  return { target, isClash: true, opponentSkillId };
}

describe('§13.7 방어 태세 위협도 단계 가중치', () => {
  //메인 캐릭터(maxCoin 5)가 강력한 한 방을 낼 때 예상 피해는 8 + 5×0.6×3 = 17
  function enemyAt(hp: number): Combatant {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    enemy.hp = hp;
    return enemy;
  }

  it('체력이 가득 찬 적은 방어 태세를 한 번도 내지 않는다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1004]);
    //위협도 17/320 = 0.053 이라 첫 구간(<0.15)이고 가중치는 0이다
    const counts = sampleSkills(enemyAt(320), clashWith(attacker, 1004), 11);
    expect(counts.get(1006) ?? 0).toBe(0);
  });

  it('위협도가 오를수록 방어 태세 빈도가 단계적으로 오른다', () => {
    const attacker = makeCombatant('a', 'main', 'ally', [1004]);
    const engagement = clashWith(attacker, 1004);

    //위협도 17/90 = 0.19 → 가중치 0.5
    const low = sampleSkills(enemyAt(90), engagement, 23).get(1006) ?? 0;
    //위협도 17/40 = 0.43 → 가중치 2.0
    const mid = sampleSkills(enemyAt(40), engagement, 23).get(1006) ?? 0;
    //위협도 17/30 = 0.57 → 가중치 4.0
    const high = sampleSkills(enemyAt(30), engagement, 23).get(1006) ?? 0;

    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);

    //가중치 2.0 대 나머지 두 장 1.0 이면 이론상 50% 다
    expect(mid / TRIALS).toBeGreaterThan(0.4);
    //가중치 4.0 이면 이론상 66.7% 다
    expect(high / TRIALS).toBeGreaterThan(0.55);
  });

  it('일방 공격이 예상되면 빈사여도 방어 태세를 내지 않는다', () => {
    const target = makeCombatant('a', 'main', 'ally', [1004]);
    const engagement: EnemyEngagement = { target, isClash: false, opponentSkillId: null };
    const counts = sampleSkills(enemyAt(30), engagement, 31);
    expect(counts.get(1006) ?? 0).toBe(0);
  });

  it('상대 카드를 모르면 상대 덱의 평균 기대 피해로 판단한다', () => {
    //덱이 강력한 한 방 하나뿐이면 평균이 그 카드의 기대 피해와 같아진다
    const single = makeCombatant('a', 'main', 'ally', [1004]);
    const known = sampleSkills(enemyAt(40), clashWith(single, 1004), 43).get(1006) ?? 0;
    const unknown =
      sampleSkills(enemyAt(40), { target: single, isClash: true, opponentSkillId: null }, 43).get(1006) ?? 0;

    expect(unknown).toBe(known);
  });
});

describe('§13.2 정신력 계수', () => {
  it('정신력이 40 이하면 도박 카드를 덜 고르고 안정 카드를 더 고른다', () => {
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);
    //안정(무모한 일격) / 도박(강력한 한 방) 두 장만 두고 비교한다
    const pair = [1002, 1004];
    const engagement = clashWith(opponent, 1001);

    const calm = makeCombatant('e', 'main', 'enemy', pair);
    const calmCounts = sampleSkills(calm, engagement, 23);

    const shaken = makeCombatant('e2', 'main', 'enemy', pair);
    shaken.mentality = 30;
    const shakenCounts = sampleSkills(shaken, engagement, 23);

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

    const before = sampleSkills(enemyA, clashWith(cleanTarget, 1001), 41).get(1005) ?? 0;
    const after = sampleSkills(enemyB, clashWith(poisonedTarget, 1001), 41).get(1005) ?? 0;

    expect(after).toBeLessThan(before);
  });

  it('중첩 가능한 출혈은 이미 걸려 있어도 감점하지 않는다', () => {
    const cleanTarget = makeCombatant('a', 'main', 'ally', [1001]);
    const bleedingTarget = makeCombatant('a2', 'main', 'ally', [1001]);
    bleedingTarget.applyStatus('bleed', 3, true);

    const enemyA = makeCombatant('e', 'main', 'enemy', [1003, 1001]);
    const enemyB = makeCombatant('e2', 'main', 'enemy', [1003, 1001]);

    expect(sampleSkills(enemyB, clashWith(bleedingTarget, 1001), 57).get(1003) ?? 0).toBe(
      sampleSkills(enemyA, clashWith(cleanTarget, 1001), 57).get(1003) ?? 0,
    );
  });
});

describe('§13.6 타겟 선택', () => {
  //후보 중 누구를 몇 번 골랐는지 센다
  function sampleTargets(
    enemy: Combatant,
    candidates: Combatant[],
    alreadyTargeted: Set<string>,
    seed: number,
  ): Map<string, number> {
    const rng = createSeededRng(seed);
    const ai = new WeightedEnemyAi();
    const context = makeContext(rng, [enemy, ...candidates]);
    const counts = new Map<string, number>();

    for (let i = 0; i < TRIALS; i += 1) {
      const picked = ai.chooseTarget(enemy, candidates, alreadyTargeted, context);
      counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    return counts;
  }

  it('빈사인 아군을 더 자주 겨눈다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const healthy = makeCombatant('a1', 'main', 'ally', [1001]);
    const wounded = makeCombatant('a2', 'main', 'ally', [1001]);
    wounded.hp = Math.floor(wounded.base.maxHp * 0.2);

    const counts = sampleTargets(enemy, [healthy, wounded], new Set(), 7);
    //가중치 1.0 대 1.8 이라 이론상 36% 대 64% 다
    expect(counts.get('a2') ?? 0).toBeGreaterThan(counts.get('a1') ?? 0);
    expect((counts.get('a2') ?? 0) / TRIALS).toBeGreaterThan(0.55);
  });

  it('이미 다른 적이 고른 아군은 덜 겨눈다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const first = makeCombatant('a1', 'main', 'ally', [1001]);
    const second = makeCombatant('a2', 'main', 'ally', [1001]);

    const even = sampleTargets(enemy, [first, second], new Set(), 13);
    const skewed = sampleTargets(enemy, [first, second], new Set(['a1']), 13);

    //체력이 같으면 반반이어야 한다
    expect(Math.abs((even.get('a1') ?? 0) - (even.get('a2') ?? 0)) / TRIALS).toBeLessThan(0.05);
    //이미 고른 쪽은 0.5 배라 이론상 33% 로 떨어진다
    expect((skewed.get('a1') ?? 0) / TRIALS).toBeLessThan(0.4);
  });

  it('쓰러진 아군은 후보에 들어오지 않는다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const alive = makeCombatant('a1', 'main', 'ally', [1001]);
    const counts = sampleTargets(enemy, [alive], new Set(), 17);
    expect([...counts.keys()]).toEqual(['a1']);
  });
});

describe('재현성과 방어적 동작', () => {
  it('같은 씨앗이면 항상 같은 선택을 한다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);
    const engagement = clashWith(opponent, 1001);

    const first = [...sampleSkills(enemy, engagement, 99, 50).entries()].sort();
    const second = [...sampleSkills(enemy, engagement, 99, 50).entries()].sort();
    expect(first).toEqual(second);
  });

  it('덱에 없는 카드는 절대 고르지 않는다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy', deck);
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);

    for (const picked of sampleSkills(enemy, clashWith(opponent, 1001), 5, 500).keys()) {
      expect(deck).toContain(picked);
    }
  });

  it('덱이 비었거나 겨눌 대상이 없으면 던진다', () => {
    const empty = makeCombatant('e', 'main', 'enemy', []);
    const opponent = makeCombatant('a', 'main', 'ally', [1001]);
    const context = makeContext(createSeededRng(1), [empty, opponent]);
    const engagement = clashWith(opponent, 1001);

    expect(() => new WeightedEnemyAi().chooseSkill(empty, engagement, context)).toThrow();
    expect(() => new RandomEnemyAi().chooseSkill(empty, engagement, context)).toThrow();
    expect(() => new WeightedEnemyAi().chooseTarget(empty, [], new Set(), context)).toThrow();
  });
});
