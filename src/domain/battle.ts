//전투 씬 1회분의 턴 상태머신. SPEC §3 의 진행 순서를 그대로 단계로 옮겼다
//원본 BattleManager 가 상태·연출·UI·입력을 다 들고 있었던 게 재설계 실패의 원인이라
//여기서는 상태 전이와 규칙 적용만 하고 결과는 이벤트로만 내보낸다

import { RandomEnemyAi, type EnemyAi } from './ai.js';
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
  private pendingPairs: BattleOrder[] = [];

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
    this.enemyAi = options.enemyAi ?? new RandomEnemyAi();

    for (const init of [...allies, ...enemies]) {
      if (this.combatantsById.has(init.id)) {
        throw new BattleDataError(`전투 참가자 id 가 중복된다: ${init.id}`);
      }
      catalog.validateDeck(init.deck);
      const combatant = new Combatant(init.id, init.side, catalog.character(init.characterId), init.deck);
      this.combatantsById.set(init.id, combatant);
    }

    const context: ClashContext = {
      alliesOf: (combatant) => this.sideOf(combatant.side),
    };
    this.resolver = new ClashResolver(catalog, this.rng, context);
  }

  //전투에 있는 모든 참가자
  get combatants(): Combatant[] {
    return [...this.combatantsById.values()];
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

  //턴을 연다. 코인을 회복시키고 아군 입력을 기다리는 상태로 넘어간다
  startTurn(): BattleEvent[] {
    this.expectPhase('turnStart');
    this.turn += 1;
    const events: BattleEvent[] = [{ type: 'turnStart', turn: this.turn }];

    for (const combatant of this.combatants) {
      if (combatant.isDefeated) continue;
      const coin = combatant.restoreCoin();
      events.push({ type: 'coinRestored', combatantId: combatant.id, coin });
    }

    this.phase = 'awaitingOrders';
    return events;
  }

  //아군 지시를 받는다. 적이 낼 카드는 AI 가 정하고 매칭쌍이 이 시점에 확정된다
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

    this.pendingPairs = [...orders];
    this.phase = 'resolving';
  }

  //매칭쌍을 순서대로 붙인다. 한 쌍이 끝날 때마다 전투 종료 조건을 본다
  resolve(): BattleEvent[] {
    this.expectPhase('resolving');
    const events: BattleEvent[] = [];

    for (const pair of this.pendingPairs) {
      const attacker = this.combatant(pair.actorId);
      const defender = this.combatant(pair.targetId);
      //앞선 합에서 누가 쓰러졌으면 이 쌍은 건너뛴다
      if (attacker.isDefeated || defender.isDefeated) continue;

      const defenderSkillId = this.enemyAi.chooseSkill(defender, this.aliveOf('ally'), this.rng);
      events.push(...this.resolver.resolve(attacker, pair.skillId, defender, defenderSkillId));

      if (this.checkBattleEnd(events)) {
        this.pendingPairs = [];
        return events;
      }
    }

    this.pendingPairs = [];
    this.phase = 'turnEnd';
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
    }

    events.push({ type: 'turnEnd', turn: this.turn });
    this.phase = 'turnStart';
    return events;
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
