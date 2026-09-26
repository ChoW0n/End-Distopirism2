//플레이어 입력 단계 (SPEC-004 §10)
//
//아군 선택 → 타겟 선택 → 카드 선택 순서를 들고 있는 작은 상태머신이다.
//입력은 도메인 이벤트가 아니라서(§6.1) 확정 전까지 도메인은 아무것도 모른다.
//화면·DOM 을 모른다. 어떤 버튼을 켤지는 이 상태를 보고 렌더러 쪽이 정한다

import type { BattleOrder } from '../domain/battle.js';
import type { BattleCatalog } from '../domain/data.js';
import type { Attribute, SkillSlot } from '../domain/types.js';

//입력 단계에 필요한 참가자 정보. 도메인 Combatant 를 통째로 넘기지 않는다
export interface InputMember {
  id: string;
  characterId: string;
  //쓸 수 있는 카드. 궁극기는 손에 들어왔을 때만 있다
  deck: readonly number[];
  maxCoin: number;
}

//카드 한 장에 보이는 것 (§10.2)
export interface CardView {
  skillId: number;
  name: string;
  slot: SkillSlot;
  attribute: string | null;
  //피해 범위. 레벨차 보너스는 대상마다 달라서 뺀다
  minDamage: number;
  maxDamage: number;
  text: string;
}

//속성 이름. 카드에 적는 글자다
const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  attack: '공격',
  defense: '방어',
  support: '보조',
};

//카드 한 장을 화면에 보일 모양으로 푼다
export function cardView(catalog: BattleCatalog, skillId: number, maxCoin: number): CardView {
  const skill = catalog.skill(skillId);
  return {
    skillId,
    name: skill.name,
    slot: skill.slot,
    attribute: skill.attribute ? ATTRIBUTE_LABEL[skill.attribute] : null,
    minDamage: skill.baseDamage,
    maxDamage: skill.baseDamage + skill.coinPower * maxCoin,
    text: skill.text,
  };
}

export class OrderInput {
  //지금 지시를 받고 있는 아군
  private current: string | null = null;
  //고른 적. 카드를 누르면 지시가 확정된다
  private pendingTarget: string | null = null;
  //확정된 지시. 넣은 순서가 곧 실행 순서다 (SPEC-001 §3)
  private readonly orders = new Map<string, BattleOrder>();

  //살아 있는 아군·적과 적이 겨눈 대상을 받는다. 턴마다 새로 만든다
  constructor(
    private readonly allies: readonly InputMember[],
    private readonly enemies: readonly string[],
    private readonly enemyTargets: ReadonlyMap<string, string>,
  ) {
    this.current = allies[0]?.id ?? null;
  }

  //지금 지시를 받고 있는 아군
  get selectedAlly(): string | null {
    return this.current;
  }

  //지금 고른 적
  get selectedTarget(): string | null {
    return this.pendingTarget;
  }

  //살아 있는 아군 전원이 지시를 받았는지. 이게 참이어야 합을 진행한다
  get ready(): boolean {
    return this.allies.length > 0 && this.allies.every((ally) => this.orders.has(ally.id));
  }

  //확정된 지시 목록. 넣은 순서대로다
  get submitted(): BattleOrder[] {
    return [...this.orders.values()];
  }

  //한 아군의 확정된 지시
  orderOf(allyId: string): BattleOrder | null {
    return this.orders.get(allyId) ?? null;
  }

  //지금 아군이 낼 수 있는 카드. 아군을 안 골랐으면 비어 있다
  get hand(): readonly number[] {
    return this.member(this.current)?.deck ?? [];
  }

  //이 적이 지금 아군을 겨누고 있는지. 같이 겨누면 합이 된다 (SPEC-001 D-7)
  wouldClash(enemyId: string): boolean {
    return this.current !== null && this.enemyTargets.get(enemyId) === this.current;
  }

  //아군을 고른다. 이미 지시가 있으면 지우고 다시 받는다
  selectAlly(allyId: string): boolean {
    if (!this.member(allyId)) return false;
    this.orders.delete(allyId);
    this.current = allyId;
    this.pendingTarget = null;
    return true;
  }

  //적을 고른다. 아군을 먼저 골라야 한다
  selectTarget(enemyId: string): boolean {
    if (this.current === null || !this.enemies.includes(enemyId)) return false;
    this.pendingTarget = enemyId;
    return true;
  }

  //카드를 고른다. 아군·적이 다 골라져 있으면 지시가 확정되고 다음 아군으로 넘어간다
  selectCard(skillId: number): BattleOrder | null {
    const ally = this.member(this.current);
    if (!ally || this.pendingTarget === null || !ally.deck.includes(skillId)) return null;
    const order: BattleOrder = { actorId: ally.id, targetId: this.pendingTarget, skillId };
    this.orders.delete(ally.id);
    this.orders.set(ally.id, order);
    this.pendingTarget = null;
    this.current = this.allies.find((a) => !this.orders.has(a.id))?.id ?? null;
    return order;
  }

  private member(allyId: string | null): InputMember | undefined {
    return allyId === null ? undefined : this.allies.find((a) => a.id === allyId);
  }
}
