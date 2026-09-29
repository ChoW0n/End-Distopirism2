//테스트가 공통으로 쓰는 준비물. 실제 battle-data.json 을 그대로 읽어서 쓴다

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadBattleCatalog } from '../src/platform/node-data.js';
import { Combatant } from '../src/domain/combatant.js';
import { ClashResolver } from '../src/domain/clash.js';
import type { BattleCatalog } from '../src/domain/data.js';
import type { Rng } from '../src/domain/rng.js';
import type { Side } from '../src/domain/types.js';

const here = dirname(fileURLToPath(import.meta.url));

//전투 데이터 조회표. 테스트 전체가 같은 것을 공유한다
export const catalog: BattleCatalog = loadBattleCatalog(resolve(here, '../docs/battle-data.json'));

//카드가 늘 뒷면으로 나오는 난수원. 같은 카드끼리 붙이면 위력이 같아 교착을 재현한다
export const alwaysBackRng: Rng = { next: () => 1 };

//카드가 늘 앞면으로 나오는 난수원
export const alwaysFrontRng: Rng = { next: () => 0 };

//테스트용 참가자를 만든다. 덱을 안 주면 캐릭터의 전용기 3종을 그대로 쓴다
export function makeCombatant(
  id: string,
  characterId: string,
  side: Side,
  deck?: number[],
): Combatant {
  return new Combatant(id, side, catalog.character(characterId), deck ?? catalog.deckFor(characterId));
}

//캐릭터의 전용기 id 를 자리로 찾는다. 테스트에서 숫자를 외우지 않기 위한 것
export function skillOf(characterId: string, slot: 'S1' | 'S2' | 'S3'): number {
  const found = catalog
    .deckFor(characterId)
    .find((id) => catalog.skill(id).slot === slot);
  if (found === undefined) throw new Error(`${characterId} 에 ${slot} 이 없다`);
  return found;
}

//합 판정기를 만든다. 두 번째 인자는 예전 진영 조회 자리라 받기만 한다
export function makeResolver(rng: Rng, _members: Combatant[] = []): ClashResolver {
  return new ClashResolver(catalog, rng);
}
