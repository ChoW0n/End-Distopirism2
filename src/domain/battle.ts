//전투 씬 1회분의 턴 상태머신. SPEC §3 의 진행 순서를 그대로 단계로 옮겼다
//원본 BattleManager 가 상태·연출·UI·입력을 다 들고 있었던 게 재설계 실패의 원인이라
//여기서는 상태 전이와 규칙 적용만 하고 결과는 이벤트로만 내보낸다

import { WeightedEnemyAi, type EnemyAi, type EnemyAiContext } from './ai.js';
import { ClashResolver, type ClashContext } from './clash.js';
import { Combatant, type CombatantInit } from './combatant.js';
import { BattleCatalog, BattleDataError } from './data.js';
import { systemRng, type Rng } from './rng.js';
import type { BattleEvent, Side } from './types.js';

//턴 진행 단계. 바깥에서는 이 값을 보고 다음에 무엇을 부를지 정한다
export type BattlePhase = 'turnStart' | 'awaitingOrders' | 'resolving' | 'turnEnd' | 'finished';

//아군 한 명의 이번 턴 지시. 누가 누구를 어떤 카드로 치는지
export interface BattleOrder {
  actorId: string;
  targetId: string;
  skillId: number;
}

//매칭 판정으로 확정된 교전 하나 (SPEC §3)
export type Engagement =
  | { kind: 'clash'; allyId: string; enemyId: string; allySkillId: number }
  | { kind: 'allyOneSided'; allyId: string; targetId: string; skillId: number }
  | { kind: 'enemyOneSided'; enemyId: string; targetId: string };

//전투를 만들 때 넘기는 설정
export interface BattleOptions {
  rng?: Rng;
  enemyAi?: EnemyAi;
}

//상태 전이를 어겼을 때 던진다
export class BattleFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BattleFlowError';
  }
}

export class Battle {
  private readonly combatantsById = new Map<string, Combatant>();
  private readonly resolver: ClashResolver;
  private readonly rng: Rng;
  private readonly enemyAi: EnemyAi;
  private readonly aiContext: EnemyAiContext;
  //이번 턴에 적이 고른 타겟. 턴 시작에 정해지고 아군 입력에 영향받지 않는다
  private readonly enemyTargets = new Map<string, string>();
  private engagements: Engagement[] = [];

  turn = 0;
  phase: BattlePhase = 'turnStart';
  winner: Side | null = null;

  //양 진영의 참가자를 만들고 덱 제한을 검사한다. 덱이 규칙을 어기면 여기서 바로 막는다
  constructor(
    private readonly catalog: BattleCatalog,
    allies: readonly CombatantInit[],
    enemies: readonly CombatantInit[],
    options: BattleOptions = {},
  ) {
    this.rng = options.rng ?? systemRng;
    this.enemyAi = options.enemyAi ?? new WeightedEnemyAi();

    for (const init of [...allies, ...enemies]) {
      if (this.combatantsById.has(init.id)) {
        throw new BattleDataError(`전투 참가자 id 가 중복된다: ${init.id}`);
      }
      //덱은 캐릭터의 전용기 3종에서 나온다. 카드 풀을 공유하지 않는다 (v2.0 §1)
      const deck = catalog.deckFor(init.characterId);
      catalog.validateDeck(deck);
      const combatant = new Combatant(init.id, init.side, catalog.character(init.characterId), deck);
      this.combatantsById.set(init.id, combatant);
    }

    const context: ClashContext = {
      alliesOf: (combatant) => this.sideOf(combatant.side),
    };
    this.resolver = new ClashResolver(catalog, this.rng, context);
    this.aiContext = { catalog, resolver: this.resolver, rng: this.rng };
  }

  //전투에 있는 모든 참가자
  get combatants(): Combatant[] {
    return [...this.combatantsById.values()];
  }

  //전투가 끝났는지
  get isFinished(): boolean {
    return this.phase === 'finished';
  }

  //이번 턴에 확정된 교전 목록. 매칭 판정 뒤에 채워진다
  get plannedEngagements(): readonly Engagement[] {
    return this.engagements;
  }

  //id 로 참가자를 찾는다. 없으면 던진다
  combatant(id: string): Combatant {
    const found = this.combatantsById.get(id);
    if (!found) throw new BattleDataError(`전투 참가자를 찾을 수 없다: ${id}`);
    return found;
  }

  //한 진영의 참가자 목록
  sideOf(side: Side): Combatant[] {
    return this.combatants.filter((c) => c.side === side);
  }

  //아직 서 있는 참가자만
  private aliveOf(side: Side): Combatant[] {
    return this.sideOf(side).filter((c) => !c.isDefeated);
  }

  //턴을 연다. 코인 회복 → 지속 상태이상 → 적 타겟 선택 순이다
  startTurn(): BattleEvent[] {
    this.expectPhase('turnStart');
    this.turn += 1;
    const events: BattleEvent[] = [{ type: 'turnStart', turn: this.turn }];

    for (const combatant of this.combatants) {
      if (combatant.isDefeated) continue;
      const coin = combatant.restoreCoin();
      events.push({ type: 'coinRestored', combatantId: combatant.id, coin });

      //지난 턴 종료에 조건을 채운 캐릭터에게 궁극기 카드가 들어온다 (v2.0 §3.1)
      if (combatant.ultimatePending) {
        combatant.ultimatePending = false;
        combatant.addCard(this.catalog.rules.ultimateSkillId);
      }
    }

    //출혈은 캐릭터당 턴 1회다. 교전마다 넣으면 한 턴에 여러 번 맞는다 (SPEC §3)
    for (const combatant of this.combatants) {
      if (combatant.isDefeated) continue;
      this.resolver.applyTurnStartStatuses(combatant, events);
    }
    if (this.checkBattleEnd(events)) return events;

    this.chooseEnemyTargets(events);

    this.phase = 'awaitingOrders';
    return events;
  }

  //적이 각자 아군 하나를 겨눈다. 아군 입력 전에 확정해야 아군이 합을 강제할 수 없다
  private chooseEnemyTargets(events: BattleEvent[]): void {
    this.enemyTargets.clear();
    const candidates = this.aliveOf('ally');
    if (candidates.length === 0) return;

    const alreadyTargeted = new Set<string>();
    for (const enemy of this.aliveOf('enemy')) {
      const targetId = this.enemyAi.chooseTarget(enemy, candidates, alreadyTargeted, this.aiContext);
      this.enemyTargets.set(enemy.id, targetId);
      alreadyTargeted.add(targetId);
      events.push({ type: 'enemyTargeted', enemyId: enemy.id, targetId });
    }
  }

  //아군 지시를 받고 매칭 판정까지 끝낸다. 서로 겨눴으면 합, 아니면 각자 일방 공격이다
  submitOrders(orders: readonly BattleOrder[]): void {
    this.expectPhase('awaitingOrders');

    const used = new Set<string>();
    for (const order of orders) {
      const actor = this.combatant(order.actorId);
      const target = this.combatant(order.targetId);

      if (actor.side !== 'ally') throw new BattleFlowError(`아군이 아닌 참가자의 지시다: ${actor.id}`);
      if (actor.isDefeated) throw new BattleFlowError(`쓰러진 참가자에게 지시할 수 없다: ${actor.id}`);
      if (target.side === actor.side) throw new BattleFlowError(`같은 진영을 겨눌 수 없다: ${target.id}`);
      if (target.isDefeated) throw new BattleFlowError(`쓰러진 대상을 겨눌 수 없다: ${target.id}`);
      if (!actor.deck.includes(order.skillId)) {
        throw new BattleFlowError(`덱에 없는 카드다: ${actor.id} / ${order.skillId}`);
      }
      if (used.has(actor.id)) throw new BattleFlowError(`같은 참가자에게 지시가 두 번 왔다: ${actor.id}`);
      used.add(actor.id);
    }

    this.engagements = this.matchEngagements(orders);
    this.phase = 'resolving';
  }

  //매칭 판정. 아군 지시를 먼저 놓고 남은 적의 일방 공격을 뒤에 붙인다
  private matchEngagements(orders: readonly BattleOrder[]): Engagement[] {
    const engagements: Engagement[] = [];
    const enemiesInClash = new Set<string>();

    for (const order of orders) {
      //상호 지정일 때만 합이다
      if (this.enemyTargets.get(order.targetId) === order.actorId) {
        engagements.push({
          kind: 'clash',
          allyId: order.actorId,
          enemyId: order.targetId,
          allySkillId: order.skillId,
        });
        enemiesInClash.add(order.targetId);
        continue;
      }
      engagements.push({
        kind: 'allyOneSided',
        allyId: order.actorId,
        targetId: order.targetId,
        skillId: order.skillId,
      });
    }

    for (const enemy of this.aliveOf('enemy')) {
      if (enemiesInClash.has(enemy.id)) continue;
      const targetId = this.enemyTargets.get(enemy.id);
      if (!targetId) continue;
      engagements.push({ kind: 'enemyOneSided', enemyId: enemy.id, targetId });
    }

    return engagements;
  }

  //교전을 순서대로 실행한다. 쓰러진 캐릭터가 낀 교전은 건너뛴다
  resolve(): BattleEvent[] {
    this.expectPhase('resolving');
    const events: BattleEvent[] = [];

    for (const engagement of this.engagements) {
      const [attacker, target] = this.participantsOf(engagement);
      if (attacker.isDefeated || target.isDefeated) continue;

      events.push(...this.runEngagement(engagement, attacker, target));

      if (this.checkBattleEnd(events)) {
        this.engagements = [];
        return events;
      }
    }

    this.engagements = [];
    this.phase = 'turnEnd';
    return events;
  }

  //교전에 참여하는 두 사람을 공격자·대상 순으로 꺼낸다
  private participantsOf(engagement: Engagement): [Combatant, Combatant] {
    if (engagement.kind === 'clash') {
      return [this.combatant(engagement.allyId), this.combatant(engagement.enemyId)];
    }
    if (engagement.kind === 'allyOneSided') {
      return [this.combatant(engagement.allyId), this.combatant(engagement.targetId)];
    }
    return [this.combatant(engagement.enemyId), this.combatant(engagement.targetId)];
  }

  //교전 한 건을 실행한다. 적이 낼 카드는 이 시점에 AI 가 고른다
  private runEngagement(
    engagement: Engagement,
    attacker: Combatant,
    target: Combatant,
  ): BattleEvent[] {
    const events: BattleEvent[] = [];

    if (engagement.kind === 'clash') {
      const enemySkillId = this.enemyAi.chooseSkill(
        target,
        { target: attacker, isClash: true, opponentSkillId: engagement.allySkillId },
        this.aiContext,
      );
      this.consumeUltimate(attacker, engagement.allySkillId, events);
      this.consumeUltimate(target, enemySkillId, events);
      events.push(...this.resolver.resolve(attacker, engagement.allySkillId, target, enemySkillId));
      return events;
    }

    if (engagement.kind === 'allyOneSided') {
      this.consumeUltimate(attacker, engagement.skillId, events);
      events.push(...this.resolver.resolveOneSided(attacker, engagement.skillId, target));
      return events;
    }

    const skillId = this.enemyAi.chooseSkill(
      attacker,
      { target, isClash: false, opponentSkillId: null },
      this.aiContext,
    );
    this.consumeUltimate(attacker, skillId, events);
    events.push(...this.resolver.resolveOneSided(attacker, skillId, target));
    return events;
  }

  //턴을 닫는다. 정신력이 조금 돌아오고 상태이상의 지속 턴이 줄어든다
  endTurn(): BattleEvent[] {
    this.expectPhase('turnEnd');
    const events: BattleEvent[] = [];
    const rules = this.catalog.rules;

    for (const combatant of this.combatants) {
      if (combatant.isDefeated) continue;

      //정신력 자연 회복. 하한선까지만 끌어올려 붕괴 나선만 막고 위험 자체는 남긴다
      if (combatant.mentality < rules.mentalityRegenCap) {
        const target = Math.min(rules.mentalityRegenCap, combatant.mentality + rules.mentalityRegenPerTurn);
        const delta = combatant.changeMentality(target - combatant.mentality, rules);
        if (delta !== 0) {
          events.push({
            type: 'mentalityChanged',
            combatantId: combatant.id,
            delta,
            mentality: combatant.mentality,
            reason: 'turnRegen',
          });
        }
      }

      for (const status of combatant.expireStatuses()) {
        events.push({ type: 'statusExpired', combatantId: combatant.id, status });
      }

      this.checkUltimateReady(combatant, events);
    }

    events.push({ type: 'turnEnd', turn: this.turn });
    this.phase = 'turnStart';
    return events;
  }

  //속성 합이 기준에 닿았는지 본다. 판정은 턴 종료, 카드는 다음 턴 시작에 들어간다 (v2.0 §3.1)
  private checkUltimateReady(combatant: Combatant, events: BattleEvent[]): void {
    const rules = this.catalog.rules;
    if (combatant.attributeTotal < rules.ultimateThreshold) return;
    //이미 들고 있거나 들어오기로 된 상태면 다시 알리지 않는다
    if (combatant.ultimatePending || combatant.deck.includes(rules.ultimateSkillId)) return;

    combatant.ultimatePending = true;
    events.push({ type: 'ultimateReady', combatantId: combatant.id });
  }

  //궁극기를 냈으면 카드를 소모하고 속성을 비운다 (v2.0 §3.1)
  private consumeUltimate(actor: Combatant, skillId: number, events: BattleEvent[]): void {
    if (skillId !== this.catalog.rules.ultimateSkillId) return;
    actor.removeCard(skillId);
    actor.resetAttributes();
    events.push({ type: 'ultimateUsed', combatantId: actor.id, skillId });
  }

  //한쪽이 전멸했는지 본다. 끝났으면 전투를 닫는다
  private checkBattleEnd(events: BattleEvent[]): boolean {
    const alliesDown = this.aliveOf('ally').length === 0;
    const enemiesDown = this.aliveOf('enemy').length === 0;
    if (!alliesDown && !enemiesDown) return false;

    //양쪽이 동시에 쓰러지면 승자가 없다
    this.winner = alliesDown && enemiesDown ? null : alliesDown ? 'enemy' : 'ally';
    this.phase = 'finished';
    events.push({ type: 'battleEnd', winner: this.winner });
    return true;
  }

  //지금 단계가 기대한 단계인지 확인한다
  private expectPhase(expected: BattlePhase): void {
    if (this.phase !== expected) {
      throw new BattleFlowError(`지금 단계는 ${this.phase} 라 ${expected} 동작을 할 수 없다`);
    }
  }
}
