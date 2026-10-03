//합(클래시) 한 판을 실행한다. 카드를 뒤집어 드러난 위력으로 겨룬다 (SPEC-001 v3.0 개정 D-23)
//상태를 바꾸고 무슨 일이 있었는지를 이벤트 목록으로 내보낸다. 렌더러는 건드리지 않는다

import type { BattleCatalog } from './data.js';
import type { Combatant } from './combatant.js';
import type { Rng } from './rng.js';
import type {
  BattleEvent,
  BattleRules,
  CardFace,
  MentalityReason,
  Stance,
  SkillData,
  SkillEffectBody,
  StatusId,
} from './types.js';

//카드를 뒤집은 결과
export interface CardFlip {
  face: CardFace;
  power: number;
  //앞면이 나올 확률이었던 값
  chance: number;
}

//교전이 끝났을 때의 승패 정보. 교착 3회로 끝나면 승자가 없어서 null 이 된다
interface ClashOutcome {
  winner: Combatant;
  loser: Combatant;
  winnerSkill: SkillData;
  //일방 공격은 맞는 쪽이 카드를 내지 않아서 없다 (SPEC §4.7)
  loserSkill: SkillData | null;
  damage: number;
}

//앞면이 나올 확률. 정신력·체력 비의 가중 평균으로 카드 최소~최대 사이를 고르고, 규칙의 바닥·천장 밖으로 못 나간다 (v3.0 §2)
export function frontChanceOf(rules: BattleRules, skill: SkillData, mentality: number, hp: number, maxHp: number): number {
  const flip = rules.cardFlip;
  const mentalityRatio = mentality / rules.mentalityMax;
  const hpRatio = maxHp > 0 ? hp / maxHp : 0;
  const weightSum = flip.mentalityWeight + flip.hpWeight;
  const state = weightSum > 0 ? (flip.mentalityWeight * mentalityRatio + flip.hpWeight * hpRatio) / weightSum : 0;
  const [low, high] = skill.frontChance;
  const chance = low + (high - low) * Math.max(0, Math.min(1, state));
  return Math.max(flip.chanceFloor, Math.min(flip.chanceCeiling, chance));
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
  ) {}

  //혼란을 반영한 실효 정신력. 실제 수치는 깎지 않고 계산할 때만 낮춘다
  effectiveMentality(combatant: Combatant): number {
    const penalty = combatant.hasStatus('confusion') ? this.catalog.rules.confusionPenalty : 0;
    return Math.max(0, combatant.mentality - penalty);
  }

  //앞면이 나올 확률. 정신력·체력이 가득이면 카드 최대, 바닥이면 카드 최소다 (v3.0 §2)
  frontChance(combatant: Combatant, skill: SkillData): number {
    return frontChanceOf(this.catalog.rules, skill, this.effectiveMentality(combatant), combatant.hp, combatant.base.maxHp);
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

  //카드를 한 번 뒤집는다. 드러난 면의 위력이 이 교전의 위력이다
  //밀어붙이는 자세면 앞면 확률이 오른다 (SPEC-008 §2). steady 는 그대로라 난수 소비도 같다
  flipCard(combatant: Combatant, skill: SkillData, stance: Stance = 'steady'): CardFlip {
    const press = this.catalog.decisions?.press;
    const base = this.frontChance(combatant, skill);
    const chance = stance === 'press' && press ? Math.min(Math.max(base, press.chanceCap), base + press.frontChanceBonus) : base;
    const face: CardFace = this.rng.next() < chance ? 'front' : 'back';
    return { face, power: face === 'front' ? skill.frontPower : skill.backPower, chance };
  }

  //이긴 쪽이 넣을 피해. 드러난 위력 + 레벨차 보너스에 독을 반영한다 (v3.0 §3)
  calculateDamage(attacker: Combatant, defender: Combatant, power: number): { damage: number; levelBonus: number } {
    const levelBonus = this.levelDiffBonus(attacker.base.atkLevel, this.effectiveDefLevel(defender));
    let damage = power + levelBonus;

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

  //교전 시작에 자세를 건다. 자세 이벤트를 내고, 밀어붙이면 정신력을 먼저 치른다 (SPEC-008 §2)
  takeStance(combatant: Combatant, stance: Stance, events: BattleEvent[]): void {
    if (stance === 'steady') return;
    events.push({ type: 'stanceTaken', combatantId: combatant.id, stance });
    const press = this.catalog.decisions?.press;
    if (stance === 'press' && press && press.mentalityCost !== 0) this.changeMentality(combatant, -press.mentalityCost, 'stance', events);
  }

  //자세가 주는 피해에 거는 배수 (SPEC-008 §2)
  private dealtMultiplier(stance: Stance): number {
    const d = this.catalog.decisions;
    if (!d) return 1;
    if (stance === 'brace') return d.brace.dealtMultiplier;
    if (stance === 'allIn') return d.allIn.dealtMultiplier;
    return 1;
  }

  //자세가 받는 피해에 거는 배수 (SPEC-008 §2)
  private takenMultiplier(stance: Stance): number {
    const d = this.catalog.decisions;
    if (!d) return 1;
    if (stance === 'brace') return d.brace.takenMultiplier;
    if (stance === 'allIn') return d.allIn.takenMultiplier;
    return 1;
  }

  //자세 배수를 피해에 건다. 둘 다 1 이면 그대로 (내림)
  private stanceDamage(damage: number, dealer: Stance, receiver: Stance): number {
    const m = this.dealtMultiplier(dealer) * this.takenMultiplier(receiver);
    return m === 1 ? damage : Math.max(0, Math.floor(damage * m));
  }

  //합 한 판을 끝까지 돌린다. 코인이 떨어지거나 교착이 한도에 닿을 때까지 반복한다
  //stances: 결단 실험의 자세 (SPEC-008). 없으면 둘 다 steady
  resolve(
    attacker: Combatant,
    attackerSkillId: number,
    defender: Combatant,
    defenderSkillId: number,
    stances: { attacker?: Stance; defender?: Stance } = {},
  ): BattleEvent[] {
    const attackerStance = stances.attacker ?? 'steady';
    const defenderStance = stances.defender ?? 'steady';
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
      //양쪽이 카드를 뒤집는다. 드러난 위력끼리 겨룬다 (v3.0 §3)
      const attackerFlip = this.flipCard(attacker, attackerSkill, attackerStance);
      const defenderFlip = this.flipCard(defender, defenderSkill, defenderStance);
      this.pushFlip(attacker, attackerSkill, attackerFlip, events);
      this.pushFlip(defender, defenderSkill, defenderFlip, events);

      //위력이 같으면 교착. 다시 뒤집는다. 한도에 닿으면 피해 없이 끝난다
      if (attackerFlip.power === defenderFlip.power) {
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

      const attackerWon = attackerFlip.power > defenderFlip.power;
      const winner = attackerWon ? attacker : defender;
      const loser = attackerWon ? defender : attacker;
      const winnerFlip = attackerWon ? attackerFlip : defenderFlip;
      const loserFlip = attackerWon ? defenderFlip : attackerFlip;
      const winnerStance = attackerWon ? attackerStance : defenderStance;
      const loserStance = attackerWon ? defenderStance : attackerStance;
      const raw = this.calculateDamage(winner, loser, winnerFlip.power);
      const hit = { ...raw, damage: this.stanceDamage(raw.damage, winnerStance, loserStance) };
      events.push({
        type: 'damageCalculated',
        combatantId: winner.id,
        damage: hit.damage,
        power: winnerFlip.power,
        levelBonus: hit.levelBonus,
      });
      events.push({
        type: 'clashRoundWin',
        winnerId: winner.id,
        loserId: loser.id,
        winnerDamage: winnerFlip.power,
        loserDamage: loserFlip.power,
      });

      this.changeMentality(winner, this.catalog.rules.mentalityOnClashWin, 'clashWin', events);
      //지면 흔들린다. 합에서 진 만큼 정신력이 깎인다 (D-21)
      this.changeMentality(loser, this.catalog.rules.mentalityOnClashLose, 'clashLose', events);
      //받아내는 자세로 졌으면 버틴 만큼 정신력이 조금 돌아온다 (SPEC-008 §2)
      const brace = this.catalog.decisions?.brace;
      if (loserStance === 'brace' && brace && brace.mentalityOnLose !== 0) this.changeMentality(loser, brace.mentalityOnLose, 'stance', events);

      outcome = {
        winner,
        loser,
        winnerSkill: attackerWon ? attackerSkill : defenderSkill,
        loserSkill: attackerWon ? defenderSkill : attackerSkill,
        damage: hit.damage,
      };
      break;
    }

    if (outcome) {
      this.applyOutcome(outcome, events);
      this.applyClashEndEffects(outcome, events);
      //겨뤄서 이긴 경우에만 속성이 오른다. 다시 뒤집기를 몇 번 했든 합당 1회다 (v2.0 §2.1)
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

  //일방 공격. 겨룰 상대가 없으니 공격자만 카드를 뒤집어 드러난 위력으로 때린다 (SPEC §4.7, v3.0 §4)
  //정신력 회복은 겨뤘을 때만 나오므로 여기서는 기본적으로 일어나지 않는다
  resolveOneSided(attacker: Combatant, skillId: number, target: Combatant, stance: Stance = 'steady'): BattleEvent[] {
    const events: BattleEvent[] = [];
    const skill = this.catalog.skill(skillId);
    const rules = this.catalog.rules;

    events.push({ type: 'oneSidedStart', attackerId: attacker.id, targetId: target.id, skillId });

    const flip = this.flipCard(attacker, skill, stance);
    this.pushFlip(attacker, skill, flip, events);

    //일방 공격은 지는 경우가 없어 자세는 주는 피해에만 걸린다 (SPEC-008 §2)
    const raw = this.calculateDamage(attacker, target, flip.power);
    const hit = { ...raw, damage: this.stanceDamage(raw.damage, stance, 'steady') };
    events.push({
      type: 'damageCalculated',
      combatantId: attacker.id,
      damage: hit.damage,
      power: flip.power,
      levelBonus: hit.levelBonus,
    });

    if (rules.oneSidedGivesMentality) {
      this.changeMentality(attacker, rules.mentalityOnClashWin, 'clashWin', events);
    }

    const outcome: ClashOutcome = {
      winner: attacker,
      loser: target,
      winnerSkill: skill,
      loserSkill: null,
      damage: hit.damage,
    };
    this.applyOutcome(outcome, events);
    this.applyClashEndEffect(attacker, target, skill, 'win', events);
    //일방 공격도 속성을 올린다. 교전 대부분이 일방이라 합 승리로만 주면 궁극기가 너무 늦다 (v2.0 §2.1 D-11 개정)
    this.grantAttribute(attacker, skill, events);

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
    const { loser, winnerSkill, loserSkill } = outcome;
    let damage = outcome.damage;

    //강력한 한 방 — 이기면 내 피해가 늘고, 지면 상대 피해가 더 크게 늘어난다
    const winnerModifier = bodyOfType(effectBody(winnerSkill, 'win'), 'damageModifier');
    if (winnerModifier?.target === 'self') damage += winnerModifier.amount;
    const loserModifier = loserSkill && bodyOfType(effectBody(loserSkill, 'lose'), 'damageModifier');
    if (loserModifier && loserModifier.target === 'opponent') damage += loserModifier.amount;

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

  //뒤집은 결과를 이벤트로 남긴다
  private pushFlip(combatant: Combatant, skill: SkillData, flip: CardFlip, events: BattleEvent[]): void {
    events.push({
      type: 'cardFlipped',
      combatantId: combatant.id,
      skillId: skill.id,
      face: flip.face,
      power: flip.power,
      chance: flip.chance,
    });
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
