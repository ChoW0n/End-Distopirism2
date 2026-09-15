//파일에서 전투 데이터를 읽어오는 어댑터. 도메인은 파일 시스템을 모르기 때문에
//플랫폼마다 이런 로더를 하나씩 두고 파싱 결과만 도메인에 넘긴다

import { readFileSync } from 'node:fs';
import { BattleCatalog, parseBattleData } from '../domain/data.js';

//JSON 파일을 읽어 검증된 조회표로 만든다
export function loadBattleCatalog(path: string): BattleCatalog {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  return new BattleCatalog(parseBattleData(raw));
}
