//적이 낼 카드를 고른다. SPEC §13 의 가중 랜덤 규칙을 구현한 것
//가중치 수치는 전부 battle-data.json 의 enemyAi 블록에서 온다

import type { ClashResolver } from './clash.js';
import type { Combatant } from './combatant.js';
import type { BattleCatalog } from './data.js';
import type { Rng } from './rng.js';
import type { SkillData } from './types.js';

//카드를 고르는 데 필요한 바깥 정보. 피해 기대값은 합 판정기의 계산식을 그대로 빌려 쓴다
export interface EnemyAiContext {
  catalog: BattleCatalog;
  resolver: ClashResolver;
  rng: Rng;
}

export interface EnemyAi {
  //적 한 명이 이번 합에 낼 카드를 고른다
  chooseSkill(enemy: Combatant, opponents: readonly Combatant[], context: EnemyAiContext): number;
}

//덱이 비었을 때 던진다. 데이터 누락이라 조용히 넘기면 안 된다
function requireDeck(enemy: Combatant): readonly number[] {
  if (enemy.deck.length === 0) {
    throw new Error(`적 ${enemy.id} 의 덱이 비어 있다`);
  }
  return enemy.deck;
}

//가중치에 비례해 한 장을 뽑는다. 가중치가 전부 0이면 균등 추첨으로 되돌린다
function pickWeighted(deck: readonly number[], weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const last = deck[deck.length - 1]!;
  if (total <= 0) {
    return deck[Math.floor(rng.next() * deck.length)] ?? last;
  }

  let roll = rng.next() * total;
  for (let i = 0; i < deck.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return deck[i] ?? last;
  }
  //난수가 1 에 아주 가까울 때를 대비한 마감
  return last;
}

//방어형 카드인지 본다. 원형 유틸이 방어 담당이다
function isDefensive(skill: SkillData): boolean {
  return skill.archetype === '유틸';
}

export class WeightedEnemyAi implements EnemyAi {
  chooseSkill(enemy: Combatant, opponents: readonly Combatant[], context: EnemyAiContext): number {
    const deck = requireDeck(enemy);
    const ai = context.catalog.enemyAi;

    const hpRatio = enemy.hp / enemy.base.maxHp;
    const inHpDanger = hpRatio <= ai.hpDangerRatio;
    const inMentalityDanger = context.resolver.effectiveMentality(enemy) <= ai.mentalityDangerThreshold;
    const threat = this.estimateThreat(enemy, opponents, context);
    const underThreat = threat >= ai.threatRatio;

    const weights = deck.map((skillId) => {
      const skill = context.catalog.skill(skillId);
      let weight = 1;

      //체력이 위태로우면 버티는 카드를 우선한다
      if (inHpDanger && isDefensive(skill)) weight *= ai.hpDangerDefensiveBonus;

      //정신력이 낮으면 코인이 거의 안 붙으니 고정피해 위주 카드가 낫다
      if (inMentalityDanger) weight *= ai.mentalityDangerArchetypeWeight[skill.archetype];

      //상대 한 방이 크면 역시 버티는 쪽으로 기운다
      if (underThreat && isDefensive(skill)) weight *= ai.threatDefensiveBonus;

      //이미 걸어둔 중첩 불가 상태이상을 또 거는 카드는 값어치가 떨어진다
      if (this.isRedundantStatus(skill, opponents, context)) weight *= ai.redundantStatusPenalty;

      return weight;
    });

    return pickWeighted(deck, weights, context.rng);
  }

  //상대 덱의 기대 피해를 내 체력으로 나눈 위협도. 실제로 낼 카드는 보지 않는다
  private estimateThreat(
    enemy: Combatant,
    opponents: readonly Combatant[],
    context: EnemyAiContext,
  ): number {
    if (enemy.hp <= 0) return 0;

    const { resolver, catalog } = context;
    const defenseLevel = resolver.effectiveDefLevel(enemy);
    const estimates: number[] = [];

    for (const opponent of opponents) {
      const probability = resolver.coinProbability(opponent);
      const levelBonus = resolver.levelDiffBonus(opponent.base.atkLevel, defenseLevel);
      for (const skillId of opponent.deck) {
        const skill = catalog.skill(skillId);
        estimates.push(skill.baseDamage + opponent.base.maxCoin * skill.coinPower * probability + levelBonus);
      }
    }

    if (estimates.length === 0) return 0;
    const average = estimates.reduce((sum, v) => sum + v, 0) / estimates.length;
    return average / enemy.hp;
  }

  //승리 효과가 중첩 불가 상태이상 부여인데 상대가 이미 갖고 있는지 본다
  private isRedundantStatus(
    skill: SkillData,
    opponents: readonly Combatant[],
    context: EnemyAiContext,
  ): boolean {
    const onWin = skill.effect.onWin;
    if (onWin?.type !== 'applyStatus' || onWin.target !== 'opponent') return false;
    if (context.catalog.status(onWin.status).stackable) return false;
    return opponents.some((opponent) => opponent.hasStatus(onWin.status));
  }
}

//덱에서 아무 카드나 뽑는다. 가중치를 끄고 비교할 때 쓴다
export class RandomEnemyAi implements EnemyAi {
  chooseSkill(enemy: Combatant, _opponents: readonly Combatant[], context: EnemyAiContext): number {
    const deck = requireDeck(enemy);
    return deck[Math.floor(context.rng.next() * deck.length)] ?? deck[deck.length - 1]!;
  }
}
