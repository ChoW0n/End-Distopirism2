//행동력과 여러 턴 예약 (SPEC-001 v4.0 [D-24])
//전투 상태머신(Battle)은 한 턴 단위 그대로 두고, 이 예약판이 턴마다 지시와 적의 의도를 대신 낸다
//예약은 비었을 때만 짜고 바꿀 수 없다. 비용만큼 행동력이 바로 줄고 빚 한도까지 빚을 질 수 있다

import type { EnemyAi, EnemyAiContext, EnemyEngagement } from './ai.js';
import type { Battle, BattleOrder } from './battle.js';
import type { Combatant } from './combatant.js';
import type { BattleCatalog } from './data.js';
import type { BattleEvent, PlanStep } from './types.js';

//예약 규칙을 어겼을 때 던진다
export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

//한 사람의 행동력과 남은 예약
interface PlanSlot {
  actionPoints: number;
  max: number;
  steps: PlanStep[];
}

export class PlanBoard {
  private readonly slots = new Map<string, PlanSlot>();
  private battle: Battle | null = null;

  //참가자 목록은 전투를 붙일 때 정한다. 적 예약은 AI 로 짠다
  constructor(
    private readonly catalog: BattleCatalog,
    private readonly ai: EnemyAi,
    private readonly context: EnemyAiContext,
  ) {}

  //전투를 붙이고 모두의 행동력을 시작값으로 둔다. 캐릭터에 따로 적힌 값이 있으면 그걸 쓴다
  attach(battle: Battle): void {
    this.battle = battle;
    const rules = this.catalog.rules.actionPoints;
    for (const c of battle.combatants) {
      const own = c.base.actionPoints;
      this.slots.set(c.id, { actionPoints: own?.start ?? rules.start, max: own?.max ?? rules.max, steps: [] });
    }
  }

  //지금 행동력
  actionPoints(id: string): number {
    return this.slot(id).actionPoints;
  }

  //행동력 최대치
  maxActionPoints(id: string): number {
    return this.slot(id).max;
  }

  //남은 예약 (맨 앞이 이번 턴)
  steps(id: string): readonly PlanStep[] {
    return this.slot(id).steps;
  }

  //새 예약을 짜야 하는지. 예약이 비었고 행동력이 1 이상이어야 한다 (v4.0 §3)
  needsPlan(id: string): boolean {
    const slot = this.slot(id);
    return !this.combatant(id).isDefeated && slot.steps.length === 0 && slot.actionPoints >= 1;
  }

  //이번 턴 행동이 없는지. 예약이 비었고 행동력이 1 미만이다 (v4.0 §4-5)
  isIdle(id: string): boolean {
    const slot = this.slot(id);
    return slot.steps.length === 0 && slot.actionPoints < 1;
  }

  //카드 비용 합
  cost(steps: readonly PlanStep[]): number {
    return steps.reduce((sum, s) => sum + this.catalog.skill(s.skillId).apCost, 0);
  }

  //이 예약이 규칙에 맞는지. 틀리면 이유를, 맞으면 null 을 돌려준다
  problem(id: string, steps: readonly PlanStep[]): string | null {
    const actor = this.combatant(id);
    const slot = this.slot(id);
    if (actor.isDefeated) return '쓰러진 참가자는 예약할 수 없다';
    if (slot.steps.length > 0) return '예약이 남아 있으면 새로 짤 수 없다';
    if (slot.actionPoints < 1) return '행동력이 1 이상이어야 예약할 수 있다';
    if (steps.length === 0) return '예약은 한 칸 이상이어야 한다';
    const seen = new Set<number>();
    for (const step of steps) {
      if (!actor.deck.includes(step.skillId)) return `덱에 없는 카드다: ${step.skillId}`;
      if (seen.has(step.skillId)) return `한 예약 안에서 같은 카드는 한 번만 쓴다: ${step.skillId}`;
      seen.add(step.skillId);
      const target = this.combatant(step.targetId);
      if (target.side === actor.side) return `같은 진영을 겨눌 수 없다: ${step.targetId}`;
      if (target.isDefeated) return `쓰러진 대상을 겨눌 수 없다: ${step.targetId}`;
    }
    if (slot.actionPoints - this.cost(steps) < this.catalog.rules.actionPoints.floor) return '빚 한도를 넘는다';
    return null;
  }

  //예약을 확정한다. 비용만큼 행동력이 바로 줄고, 짠 즉시 공개된다
  submit(id: string, steps: readonly PlanStep[]): BattleEvent[] {
    const problem = this.problem(id, steps);
    if (problem) throw new PlanError(`${id}: ${problem}`);
    const slot = this.slot(id);
    const cost = this.cost(steps);
    slot.steps = steps.map((s) => ({ ...s }));
    slot.actionPoints -= cost;
    return [
      { type: 'planSet', combatantId: id, steps: slot.steps.map((s) => ({ ...s })), actionPoints: slot.actionPoints },
      { type: 'actionPointsChanged', combatantId: id, delta: -cost, actionPoints: slot.actionPoints },
    ];
  }

  //예약이 비어 새로 짜야 하는 적의 예약을 AI 로 짠다. 행동이 없는 사람은 알린다 (v4.0 §4-2·§5)
  planEnemies(): BattleEvent[] {
    const events: BattleEvent[] = [];
    for (const enemy of this.battle?.sideOf('enemy') ?? []) {
      if (enemy.isDefeated) continue;
      if (this.needsPlan(enemy.id)) events.push(...this.submit(enemy.id, this.choosePlan(enemy)));
    }
    for (const c of this.battle?.combatants ?? []) {
      if (!c.isDefeated && this.isIdle(c.id)) events.push({ type: 'idle', combatantId: c.id });
    }
    return events;
  }

  //AI 로 예약을 짠다. 이미 고른 카드는 빼고, 적 AI 빚 한도를 넘지 않는 카드만 더한다
  choosePlan(actor: Combatant): PlanStep[] {
    const plan = this.catalog.enemyAi.plan;
    const floor = Math.max(plan.debtFloor, this.catalog.rules.actionPoints.floor);
    const opponents = this.opponentsOf(actor);
    const steps: PlanStep[] = [];
    let left = this.slot(actor.id).actionPoints;
    while (steps.length < plan.maxCards && opponents.length > 0) {
      const used = new Set(steps.map((s) => s.skillId));
      //첫 칸은 빚 한도와 상관없이 하나는 고른다. 행동력이 1 이상이라 규칙 빚 한도 안이다
      const afford = actor.deck.filter((id) => !used.has(id) && !this.catalog.skill(id).tbd && (steps.length === 0 || left - this.catalog.skill(id).apCost >= floor));
      const usable = afford.filter((id) => left - this.catalog.skill(id).apCost >= this.catalog.rules.actionPoints.floor);
      if (usable.length === 0) break;
      const targetId = this.ai.chooseTarget(actor, opponents, new Set(), this.context);
      if (targetId === null) break;
      const target = this.combatant(targetId);
      const engagement: EnemyEngagement = { target, isClash: true, opponentSkillId: null, candidates: usable };
      const skillId = this.ai.chooseSkill(actor, engagement, this.context);
      steps.push({ skillId, targetId });
      left -= this.catalog.skill(skillId).apCost;
    }
    return steps;
  }

  //이번 턴 아군 지시. 예약 맨 앞 칸이고, 대상이 쓰러졌으면 다른 상대로 바꾼다 (v4.0 §4-4)
  orders(enemyTargets: ReadonlyMap<string, string>): BattleOrder[] {
    const orders: BattleOrder[] = [];
    for (const ally of this.battle?.sideOf('ally') ?? []) {
      if (ally.isDefeated) continue;
      const step = this.current(ally, enemyTargets);
      if (step) orders.push({ actorId: ally.id, targetId: step.targetId, skillId: step.skillId });
    }
    return orders;
  }

  //이 사람의 이번 턴 칸. 대상이 쓰러졌으면 나를 겨눈 상대, 없으면 첫 상대로 바꾼다. 행동이 없으면 null
  current(actor: Combatant, aimedAtMe: ReadonlyMap<string, string> = new Map()): PlanStep | null {
    const step = this.slot(actor.id).steps[0];
    if (!step) return null;
    if (!this.combatant(step.targetId).isDefeated) return step;
    const opponents = this.opponentsOf(actor);
    const aiming = opponents.find((o) => aimedAtMe.get(o.id) === actor.id);
    const next = aiming ?? opponents[0];
    return next ? { skillId: step.skillId, targetId: next.id } : null;
  }

  //턴을 닫는다. 쓴 칸을 빼고 행동력을 채운다 (v4.0 §4-6)
  endTurn(): BattleEvent[] {
    const events: BattleEvent[] = [];
    const regen = this.catalog.rules.actionPoints.regenPerTurn;
    for (const c of this.battle?.combatants ?? []) {
      if (c.isDefeated) continue;
      const slot = this.slot(c.id);
      slot.steps.shift();
      const next = Math.min(slot.max, slot.actionPoints + regen);
      const delta = next - slot.actionPoints;
      slot.actionPoints = next;
      if (delta !== 0) events.push({ type: 'actionPointsChanged', combatantId: c.id, delta, actionPoints: next });
    }
    return events;
  }

  //살아 있는 상대
  private opponentsOf(actor: Combatant): Combatant[] {
    return (this.battle?.combatants ?? []).filter((c) => c.side !== actor.side && !c.isDefeated);
  }

  private combatant(id: string): Combatant {
    if (!this.battle) throw new PlanError('예약판에 전투가 붙지 않았다');
    return this.battle.combatant(id);
  }

  private slot(id: string): PlanSlot {
    const slot = this.slots.get(id);
    if (!slot) throw new PlanError(`예약판에 없는 참가자다: ${id}`);
    return slot;
  }
}

//적이 예약대로 겨누고 예약한 카드를 내게 하는 AI. 행동이 없으면 아무도 겨누지 않는다 (v4.0 §4)
export class PlannedEnemyAi implements EnemyAi {
  constructor(private readonly board: PlanBoard) {}

  chooseTarget(enemy: Combatant): string | null {
    return this.board.current(enemy)?.targetId ?? null;
  }

  //예약에 적힌 카드. 예약이 없으면 덱 첫 카드로 대신한다(일어나지 않아야 한다)
  chooseSkill(enemy: Combatant): number {
    return this.board.current(enemy)?.skillId ?? enemy.deck[0]!;
  }
}

//예약판까지 묶은 전투 한 판. 턴 시작에 적 예약을 짜고, 아군 예약을 받고, 턴 종료에 칸을 넘긴다
export function plannedBattleOptions(board: PlanBoard): { enemyAi: EnemyAi; beforeEnemyTargets: (events: BattleEvent[]) => void } {
  return {
    enemyAi: new PlannedEnemyAi(board),
    beforeEnemyTargets: (events) => events.push(...board.planEnemies()),
  };
}
