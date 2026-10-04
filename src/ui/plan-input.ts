//여러 턴 예약 입력 (SPEC-001 v4.0 §3·§6)
//
//아군 선택 → 대상 선택 → 카드를 쓸 순서대로 누르기. 누른 순서가 곧 턴 순서다.
//다시 누르면 빠진다. 행동력이 빚 한도 아래로 내려가는 카드는 더할 수 없다.
//확정 전까지 도메인은 아무것도 모른다. 화면·DOM 을 모른다

import type { BattleOrder } from '../domain/battle.js';
import type { PlanStep } from '../domain/types.js';
import type { InputMember } from './input.js';

//한 아군의 행동력 사정. 비용은 도메인 카드 데이터에서 온다
export interface PlanBudget {
  actionPoints: number;
  floor: number;
  max: number;
  regenPerTurn: number;
  cost(skillId: number): number;
}

export class PlanInput {
  //지금 예약을 짜고 있는 아군
  private current: string | null;
  //고른 적. 카드를 누를 때마다 이 대상으로 칸이 더해진다
  private pendingTarget: string | null = null;
  //아군마다 짠 칸
  private readonly plans = new Map<string, PlanStep[]>();

  //예약이 필요한 아군, 살아 있는 적, 적이 겨눈 대상, 행동력 사정을 받는다. 턴마다 새로 만든다
  constructor(
    private readonly allies: readonly InputMember[],
    private readonly enemies: readonly string[],
    private readonly enemyTargets: ReadonlyMap<string, string>,
    private readonly budgets: ReadonlyMap<string, PlanBudget>,
  ) {
    this.current = allies[0]?.id ?? null;
    //적이 하나뿐이면 대상을 미리 고른다
    if (enemies.length === 1) this.pendingTarget = enemies[0] ?? null;
  }

  get selectedAlly(): string | null {
    return this.current;
  }

  get selectedTarget(): string | null {
    return this.pendingTarget;
  }

  //예약이 필요한 아군 전원이 한 칸 이상 짰는지
  get ready(): boolean {
    return this.allies.length > 0 && this.allies.every((a) => (this.plans.get(a.id)?.length ?? 0) > 0);
  }

  //확정할 예약
  get submitted(): Map<string, PlanStep[]> {
    return new Map([...this.plans].filter(([, steps]) => steps.length > 0).map(([id, steps]) => [id, steps.map((s) => ({ ...s }))]));
  }

  //이 아군의 이번 턴 지시(예약 첫 칸). 합 표지에 쓴다
  orderOf(allyId: string): BattleOrder | null {
    const first = this.plans.get(allyId)?.[0];
    return first ? { actorId: allyId, targetId: first.targetId, skillId: first.skillId } : null;
  }

  //이 아군이 짠 칸
  stepsOf(allyId: string): readonly PlanStep[] {
    return this.plans.get(allyId) ?? [];
  }

  //예약 뒤 행동력, 예약이 다 끝난 뒤 행동력(턴마다 회복), 빚 한도
  budgetOf(allyId: string): { actionPoints: number; after: number; end: number; floor: number } | null {
    const b = this.budgets.get(allyId);
    if (!b) return null;
    const steps = this.stepsOf(allyId);
    const after = b.actionPoints - steps.reduce((sum, s) => sum + b.cost(s.skillId), 0);
    let end = after;
    for (let i = 0; i < steps.length; i++) end = Math.min(b.max, end + b.regenPerTurn);
    return { actionPoints: b.actionPoints, after, end, floor: b.floor };
  }

  //지금 아군이 낼 수 있는 카드
  get hand(): readonly number[] {
    return this.member(this.current)?.deck ?? [];
  }

  //이 카드를 더할 수 있는지. 이미 넣었으면 빼는 것이라 늘 된다
  canToggle(skillId: number): boolean {
    const id = this.current;
    if (id === null || this.pendingTarget === null) return false;
    if (this.stepsOf(id).some((s) => s.skillId === skillId)) return true;
    const b = this.budgets.get(id);
    const budget = this.budgetOf(id);
    if (!b || !budget) return false;
    return budget.after - b.cost(skillId) >= budget.floor;
  }

  //이 적이 지금 아군을 겨누고 있는지. 같이 겨누면 합이 된다
  wouldClash(enemyId: string): boolean {
    return this.current !== null && this.enemyTargets.get(enemyId) === this.current;
  }

  //아군을 고른다. 다시 고르면 그 아군의 예약을 처음부터 짠다
  selectAlly(allyId: string): boolean {
    if (!this.member(allyId)) return false;
    this.plans.delete(allyId);
    this.current = allyId;
    if (this.enemies.length !== 1) this.pendingTarget = null;
    return true;
  }

  //적을 고른다. 아군을 먼저 골라야 한다
  selectTarget(enemyId: string): boolean {
    if (this.current === null || !this.enemies.includes(enemyId)) return false;
    this.pendingTarget = enemyId;
    return true;
  }

  //카드를 누른다. 없으면 맨 뒤에 더하고, 있으면 뺀다 (뒤 칸은 한 칸씩 당겨진다)
  selectCard(skillId: number): boolean {
    const ally = this.member(this.current);
    if (!ally || this.pendingTarget === null || !ally.deck.includes(skillId) || !this.canToggle(skillId)) return false;
    const steps = this.plans.get(ally.id) ?? [];
    const at = steps.findIndex((s) => s.skillId === skillId);
    if (at >= 0) steps.splice(at, 1);
    else steps.push({ skillId, targetId: this.pendingTarget });
    this.plans.set(ally.id, steps);
    return true;
  }

  private member(allyId: string | null): InputMember | undefined {
    return allyId === null ? undefined : this.allies.find((a) => a.id === allyId);
  }
}
