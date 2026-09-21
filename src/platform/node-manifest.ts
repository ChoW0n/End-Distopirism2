//스프라이트 에셋을 파일에서 읽어오는 어댑터
//도메인의 node-data.ts 와 같은 자리다. 렌더 계층은 파일 시스템을 모른다

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMPTY_BINDINGS,
  SpriteCatalog,
  parseEffectBindings,
  parseSpriteManifest,
  type EffectBindings,
} from '../render/manifest.js';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

//캐릭터 폴더 하나를 읽는다. 매니페스트는 필수, 이펙트 바인딩은 있으면 쓴다
//바인딩이 없어도 프레임은 돌아간다. 에셋이 단계적으로 들어오는 걸 전제한 것이다
export function loadSpriteCatalog(manifestPath: string, bindingsPath?: string): SpriteCatalog {
  const manifest = parseSpriteManifest(readJson(manifestPath));
  let bindings: EffectBindings = EMPTY_BINDINGS;

  if (bindingsPath && existsSync(bindingsPath)) {
    bindings = parseEffectBindings(readJson(bindingsPath));
    if (bindings.character !== manifest.character) {
      throw new Error(`이펙트 바인딩의 캐릭터가 다르다: ${bindings.character} vs ${manifest.character}`);
    }
  }

  return new SpriteCatalog(manifest, bindings);
}

//assets/<캐릭터>/ 폴더 규칙대로 읽는다. 새 캐릭터는 폴더만 만들면 된다
export function loadCharacterAssets(assetsRoot: string, characterId: string): SpriteCatalog | null {
  const dir = join(assetsRoot, characterId);
  const manifestPath = join(dir, 'sprite-manifest.json');
  //에셋이 아직 없는 캐릭터는 null 이다. 다른 캐릭터 에셋을 대신 물리지 않는다 (SPEC-002 §10)
  if (!existsSync(manifestPath)) return null;
  return loadSpriteCatalog(manifestPath, join(dir, 'effect-bindings.json'));
}

//전투에 나오는 캐릭터들의 에셋을 한 번에 읽는다. 없는 캐릭터는 빠진다
export function loadStageCatalogs(
  assetsRoot: string,
  characterIds: readonly string[],
): Map<string, SpriteCatalog> {
  const catalogs = new Map<string, SpriteCatalog>();
  for (const id of characterIds) {
    const catalog = loadCharacterAssets(assetsRoot, id);
    if (catalog) catalogs.set(id, catalog);
  }
  return catalogs;
}
