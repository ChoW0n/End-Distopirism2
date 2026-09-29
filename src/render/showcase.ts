//제작 확인용 자동 시연 (SPEC-005 §13). 전투 규칙을 돌리지 않고 교환 걸음을 직접 만든다
//아군이 합에서 무조건 이긴다: 아군 카드는 앞면, 적 카드는 뒷면. S1 → S2 → S3 → 궁극기 순서로 한 바퀴
//렌더러를 모른다. 웹 3D 무대와 유니티가 같은 걸음을 받는다

import type { BattleEvent, SkillSlot } from '../domain/types.js';
import type { StageStep } from './exchange.js';

//시연에 쓸 아군 카드 한 장
export interface ShowcaseCard {
  skillId: number;
  slot: SkillSlot;
  frontPower: number;
}

export interface ShowcaseInput {
  allyId: string;
  enemyId: string;
  //낼 순서대로 (S1 · S2 · S3 · 궁극기)
  cards: readonly ShowcaseCard[];
  //적이 내는 카드. 늘 뒷면이 나온다
  enemyCard: { skillId: number; backPower: number };
  enemyMaxHp: number;
}

//시연 순서. 없는 슬롯은 건너뛴다
export const SHOWCASE_ORDER: readonly SkillSlot[] = ['S1', 'S2', 'S3', 'ULT'];

//한 바퀴의 걸음. 적 체력은 가득에서 시작해 1 밑으로 내려가지 않고, 끝에 가득으로 되돌린다
export function showcaseCycle(input: ShowcaseInput): StageStep[] {
  const steps: StageStep[] = [];
  let hp = input.enemyMaxHp;
  const ordered = SHOWCASE_ORDER.map((slot) => input.cards.find((c) => c.slot === slot)).filter((c): c is ShowcaseCard => c !== undefined);
  for (const card of ordered) {
    const damage = card.frontPower;
    hp = Math.max(1, hp - damage);
    const events: BattleEvent[] = [{ type: 'damageApplied', combatantId: input.enemyId, damage, hp }];
    steps.push({
      kind: 'clash',
      attackerId: input.allyId,
      defenderId: input.enemyId,
      attackerSkillId: card.skillId,
      defenderSkillId: input.enemyCard.skillId,
      rounds: [
        {
          type: 'win',
          attackerFlip: { combatantId: input.allyId, skillId: card.skillId, face: 'front', power: card.frontPower, chance: 1 },
          defenderFlip: { combatantId: input.enemyId, skillId: input.enemyCard.skillId, face: 'back', power: input.enemyCard.backPower, chance: 0 },
          winnerId: input.allyId,
          loserId: input.enemyId,
          winnerPower: card.frontPower,
          loserPower: input.enemyCard.backPower,
          events: [],
          callouts: [{ combatantId: input.allyId, success: true, title: '합 승리', reason: `앞 ${card.frontPower} > 뒤 ${input.enemyCard.backPower}` }],
        },
      ],
      finisher: { winnerId: input.allyId, loserId: input.enemyId, winnerSkillId: card.skillId, damage, defeated: false },
      events,
    });
  }
  //한 바퀴가 끝나면 적 체력을 가득으로 되돌린다
  steps.push({ kind: 'state', event: { type: 'damageApplied', combatantId: input.enemyId, damage: 0, hp: input.enemyMaxHp } });
  return steps;
}
