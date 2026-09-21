//합(클래시) 한 판을 실행한다. SPEC §4 의 수치 규칙과 §6 의 타이밍 순서가 전부 여기 들어 있다
//상태를 바꾸고 무슨 일이 있었는지를 이벤트 목록으로 내보낸다. 렌더러는 건드리지 않는다

import type { BattleCatalog } from './data.js';
import type { Combatant } from './combatant.js';
import type { Rng } from './rng.js';
import type {
  BattleEvent,
  MentalityReason,
  SkillData,
  SkillEffectBody,
  StatusId,
} from './types.js';

//합을 실행하는 데 필요한 바깥 정보. 사기 진작이 아군 전체를 건드려서 진영 조회가 필요하다
export interface ClashContext {
  alliesOf(combatant: Combatant): Combatant[];
}

//코인을 굴린 결과
interface CoinRoll {
  rolls: boolean[];
  successCount: number;
  probability: number;
}

//교전이 끝났을 때의 승패 정보. 교착 3회로 끝나면 승자가 없어서 null 이 된다
interface ClashOutcome {
  winner: Combatant;
  loser: Combatant;
  winnerSkill: SkillData;
  //일방 공격은 맞는 쪽이 카드를 내지 않아서 없다 (SPEC §4.7)
  loserSkill: SkillData | null;
  damage: number;
  successCount: number;
}

//효과 덩어리가 원하는 종류인지 확인하고 맞을 때만 돌려준다
function bodyOfType<T extends SkillEffectBody['type']>(
  body: SkillEffectBody | undefined,
  type: T,
): Extract<SkillEffectBody, { type: T }> | undefined {
  if (body?.type !== type) return undefined;
  return body as Extract<SkillEffectBody, { type: T }>;
}

//카드가 이 승패 상황에서 발동시키는 효과를 꺼낸다. always 는 승패와 무관하게 먼저 걸린다
//v2.0 전용기는 효과가 없어서 대부분 undefined 가 나온다
function effectBody(skill: SkillData, role: 'win' | 'lose'): SkillEffectBody | undefined {
  if (skill.effect?.always) return skill.effect.always;
  return role === 'win' ? skill.effect?.onWin : skill.effect?.onLose;
}

export class ClashResolver {
  //데이터 조회표와 난수원을 받아 둔다. 둘 다 바깥에서 주입해야 테스트가 가능하다
  constructor(
    private readonly catalog: BattleCatalog,
    private readonly rng: Rng,
    private readonly context: ClashContext,
  ) {}

  //혼란을 반영한 실효 정신력. 실제 수치는 깎지 않고 계산할 때만 낮춘다
  effectiveMentality(combatant: Combatant): number {
    const penalty = combatant.hasStatus('confusion') ? this.catalog.rules.confusionPenalty : 0;
    return Math.max(0, combatant.mentality - penalty);
  }

  //코인 1개가 성공할 확률. 정신력 100 이면 0.6, 0 이면 0 이다
  coinProbability(combatant: Combatant): number {
    const rules = this.catalog.rules;
    return rules.coinBaseProbability * (this.effectiveMentality(combatant) / rules.mentalityMax);
  }

  //방어력감소를 반영한 실효 방어레벨
  effectiveDefLevel(combatant: Combatant): number {
    if (!combatant.hasStatus('defenseDown')) return combatant.base.defLevel;
    const multiplier = this.catalog.status('defenseDown').effect.defenseMultiplier ?? 1;
    return Math.floor(combatant.base.defLevel * multiplier);
  }

  //레벨차 보너스. 상대 방어레벨을 기준으로 하고 조건에 못 미치면 0 이다
  levelDiffBonus(attackLevel: number, defenseLevel: number): number {
    const step = this.catalog.rules.levelDiffStep;
    if (attackLevel <= defenseLevel + step) return 0;
    return Math.floor((attackLevel - defenseLevel) / step);
  }

  //코인을 하나씩 독립적으로 굴려 성공 개수를 센다
  rollCoins(combatant: Combatant): CoinRoll {
    const probability = this.coinProbability(combatant);
    const rolls: boolean[] = [];
    for (let i = 0; i < combatant.coin; i += 1) {
      rolls.push(this.rng.next() < probability);
    }
    return { rolls, successCount: rolls.filter(Boolean).length, probability };
  }

  //합에서 겨룰 피해량을 낸다. 기본피해 + 성공코인×코인위력 + 레벨차보너스에 독을 반영한다
  calculateDamage(
    attacker: Combatant,
    defender: Combatant,
    skill: SkillData,
    successCount: number,
  ): { damage: number; levelBonus: number } {
    //화염 공격은 성공 코인 1개당 공격레벨을 올린다
    const flame = bodyOfType(skill.effect?.always, 'atkBonusPerCoin');
    const attackLevel = attacker.base.atkLevel + (flame ? successCount * flame.amount : 0);
    const levelBonus = this.levelDiffBonus(attackLevel, this.effectiveDefLevel(defender));

    let damage = skill.baseDamage + successCount * skill.coinPower + levelBonus;

    //독은 주는 쪽을 깎고 받는 쪽을 늘린다
    const poison = this.catalog.status('poison').effect;
    if (attacker.hasStatus('poison') && poison.outgoingDamagePercent !== undefined) {
      damage *= 1 + poison.outgoingDamagePercent / 100;
    }
    if (defender.hasStatus('poison') && poison.incomingDamagePercent !== undefined) {
      damage *= 1 + poison.incomingDamagePercent / 100;
    }

    return { damage: Math.max(0, Math.floor(damage)), levelBonus };
  }

  //합 한 판을 끝까지 돌린다. 코인이 떨어지거나 교착이 한도에 닿을 때까지 반복한다
  resolve(
    attacker: Combatant,
    attackerSkillId: number,
    defender: Combatant,
    defenderSkillId: number,
  ): BattleEvent[] {
    const events: BattleEvent[] = [];
    const attackerSkill = this.catalog.skill(attackerSkillId);
    const defenderSkill = this.catalog.skill(defenderSkillId);

    events.push({
      type: 'clashStart',
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerSkillId,
      defenderSkillId,
    });

    //교착 카운터는 이 합 안에서만 산다. 매칭쌍마다 따로 세는 것이 D-3 의 결정이다
    let deadlockCount = 0;
    let outcome: ClashOutcome | null = null;

    for (;;) {
      const attackerRoll = this.rollCoins(attacker);
      const defenderRoll = this.rollCoins(defender);
      events.push({
        type: 'coinRolled',
        combatantId: attacker.id,
        rolls: attackerRoll.rolls,
        successCount: attackerRoll.successCount,
        probability: attackerRoll.probability,
      });
      events.push({
        type: 'coinRolled',
        combatantId: defender.id,
        rolls: defenderRoll.rolls,
        successCount: defenderRoll.successCount,
        probability: defenderRoll.probability,
      });

      const attackerHit = this.calculateDamage(attacker, defender, attackerSkill, attackerRoll.successCount);
      const defenderHit = this.calculateDamage(defender, attacker, defenderSkill, defenderRoll.successCount);
      events.push({
        type: 'damageCalculated',
        combatantId: attacker.id,
        damage: attackerHit.damage,
        successCount: attackerRoll.successCount,
        levelBonus: attackerHit.levelBonus,
      });
      events.push({
        type: 'damageCalculated',
        combatantId: defender.id,
        damage: defenderHit.damage,
        successCount: defenderRoll.successCount,
        levelBonus: defenderHit.levelBonus,
      });

      //동점은 승패가 아니라 교착이다. 여기가 원본의 2분기 버그를 고친 지점이다
      if (attackerHit.damage === defenderHit.damage) {
        deadlockCount += 1;
        events.push({ type: 'deadlock', attackerId: attacker.id, defenderId: defender.id, count: deadlockCount });
        if (deadlockCount >= this.catalog.rules.deadlockLimit) {
          events.push({ type: 'deadlockLimit', attackerId: attacker.id, defenderId: defender.id });
          this.changeMentality(attacker, this.catalog.rules.mentalityOnDeadlock, 'deadlock', events);
          this.changeMentality(defender, this.catalog.rules.mentalityOnDeadlock, 'deadlock', events);
          break;
        }
        continue;
      }

      const attackerWon = attackerHit.damage > defenderHit.damage;
      const winner = attackerWon ? attacker : defender;
      const loser = attackerWon ? defender : attacker;
      const winnerHit = attackerWon ? attackerHit : defenderHit;
      const winnerRoll = attackerWon ? attackerRoll : defenderRoll;

      events.push({
        type: 'clashRoundWin',
        winnerId: winner.id,
        loserId: loser.id,
        winnerDamage: winnerHit.damage,
        loserDamage: attackerWon ? defenderHit.damage : attackerHit.damage,
      });

      loser.loseCoin();
      events.push({ type: 'coinLost', combatantId: loser.id, coin: loser.coin });
      this.changeMentality(winner, this.catalog.rules.mentalityOnClashWin, 'clashWin', events);

      //패자의 코인이 떨어지면 합이 끝나고 승자가 피해를 넣는다
      if (loser.coin <= 0) {
        outcome = {
          winner,
          loser,
          winnerSkill: attackerWon ? attackerSkill : defenderSkill,
          loserSkill: attackerWon ? defenderSkill : attackerSkill,
          damage: winnerHit.damage,
          successCount: winnerRoll.successCount,
        };
        break;
      }
    }

    if (outcome) {
      this.applyOutcome(outcome, events);
      this.applyClashEndEffects(outcome, events);
      //겨뤄서 이긴 경우에만 속성이 오른다. 재대결을 몇 번 했든 합당 1회다 (v2.0 §2.1)
      this.grantAttribute(outcome.winner, outcome.winnerSkill, events);
    }

    //피해를 다 넣고 나서 정신력이 바닥난 쪽에 혼란이 붙는다
    this.checkConfusion(attacker, events);
    this.checkConfusion(defender, events);

    events.push({
      type: 'clashEnd',
      attackerId: attacker.id,
      defenderId: defender.id,
      winnerId: outcome?.winner.id ?? null,
    });
    return events;
  }

  //턴 시작에 걸리는 지속 상태이상을 처리한다. 지금은 출혈 하나다
  //교전 단위가 아니라 턴 단위인 이유는 D-7 로 한 캐릭터가 한 턴에 여러 교전에 끼기 때문이다
  applyTurnStartStatuses(combatant: Combatant, events: BattleEvent[]): void {
    this.tickBleed(combatant, events);
  }

  //일방 공격. 겨룰 상대가 없으니 자동 승리로 보고 그대로 때린다 (SPEC §4.7)
  //코인 차감과 정신력 회복은 겨뤘을 때만 나오므로 여기서는 기본적으로 일어나지 않는다
  resolveOneSided(attacker: Combatant, skillId: number, target: Combatant): BattleEvent[] {
    const events: BattleEvent[] = [];
    const skill = this.catalog.skill(skillId);
    const rules = this.catalog.rules;

    events.push({ type: 'oneSidedStart', attackerId: attacker.id, targetId: target.id, skillId });

    const roll = this.rollCoins(attacker);
    events.push({
      type: 'coinRolled',
      combatantId: attacker.id,
      rolls: roll.rolls,
      successCount: roll.successCount,
      probability: roll.probability,
    });

    const hit = this.calculateDamage(attacker, target, skill, roll.successCount);
    events.push({
      type: 'damageCalculated',
      combatantId: attacker.id,
      damage: hit.damage,
      successCount: roll.successCount,
      levelBonus: hit.levelBonus,
    });

    if (rules.oneSidedConsumesCoin) {
      target.loseCoin();
      events.push({ type: 'coinLost', combatantId: target.id, coin: target.coin });
    }
    if (rules.oneSidedGivesMentality) {
      this.changeMentality(attacker, rules.mentalityOnClashWin, 'clashWin', events);
    }

    const outcome: ClashOutcome = {
      winner: attacker,
      loser: target,
      winnerSkill: skill,
      loserSkill: null,
      damage: hit.damage,
      successCount: roll.successCount,
    };
    this.applyOutcome(outcome, events);
    this.applyClashEndEffect(attacker, target, skill, 'win', events);

    this.checkConfusion(attacker, events);
    this.checkConfusion(target, events);

    events.push({ type: 'oneSidedEnd', attackerId: attacker.id, targetId: target.id });
    return events;
  }

  //출혈 피해를 넣는다. 중첩된 개수만큼 겹쳐서 들어간다
  private tickBleed(combatant: Combatant, events: BattleEvent[]): void {
    const stacks = combatant.stackCount('bleed');
    if (stacks === 0) return;
    const percent = this.catalog.status('bleed').effect.hpPercentDamage ?? 0;
    const damage = Math.floor((combatant.base.maxHp * percent) / 100) * stacks;
    if (damage <= 0) return;
    const applied = combatant.takeDamage(damage);
    events.push({ type: 'statusTicked', combatantId: combatant.id, status: 'bleed', damage: applied });
    this.checkDefeat(combatant, events);
  }

  //합의 최종 피해를 확정해서 넣는다. §6 의 타이밍 순서대로 효과를 얹는다
  private applyOutcome(outcome: ClashOutcome, events: BattleEvent[]): void {
    const { winner, loser, winnerSkill, loserSkill, successCount } = outcome;
    let damage = outcome.damage;

    //강력한 한 방 — 이기면 내 피해가 늘고, 지면 상대 피해가 더 크게 늘어난다
    const winnerModifier = bodyOfType(effectBody(winnerSkill, 'win'), 'damageModifier');
    if (winnerModifier?.target === 'self') damage += winnerModifier.amount;
    const loserModifier = loserSkill && bodyOfType(effectBody(loserSkill, 'lose'), 'damageModifier');
    if (loserModifier && loserModifier.target === 'opponent') damage += loserModifier.amount;

    //무모한 일격 — 내 체력을 먼저 지불하고 그만큼 추가 피해를 얻는다
    const cost = bodyOfType(effectBody(winnerSkill, 'win'), 'selfHpCost');
    if (cost) {
      const paid = winner.takeDamage(cost.amount);
      events.push({ type: 'damageApplied', combatantId: winner.id, damage: paid, hp: winner.hp });
      damage += successCount * cost.bonusDamagePerCoin;
      this.checkDefeat(winner, events);
    }

    //화염 공격 — 성공 코인 수만큼 피해가 더 붙는다
    const flame = bodyOfType(winnerSkill.effect?.always, 'atkBonusPerCoin');
    if (flame) damage += successCount * flame.bonusDamagePerCoin;

    //방어 태세 — 패배한 쪽이 냈으면 피해를 통째로 막는다
    if (loserSkill && bodyOfType(effectBody(loserSkill, 'lose'), 'nullifyDamage')) {
      events.push({ type: 'damageNullified', combatantId: loser.id, skillId: loserSkill.id });
      damage = 0;
    }

    damage = Math.max(0, Math.floor(damage));
    if (damage > 0) {
      const applied = loser.takeDamage(damage);
      events.push({ type: 'damageApplied', combatantId: loser.id, damage: applied, hp: loser.hp });
    }

    //마무리 — 피해를 넣고도 상대가 살아 있지만 빈사면 그 자리에서 처형한다
    const execute = bodyOfType(effectBody(winnerSkill, 'win'), 'execute');
    if (execute && !loser.isDefeated) {
      const threshold = (loser.base.maxHp * execute.hpThresholdPercent) / 100;
      if (loser.hp < threshold) {
        loser.takeDamage(loser.hp);
        events.push({ type: 'executed', combatantId: loser.id });
      }
    }

    //마무리 — 패배한 쪽이 냈으면 현재 정신력의 비율만큼 깎인다
    const mentalityPenalty = loserSkill && bodyOfType(effectBody(loserSkill, 'lose'), 'mentality');
    if (mentalityPenalty) {
      const delta = Math.round((loser.mentality * mentalityPenalty.percentOfCurrent) / 100);
      this.changeMentality(loser, delta, 'skill', events);
    }

    this.checkDefeat(loser, events);
  }

  //합이 끝난 뒤 발동하는 효과. 승자는 onWin, 패자는 onLose 를 각자 받는다
  private applyClashEndEffects(outcome: ClashOutcome, events: BattleEvent[]): void {
    this.applyClashEndEffect(outcome.winner, outcome.loser, outcome.winnerSkill, 'win', events);
    if (outcome.loserSkill) {
      this.applyClashEndEffect(outcome.loser, outcome.winner, outcome.loserSkill, 'lose', events);
    }
  }

  //카드 하나의 합 종료 효과를 적용한다
  private applyClashEndEffect(
    owner: Combatant,
    opponent: Combatant,
    skill: SkillData,
    role: 'win' | 'lose',
    events: BattleEvent[],
  ): void {
    if (skill.effect?.timing !== 'onClashEnd') return;
    const body = effectBody(skill, role);
    if (!body) return;

    if (body.type === 'applyStatus') {
      const target = body.target === 'self' ? owner : opponent;
      this.applyStatus(target, body.status, body.turns, events);
      return;
    }

    //사기 진작 — 진영 전체의 다음 턴 코인 회복량을 바꾼다
    if (body.type === 'nextTurnCoin') {
      for (const ally of this.context.alliesOf(owner)) {
        ally.nextTurnCoinModifier += body.amount;
      }
    }
  }

  //합 승리로 속성을 올린다. 궁극기처럼 올리는 속성이 없는 카드는 그냥 지나간다
  private grantAttribute(winner: Combatant, skill: SkillData, events: BattleEvent[]): void {
    if (!skill.attribute) return;
    const value = winner.gainAttribute(skill.attribute);
    events.push({
      type: 'attributeGained',
      combatantId: winner.id,
      attribute: skill.attribute,
      value,
    });
  }

  //상태이상을 걸고 이벤트를 남긴다. 중첩 여부는 데이터가 정한다
  applyStatus(target: Combatant, status: StatusId, turns: number, events: BattleEvent[]): void {
    const definition = this.catalog.status(status);
    target.applyStatus(status, turns, definition.stackable);
    events.push({ type: 'statusApplied', combatantId: target.id, status, turns });
  }

  //정신력이 임계치 아래로 떨어졌으면 혼란을 자동으로 건다
  private checkConfusion(combatant: Combatant, events: BattleEvent[]): void {
    if (combatant.isDefeated) return;
    if (combatant.mentality >= this.catalog.rules.confusionThreshold) return;
    if (combatant.hasStatus('confusion')) return;
    this.applyStatus(combatant, 'confusion', this.catalog.status('confusion').defaultTurns, events);
  }

  //정신력을 바꾸고 실제로 움직였을 때만 이벤트를 남긴다
  private changeMentality(
    combatant: Combatant,
    delta: number,
    reason: MentalityReason,
    events: BattleEvent[],
  ): void {
    const applied = combatant.changeMentality(delta, this.catalog.rules);
    if (applied === 0) return;
    events.push({
      type: 'mentalityChanged',
      combatantId: combatant.id,
      delta: applied,
      mentality: combatant.mentality,
      reason,
    });
  }

  //쓰러졌으면 한 번만 알린다
  private checkDefeat(combatant: Combatant, events: BattleEvent[]): void {
    if (!combatant.isDefeated) return;
    if (events.some((e) => e.type === 'defeated' && e.combatantId === combatant.id)) return;
    events.push({ type: 'defeated', combatantId: combatant.id });
  }
}
