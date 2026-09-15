//테스트가 공통으로 쓰는 준비물. 실제 battle-data.json 을 그대로 읽어서 쓴다

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadBattleCatalog } from '../src/platform/node-data.js';
import { Combatant } from '../src/domain/combatant.js';
import { ClashResolver, type ClashContext } from '../src/domain/clash.js';
import type { BattleCatalog } from '../src/domain/data.js';
import type { Rng } from '../src/domain/rng.js';
import type { Side } from '../src/domain/types.js';

const here = dirname(fileURLToPath(import.meta.url));

//전투 데이터 조회표. 테스트 전체가 같은 것을 공유한다
export const catalog: BattleCatalog = loadBattleCatalog(resolve(here, '../docs/battle-data.json'));

//코인이 항상 실패하는 난수원. 양측 피해를 똑같이 만들어 교착을 재현할 때 쓴다
export const alwaysFailRng: Rng = { next: () => 1 };

//코인이 항상 성공하는 난수원
export const alwaysSucceedRng: Rng = { next: () => 0 };

//테스트용 참가자를 만든다
export function makeCombatant(
  id: string,
  characterId: string,
  side: Side,
  deck: number[] = [1001],
): Combatant {
  return new Combatant(id, side, catalog.character(characterId), deck);
}

//합 판정기를 만든다. 진영 조회는 넘긴 목록에서만 찾는다
export function makeResolver(rng: Rng, members: Combatant[] = []): ClashResolver {
  const context: ClashContext = {
    alliesOf: (combatant) => members.filter((m) => m.side === combatant.side),
  };
  return new ClashResolver(catalog, rng, context);
}
