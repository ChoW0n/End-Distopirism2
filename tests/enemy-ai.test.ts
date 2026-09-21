//적 AI 가 SPEC-001 §13 의 가중치대로 타겟과 카드를 고르는지 본다
//난수가 섞인 부분이라 한 번의 선택이 아니라 여러 번 돌린 분포로 확인한다
//
//v2.0 에서 방어 태세(원형 유틸)가 사라져 §13.7 위협도 단계 가중치는 걸릴 카드가 없다.
//가중치 코드와 데이터는 그대로 두되, 여기서는 실제로 동작하는 인자만 검증한다

import { describe, expect, it } from 'vitest';
import {
  RandomEnemyAi,
  WeightedEnemyAi,
  type EnemyAiContext,
  type EnemyEngagement,
} from '../src/domain/ai.js';
import { createSeededRng } from '../src/domain/rng.js';
import { alwaysFailRng, catalog, makeCombatant, makeResolver, skillOf } from './helpers.js';
import type { Combatant } from '../src/domain/combatant.js';
import type { Rng } from '../src/domain/rng.js';

const MAIN_S1 = skillOf('main', 'S1');
const MAIN_S2 = skillOf('main', 'S2');
const MAIN_S3 = skillOf('main', 'S3');
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

describe('§13.2 정신력 계수', () => {
  it('정신력이 40 이하면 안정 전용기를 더 고르고 표준을 덜 고른다', () => {
    //S1·S3 는 안정(계수 2.0), S2 는 표준(계수 1.2)
    expect(catalog.skill(MAIN_S1).archetype).toBe('안정');
    expect(catalog.skill(MAIN_S2).archetype).toBe('표준');

    const opponent = makeCombatant('a', 'main', 'ally');
    const engagement = clashWith(opponent, MAIN_S1);

    const calm = makeCombatant('e', 'main', 'enemy');
    const calmCounts = sampleSkills(calm, engagement, 23);

    const shaken = makeCombatant('e2', 'main', 'enemy');
    shaken.mentality = 30;
    const shakenCounts = sampleSkills(shaken, engagement, 23);

    expect(shakenCounts.get(MAIN_S1) ?? 0).toBeGreaterThan(calmCounts.get(MAIN_S1) ?? 0);
    expect(shakenCounts.get(MAIN_S2) ?? 0).toBeLessThan(calmCounts.get(MAIN_S2) ?? 0);
  });

  it('정신력이 멀쩡하면 전용기 3종이 고르게 나온다', () => {
    const opponent = makeCombatant('a', 'main', 'ally');
    const enemy = makeCombatant('e', 'main', 'enemy');
    const counts = sampleSkills(enemy, clashWith(opponent, MAIN_S1), 71);

    for (const id of [MAIN_S1, MAIN_S2, MAIN_S3]) {
      expect(Math.abs((counts.get(id) ?? 0) / TRIALS - 1 / 3)).toBeLessThan(0.05);
    }
  });

  it('혼란이 걸려 있으면 실효 정신력 기준으로 판단한다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy');
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
    const enemy = makeCombatant('e', 'main', 'enemy');
    const healthy = makeCombatant('a1', 'main', 'ally');
    const wounded = makeCombatant('a2', 'main', 'ally');
    wounded.hp = Math.floor(wounded.base.maxHp * 0.2);

    const counts = sampleTargets(enemy, [healthy, wounded], new Set(), 7);
    //가중치 1.0 대 1.8 이라 이론상 36% 대 64% 다
    expect(counts.get('a2') ?? 0).toBeGreaterThan(counts.get('a1') ?? 0);
    expect((counts.get('a2') ?? 0) / TRIALS).toBeGreaterThan(0.55);
  });

  it('이미 다른 적이 고른 아군은 덜 겨눈다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy');
    const first = makeCombatant('a1', 'main', 'ally');
    const second = makeCombatant('a2', 'main', 'ally');

    const even = sampleTargets(enemy, [first, second], new Set(), 13);
    const skewed = sampleTargets(enemy, [first, second], new Set(['a1']), 13);

    //체력이 같으면 반반이어야 한다
    expect(Math.abs((even.get('a1') ?? 0) - (even.get('a2') ?? 0)) / TRIALS).toBeLessThan(0.05);
    //이미 고른 쪽은 0.5 배라 이론상 33% 로 떨어진다
    expect((skewed.get('a1') ?? 0) / TRIALS).toBeLessThan(0.4);
  });

  it('후보로 넘긴 아군만 겨눈다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy');
    const alive = makeCombatant('a1', 'main', 'ally');
    expect([...sampleTargets(enemy, [alive], new Set(), 17).keys()]).toEqual(['a1']);
  });
});

describe('재현성과 방어적 동작', () => {
  it('같은 씨앗이면 항상 같은 선택을 한다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy');
    const opponent = makeCombatant('a', 'main', 'ally');
    const engagement = clashWith(opponent, MAIN_S1);

    const first = [...sampleSkills(enemy, engagement, 99, 50).entries()].sort();
    const second = [...sampleSkills(enemy, engagement, 99, 50).entries()].sort();
    expect(first).toEqual(second);
  });

  it('자기 전용기가 아닌 카드는 절대 고르지 않는다', () => {
    const enemy = makeCombatant('e', 'main', 'enemy');
    const opponent = makeCombatant('a', 'main', 'ally');
    const deck = catalog.deckFor('main');

    for (const picked of sampleSkills(enemy, clashWith(opponent, MAIN_S1), 5, 500).keys()) {
      expect(deck).toContain(picked);
    }
  });

  it('덱이 비었거나 겨눌 대상이 없으면 던진다', () => {
    const empty = makeCombatant('e', 'main', 'enemy', []);
    const opponent = makeCombatant('a', 'main', 'ally');
    const context = makeContext(createSeededRng(1), [empty, opponent]);
    const engagement = clashWith(opponent, MAIN_S1);

    expect(() => new WeightedEnemyAi().chooseSkill(empty, engagement, context)).toThrow();
    expect(() => new RandomEnemyAi().chooseSkill(empty, engagement, context)).toThrow();
    expect(() => new WeightedEnemyAi().chooseTarget(empty, [], new Set(), context)).toThrow();
  });
});
