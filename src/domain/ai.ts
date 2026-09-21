//적의 타겟과 카드를 고른다. SPEC §13 의 가중 랜덤 규칙을 구현한 것
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

//이번 턴에 이 적이 하게 될 교전. 매칭 판정이 끝난 뒤에 정해진다
export interface EnemyEngagement {
  //때릴 상대
  target: Combatant;
  //겨루는 합인지. false 면 일방 공격이라 방어할 게 없다
  isClash: boolean;
  //합 상대가 이미 고른 카드. 모르면 상대 덱 평균으로 대체한다
  opponentSkillId: number | null;
}

export interface EnemyAi {
  //턴 시작에 아군 한 명을 타겟으로 고른다
  chooseTarget(
    enemy: Combatant,
    candidates: readonly Combatant[],
    alreadyTargeted: ReadonlySet<string>,
    context: EnemyAiContext,
  ): string;

  //매칭 판정이 끝난 뒤 이번 교전에 낼 카드를 고른다
  chooseSkill(enemy: Combatant, engagement: EnemyEngagement, context: EnemyAiContext): number;
}

//덱이 비었을 때 던진다. 데이터 누락이라 조용히 넘기면 안 된다
function requireDeck(enemy: Combatant): readonly number[] {
  if (enemy.deck.length === 0) {
    throw new Error(`적 ${enemy.id} 의 덱이 비어 있다`);
  }
  return enemy.deck;
}

//수치가 아직 없는 카드는 고르지 않는다. 궁극기가 여기 해당한다 (v2.0 §3.2)
//전부 미정이면 어쩔 수 없이 덱 전체를 후보로 되돌린다
function selectableDeck(enemy: Combatant, catalog: BattleCatalog): readonly number[] {
  const deck = requireDeck(enemy);
  const usable = deck.filter((id) => !catalog.skill(id).tbd);
  return usable.length > 0 ? usable : deck;
}

//후보가 비었을 때 던진다
function requireCandidates(enemy: Combatant, candidates: readonly Combatant[]): readonly Combatant[] {
  if (candidates.length === 0) {
    throw new Error(`적 ${enemy.id} 가 겨눌 대상이 없다`);
  }
  return candidates;
}

//가중치에 비례해 하나를 뽑는다. 가중치가 전부 0이면 균등 추첨으로 되돌린다
function pickWeighted<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  const last = items[items.length - 1]!;
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return items[Math.floor(rng.next() * items.length)] ?? last;
  }

  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return items[i] ?? last;
  }
  //난수가 1 에 아주 가까울 때를 대비한 마감
  return last;
}

//방어형 카드인지 본다. 원형 유틸이 방어 담당이다
function isDefensive(skill: SkillData): boolean {
  return skill.archetype === '유틸';
}

export class WeightedEnemyAi implements EnemyAi {
  //빈사인 아군에 몰리되, 이미 다른 적이 고른 아군은 덜 고른다 (§13.6)
  chooseTarget(
    enemy: Combatant,
    candidates: readonly Combatant[],
    alreadyTargeted: ReadonlySet<string>,
    context: EnemyAiContext,
  ): string {
    const alive = requireCandidates(enemy, candidates);
    const ai = context.catalog.enemyAi;

    const weights = alive.map((ally) => {
      const hpRatio = ally.hp / ally.base.maxHp;
      let weight = 1 + ai.aiTargetLowHpBias * (1 - hpRatio);
      if (alreadyTargeted.has(ally.id)) weight *= ai.aiTargetDuplicatePenalty;
      return weight;
    });

    return pickWeighted(alive, weights, context.rng).id;
  }

  //카드를 고른다. 방어 태세만 위협도 단계 가중치를 따로 받는다 (§13.1)
  chooseSkill(enemy: Combatant, engagement: EnemyEngagement, context: EnemyAiContext): number {
    const deck = selectableDeck(enemy, context.catalog);
    const ai = context.catalog.enemyAi;
    const guardWeight = this.guardWeight(enemy, engagement, context);
    const inMentalityDanger =
      context.resolver.effectiveMentality(enemy) <= ai.mentalityDangerThreshold;

    const weights = deck.map((skillId) => {
      const skill = context.catalog.skill(skillId);
      let weight = isDefensive(skill) ? guardWeight : 1;

      //정신력이 낮으면 코인이 거의 안 붙으니 고정피해 위주 카드가 낫다
      if (inMentalityDanger) weight *= ai.mentalityDangerArchetypeWeight[skill.archetype];

      //이미 걸어둔 중첩 불가 상태이상을 또 거는 카드는 값어치가 떨어진다
      if (this.isRedundantStatus(skill, engagement.target, context)) weight *= ai.redundantStatusPenalty;

      return weight;
    });

    return pickWeighted(deck, weights, context.rng);
  }

  //방어 태세의 가중치. 위협도가 어느 구간에 드는지로 정해진다 (§13.7)
  private guardWeight(enemy: Combatant, engagement: EnemyEngagement, context: EnemyAiContext): number {
    const ai = context.catalog.enemyAi;
    //겨룰 상대가 없으면 방어할 게 없다
    if (!engagement.isClash) return 0;

    const threat = this.estimateThreat(enemy, engagement, context);
    let band = 0;
    for (const threshold of ai.aiGuardThreatThresholds) {
      if (threat >= threshold) band += 1;
    }
    return ai.aiGuardWeights[band] ?? 0;
  }

  //위협도 = 상대 예상 피해 / 내 현재 HP. 상대가 낸 카드를 알면 그걸 쓰고 모르면 덱 평균이다
  private estimateThreat(
    enemy: Combatant,
    engagement: EnemyEngagement,
    context: EnemyAiContext,
  ): number {
    if (enemy.hp <= 0) return 0;

    const { catalog } = context;
    const opponent = engagement.target;
    const probability = catalog.rules.coinBaseProbability;
    const expect = (skill: SkillData): number =>
      skill.baseDamage + opponent.base.maxCoin * probability * skill.coinPower;

    if (engagement.opponentSkillId !== null) {
      return expect(catalog.skill(engagement.opponentSkillId)) / enemy.hp;
    }

    if (opponent.deck.length === 0) return 0;
    const average =
      opponent.deck.reduce((sum, id) => sum + expect(catalog.skill(id)), 0) / opponent.deck.length;
    return average / enemy.hp;
  }

  //승리 효과가 중첩 불가 상태이상 부여인데 상대가 이미 갖고 있는지 본다
  private isRedundantStatus(skill: SkillData, target: Combatant, context: EnemyAiContext): boolean {
    const onWin = skill.effect?.onWin;
    if (onWin?.type !== 'applyStatus' || onWin.target !== 'opponent') return false;
    if (context.catalog.status(onWin.status).stackable) return false;
    return target.hasStatus(onWin.status);
  }
}

//전부 균등하게 고른다. 가중치를 끄고 비교할 때 쓴다
export class RandomEnemyAi implements EnemyAi {
  chooseTarget(
    enemy: Combatant,
    candidates: readonly Combatant[],
    _alreadyTargeted: ReadonlySet<string>,
    context: EnemyAiContext,
  ): string {
    const alive = requireCandidates(enemy, candidates);
    return (alive[Math.floor(context.rng.next() * alive.length)] ?? alive[alive.length - 1]!).id;
  }

  chooseSkill(enemy: Combatant, _engagement: EnemyEngagement, context: EnemyAiContext): number {
    const deck = requireDeck(enemy);
    return deck[Math.floor(context.rng.next() * deck.length)] ?? deck[deck.length - 1]!;
  }
}
