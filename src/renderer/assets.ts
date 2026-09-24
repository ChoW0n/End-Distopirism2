//브라우저에서 에셋을 읽는다. node-manifest.ts 와 같은 자리의 웹판이다
//파서는 순수 모듈을 그대로 쓴다. 규격 검사를 두 벌 만들지 않는다

import {
  EMPTY_BINDINGS,
  SpriteCatalog,
  parseEffectBindings,
  parseSpriteManifest,
  type EffectBindings,
} from '../render/manifest.js';
import { parseUiData, type UiData } from '../ui/data.js';
import { parseMapPlacement, type MapPlacement } from './scene.js';
import type { ImageSource } from './canvas.js';

async function json(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 를 읽을 수 없다 (${response.status})`);
  return response.json();
}

//비트맵 하나. 실패하면 null 이고 화면에서 빠진다
function image(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = url;
  });
}

//캐릭터 하나의 에셋. 매니페스트가 없으면 null 이다 (SPEC-002 §10)
export async function loadCharacter(root: string, characterId: string): Promise<SpriteCatalog | null> {
  let manifest;
  try {
    manifest = parseSpriteManifest(await json(`${root}/${characterId}/sprite-manifest.json`));
  } catch {
    return null;
  }

  let bindings: EffectBindings = EMPTY_BINDINGS;
  try {
    bindings = parseEffectBindings(await json(`${root}/${characterId}/effect-bindings.json`));
  } catch {
    //바인딩은 없어도 프레임은 돈다
  }
  return new SpriteCatalog(manifest, bindings);
}

export async function loadUi(root: string): Promise<UiData> {
  return parseUiData(await json(`${root}/ui/ui-data.json`));
}

export async function loadMap(root: string): Promise<MapPlacement> {
  return parseMapPlacement(await json(`${root}/map/placement.json`));
}

//매니페스트가 가리키는 그림을 전부 미리 받아 둔다.
//중간에 받으면 첫 공격에서 이펙트가 한 박자 늦게 뜬다
export class ImageBank implements ImageSource {
  private readonly bitmaps = new Map<string, HTMLImageElement>();
  private readonly missing = new Set<string>();

  constructor(private readonly root: string) {}

  //캐릭터 하나가 쓰는 파일을 전부 받는다
  async preloadCharacter(characterId: string, catalog: SpriteCatalog): Promise<void> {
    const files = new Set<string>();
    for (const frame of catalog.manifest.frames) files.add(frame.file);
    for (const effect of catalog.manifest.effects) {
      for (const frame of effect.frames) files.add(frame.file);
    }
    for (const layer of catalog.manifest.cutscene?.layers ?? []) files.add(layer.file);
    //메시 컷신은 전경·배경·눈·입 네 장이다
    const mesh = catalog.manifest.meshCutscene;
    if (mesh) for (const file of [mesh.foreground, mesh.background, mesh.eye.file, mesh.mouth.file]) files.add(file);

    await Promise.all([...files].map((file) => this.take(`${characterId}/${file}`)));
  }

  //배경을 받는다
  async preloadMap(placement: MapPlacement): Promise<void> {
    await Promise.all(placement.layers.map((layer) => this.take(`map/${layer.file}`)));
  }

  private async take(key: string): Promise<void> {
    if (this.bitmaps.has(key) || this.missing.has(key)) return;
    const bitmap = await image(`${this.root}/${key}`);
    if (bitmap) this.bitmaps.set(key, bitmap);
    else this.missing.add(key);
  }

  character(characterId: string, file: string): CanvasImageSource | null {
    return this.bitmaps.get(`${characterId}/${file}`) ?? null;
  }

  map(file: string): CanvasImageSource | null {
    return this.bitmaps.get(`map/${file}`) ?? null;
  }

  //못 받은 파일. 화면이 비면 여기부터 본다
  get missingFiles(): string[] {
    return [...this.missing];
  }
}
