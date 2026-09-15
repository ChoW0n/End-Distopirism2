//적이 낼 카드를 고르는 자리. D-6(유효 카드 필터링 후 가중 랜덤)은 아직 붙이지 않았고
//지금은 완전 랜덤이다. 전투가 도는 것을 먼저 확인하고 이 인터페이스만 갈아끼운다

import type { Combatant } from './combatant.js';
import type { Rng } from './rng.js';

export interface EnemyAi {
  //적 한 명이 이번 턴에 낼 카드를 고른다
  chooseSkill(enemy: Combatant, opponents: readonly Combatant[], rng: Rng): number;
}

//덱에서 아무 카드나 뽑는다. 임시 구현이다
export class RandomEnemyAi implements EnemyAi {
  chooseSkill(enemy: Combatant, _opponents: readonly Combatant[], rng: Rng): number {
    const deck = enemy.deck;
    if (deck.length === 0) {
      throw new Error(`적 ${enemy.id} 의 덱이 비어 있다`);
    }
    const picked = deck[Math.floor(rng.next() * deck.length)];
    //난수가 1 에 아주 가까울 때를 대비해 마지막 장으로 떨어뜨린다
    return picked ?? deck[deck.length - 1]!;
  }
}
