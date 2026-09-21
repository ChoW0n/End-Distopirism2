//전투에 참가한 캐릭터 한 명의 실시간 상태를 들고 있는다
//체력·정신력·코인·상태이상만 관리하고 전투 규칙 판정은 하지 않는다

import type { Attribute, BattleRules, CharacterData, Side, StatusId } from './types.js';

//지금 걸려 있는 상태이상 하나. 중첩 가능한 건 이 항목이 여러 개 쌓인다
export interface ActiveStatus {
  id: StatusId;
  turns: number;
}

//전투 참가자를 만들 때 넘기는 정보. 덱은 캐릭터의 전용기에서 나오므로 따로 받지 않는다
export interface CombatantInit {
  //같은 캐릭터가 여러 명 나올 수 있어서 전투 안에서만 쓰는 고유 id 를 따로 받는다
  id: string;
  characterId: string;
  side: Side;
}

export class Combatant {
  hp: number;
  mentality: number;
  coin: number;
  //다음 턴 코인 회복 보정치
  nextTurnCoinModifier = 0;
  readonly statuses: ActiveStatus[] = [];
  //누적 속성 3종. 합 승리로만 오른다 (v2.0 §2)
  readonly attributes: Record<Attribute, number> = { attack: 0, defense: 0, support: 0 };
  //턴 종료 판정에서 조건을 채웠다는 표시. 다음 턴 시작에 궁극기 카드가 덱에 들어간다
  ultimatePending = false;
  //지금 들고 있는 카드. 전용기 3종에서 시작하고 궁극기가 붙었다 빠진다
  readonly deck: number[];

  //기본 스탯을 그대로 초기값으로 삼는다
  constructor(
    readonly id: string,
    readonly side: Side,
    readonly base: CharacterData,
    deck: readonly number[],
  ) {
    this.hp = base.maxHp;
    this.mentality = base.mentality;
    this.coin = base.maxCoin;
    this.deck = [...deck];
  }

  //속성 하나를 올리고 올라간 값을 돌려준다
  gainAttribute(attribute: Attribute): number {
    this.attributes[attribute] += 1;
    return this.attributes[attribute];
  }

  //속성 3종의 합. 궁극기 발동 조건 판정에 쓴다
  get attributeTotal(): number {
    return this.attributes.attack + this.attributes.defense + this.attributes.support;
  }

  //속성을 전부 0으로 되돌린다. 궁극기를 쓰면 다시 모아야 한다
  resetAttributes(): void {
    this.attributes.attack = 0;
    this.attributes.defense = 0;
    this.attributes.support = 0;
  }

  //덱에 카드를 한 장 넣는다. 이미 있으면 넣지 않는다
  addCard(skillId: number): boolean {
    if (this.deck.includes(skillId)) return false;
    this.deck.push(skillId);
    return true;
  }

  //덱에서 카드를 한 장 뺀다. 없으면 아무 일도 없다
  removeCard(skillId: number): boolean {
    const index = this.deck.indexOf(skillId);
    if (index < 0) return false;
    this.deck.splice(index, 1);
    return true;
  }

  //쓰러졌는지 본다
  get isDefeated(): boolean {
    return this.hp <= 0;
  }

  //해당 상태이상이 걸려 있는지 본다
  hasStatus(id: StatusId): boolean {
    return this.statuses.some((s) => s.id === id);
  }

  //중첩된 개수를 센다. 출혈 피해량 계산에 쓴다
  stackCount(id: StatusId): number {
    return this.statuses.filter((s) => s.id === id).length;
  }

  //상태이상을 건다. 중첩 불가면 지속 턴만 긴 쪽으로 갱신한다
  applyStatus(id: StatusId, turns: number, stackable: boolean): void {
    if (stackable) {
      this.statuses.push({ id, turns });
      return;
    }
    const existing = this.statuses.find((s) => s.id === id);
    if (existing) {
      existing.turns = Math.max(existing.turns, turns);
      return;
    }
    this.statuses.push({ id, turns });
  }

  //지속 턴을 1 줄이고 다 된 것을 걷어낸다. 걷어낸 종류를 돌려준다
  expireStatuses(): StatusId[] {
    const expired: StatusId[] = [];
    for (let i = this.statuses.length - 1; i >= 0; i -= 1) {
      const status = this.statuses[i];
      if (!status) continue;
      status.turns -= 1;
      if (status.turns <= 0) {
        expired.push(status.id);
        this.statuses.splice(i, 1);
      }
    }
    return expired.reverse();
  }

  //체력을 깎는다. 실제로 깎인 양을 돌려준다
  takeDamage(amount: number): number {
    const applied = Math.max(0, Math.min(amount, this.hp));
    this.hp -= applied;
    return applied;
  }

  //정신력을 바꾼다. 0~상한 밖으로 나가지 않으며 실제 변동치를 돌려준다
  changeMentality(delta: number, rules: BattleRules): number {
    const before = this.mentality;
    this.mentality = Math.max(0, Math.min(rules.mentalityMax, before + delta));
    return this.mentality - before;
  }

  //코인을 1개 잃는다
  loseCoin(): void {
    this.coin = Math.max(0, this.coin - 1);
  }

  //턴 시작 코인 회복. 보정치를 더한 뒤 보정치는 소모된다
  restoreCoin(): number {
    this.coin = Math.max(0, this.base.maxCoin + this.nextTurnCoinModifier);
    this.nextTurnCoinModifier = 0;
    return this.coin;
  }
}
