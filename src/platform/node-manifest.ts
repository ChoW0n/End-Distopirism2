//스프라이트 매니페스트를 파일에서 읽어오는 어댑터
//도메인의 node-data.ts 와 같은 자리다. 렌더 계층은 파일 시스템을 모른다

import { readFileSync } from 'node:fs';
import { SpriteCatalog, parseSpriteManifest } from '../render/manifest.js';

//JSON 파일을 읽어 검증된 조회표로 만든다
export function loadSpriteCatalog(path: string): SpriteCatalog {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  return new SpriteCatalog(parseSpriteManifest(raw));
}
