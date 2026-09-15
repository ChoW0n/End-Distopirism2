//전투에 참가한 캐릭터 한 명의 실시간 상태를 들고 있는다
//체력·정신력·코인·상태이상만 관리하고 전투 규칙 판정은 하지 않는다

import type { BattleRules, CharacterData, Side, StatusId } from './types.js';

//지금 걸려 있는 상태이상 하나. 중첩 가능한 건 이 항목이 여러 개 쌓인다
export interface ActiveStatus {
  id: StatusId;
  turns: number;
}

//전투 참가자를 만들 때 넘기는 정보
export interface CombatantInit {
  //같은 캐릭터가 여러 명 나올 수 있어서 전투 안에서만 쓰는 고유 id 를 따로 받는다
  id: string;
  characterId: string;
  side: Side;
  deck: number[];
}

export class Combatant {
  hp: number;
  mentality: number;
  coin: number;
  //사기 진작 같은 카드가 바꿔놓는 다음 턴 코인 회복 보정치
  nextTurnCoinModifier = 0;
  readonly statuses: ActiveStatus[] = [];

  //기본 스탯을 그대로 초기값으로 삼는다
  constructor(
    readonly id: string,
    readonly side: Side,
    readonly base: CharacterData,
    readonly deck: readonly number[],
  ) {
    this.hp = base.maxHp;
    this.mentality = base.mentality;
    this.coin = base.maxCoin;
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
