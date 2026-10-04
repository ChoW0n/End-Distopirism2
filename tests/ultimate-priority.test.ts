//결행 우선 선택도 예약 후보와 비용 제한 안에서만 작동한다
import { expect, it } from 'vitest';
import { WeightedEnemyAi } from '../src/domain/ai.js';
import { ClashResolver } from '../src/domain/clash.js';
import { alwaysFrontRng, catalog, makeCombatant, skillOf } from './helpers.js';

it('덱 순서·추첨값과 무관하게 후보에 있는 결행을 먼저 고른다', () => {
  const actor = makeCombatant('a', 'kyle', 'ally');
  const target = makeCombatant('e', 'remnantWalker', 'enemy');
  actor.addCard(catalog.rules.ultimateSkillId);
  const ai = new WeightedEnemyAi();
  const context = { catalog, resolver: new ClashResolver(catalog, alwaysFrontRng), rng: alwaysFrontRng };
  expect(ai.chooseSkill(actor, { target, isClash: true, opponentSkillId: null }, context)).toBe(catalog.rules.ultimateSkillId);
});

it('결행이 덱에 있어도 비용·중복 제한으로 후보에서 빠졌으면 고르지 않는다', () => {
  const actor = makeCombatant('a', 'kyle', 'ally');
  const target = makeCombatant('e', 'remnantWalker', 'enemy');
  actor.addCard(catalog.rules.ultimateSkillId);
  const skillId = skillOf('kyle', 'S1');
  const ai = new WeightedEnemyAi();
  const context = { catalog, resolver: new ClashResolver(catalog, alwaysFrontRng), rng: alwaysFrontRng };
  expect(ai.chooseSkill(actor, { target, isClash: true, opponentSkillId: null, candidates: [skillId] }, context)).toBe(skillId);
});
