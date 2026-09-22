//SPEC-002 §5.1 의 앵커 4종이 실제 좌표로 제대로 풀리는지 본다
//목 데이터를 만들지 않고 리포에 있는 소각원 매니페스트를 그대로 쓴다

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCharacterAssets } from '../src/platform/node-manifest.js';
import { Stage, StageError, type StagePlacement } from '../src/render/stage.js';
import { SpriteCatalog, SpriteManifestError, parseSpriteManifest } from '../src/render/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../assets');
const sprites = loadCharacterAssets(assets, 'incinerator')!;

//에셋이 들어온 캐릭터만 무대에 오른다. 나머지는 매니페스트가 아직 없다
const stage = new Stage(new Map([['incinerator', sprites]]));

//무대 위 한 자리
function at(combatantId: string, x: number, facing: 1 | -1 = 1, characterId = 'incinerator'): StagePlacement {
  return { combatantId, characterId, position: { x, y: sprites.ground.y }, facing };
}

const CAST = '06-skill1-cast';

//이펙트가 실제로 놓일 때 먹는 배율. 긴 변이 캐릭터 키 × scale 이 된다 (SPEC-002 §5.5)
function ratioOf(effectId: string): number {
  const effect = sprites.effect(effectId);
  return (sprites.characterHeight * effect.scale) / Math.max(effect.size.width, effect.size.height);
}

describe('매니페스트 파싱', () => {
  it('실제 매니페스트가 규격을 만족한다', () => {
    expect(sprites.manifest.canvas).toEqual({ width: 2400, height: 1500 });
    expect(sprites.ground).toEqual({ x: 1200, y: 1340 });
    expect(sprites.manifest.frames).toHaveLength(12);
    expect(sprites.manifest.cutscene?.layers).toHaveLength(13);
  });

  it('전용기 자리마다 프레임 수가 v2.0 §1 과 맞는다', () => {
    expect(sprites.frameSequence('S1')).toHaveLength(2);
    expect(sprites.frameSequence('S2')).toHaveLength(2);
    expect(sprites.frameSequence('S3')).toHaveLength(3);
  });

  it('공격 프레임에 날끝이 없으면 거부한다', () => {
    const broken = JSON.parse(JSON.stringify(sprites.manifest)) as Record<string, unknown>;
    const frames = broken['frames'] as { id: string; bladeTip: unknown }[];
    const attack = frames.find((f) => f.id.includes('skill'))!;
    attack.bladeTip = null;

    //파서는 [x, y] 배열을 기대하므로 캔버스 규격대로 다시 만들어 넣는다
    const raw = {
      ...broken,
      canvas: [2400, 1500],
      ground: [1200, 1340],
      frames: frames.map((f) => rawFrame(f as never)),
    };
    expect(() => parseSpriteManifest(raw)).toThrow(SpriteManifestError);
  });

  it('없는 프레임이나 이펙트를 찾으면 던진다', () => {
    expect(() => sprites.frame('없는-프레임')).toThrow(SpriteManifestError);
    expect(() => sprites.effect('없는-이펙트')).toThrow(SpriteManifestError);
  });
});

describe('§3.1 배치는 anchor 로만 한다', () => {
  it('프레임이 달라도 접지점은 무대 위치 그대로다', () => {
    const placement = at('a1', 500);

    //12프레임 전부 anchor 가 같으므로 좌상단도 같은 자리여야 한다
    const origins = sprites.manifest.frames.map((f) => stage.frameOrigin(placement, f.id));
    for (const origin of origins) {
      expect(origin).toEqual(origins[0]);
    }
    //anchor [1200,1340] 이 무대 (500, 1340) 에 오므로 좌상단은 (-700, 0)
    expect(origins[0]).toEqual({ x: -700, y: 0 });
  });

  it('이미지 bbox 가 달라도 배치가 흔들리지 않는다', () => {
    //bbox 폭이 가장 다른 두 프레임을 골라 비교한다
    const widths = sprites.manifest.frames.map((f) => ({ id: f.id, w: f.bbox[2] - f.bbox[0] }));
    widths.sort((a, b) => a.w - b.w);
    const narrow = widths[0]!.id;
    const wide = widths[widths.length - 1]!.id;
    expect(widths[widths.length - 1]!.w - widths[0]!.w).toBeGreaterThan(100);

    const placement = at('a1', 800);
    expect(stage.frameOrigin(placement, narrow)).toEqual(
      stage.frameOrigin(placement, wide),
    );
  });

  it('좌우를 뒤집으면 프레임 안의 점도 같이 뒤집힌다', () => {
    const forward = stage.framePoint(at('a1', 1000, 1), CAST, 'bladeTip');
    const mirrored = stage.framePoint(at('a1', 1000, -1), CAST, 'bladeTip');

    //날끝은 anchor 오른쪽에 있으므로 반전하면 같은 거리만큼 왼쪽으로 간다
    expect(forward.x - 1000).toBeCloseTo(-(mirrored.x - 1000), 6);
    expect(forward.y).toBe(mirrored.y);
  });
});

describe('§5.1 이펙트 앵커 4종', () => {
  const source = at('a1', 600);
  const target = at('e1', 1400, -1);

  it('bladeTip 은 프레임의 날끝에 붙는다', () => {
    const placement = stage.placeEffect('slash-diagonal', {
      source,
      sourceFrameId: CAST,
    });
    const tip = stage.framePoint(source, CAST, 'bladeTip');

    expect(placement.anchorPoint).toEqual(tip);
    //피벗이 앵커에 오도록 좌상단이 뒤로 밀린다. 피벗도 배율을 탄다 (SPEC-002 §5.5)
    const effect = sprites.effect('slash-diagonal');
    const ratio = ratioOf('slash-diagonal');
    expect(placement.origin).toEqual({
      x: tip.x - effect.pivot.x * ratio,
      y: tip.y - effect.pivot.y * ratio,
    });
  });

  it('groundPoint 는 날끝 x 에 접지선 y 다', () => {
    const placement = stage.placeEffect('ground-impact', {
      source,
      sourceFrameId: CAST,
    });
    const tip = stage.framePoint(source, CAST, 'bladeTip');

    expect(placement.anchorPoint.x).toBe(tip.x);
    expect(placement.anchorPoint.y).toBe(sprites.ground.y);
  });

  it('hitPoint 는 맞은 쪽 몸통이지 때린 쪽 무기가 아니다', () => {
    const placement = stage.placeEffect('impact', {
      source,
      sourceFrameId: CAST,
      target,
      targetFrameId: '00-idle',
    });

    //대상 근처에 잡히고 공격자 쪽이 아니다
    expect(Math.abs(placement.anchorPoint.x - target.position.x)).toBeLessThan(200);
    expect(Math.abs(placement.anchorPoint.x - source.position.x)).toBeGreaterThan(500);
    //발밑도 머리 위도 아닌 그 사이다
    const head = stage.framePoint(target, '00-idle', 'headCenter');
    expect(placement.anchorPoint.y).toBeLessThan(target.position.y);
    expect(placement.anchorPoint.y).toBeGreaterThan(head.y);
  });

  it('hitPoint 는 대상이 없으면 풀 수 없다', () => {
    expect(() =>
      stage.placeEffect('impact', { source, sourceFrameId: CAST }),
    ).toThrow(StageError);
  });

  it('emissionPoint 는 넘긴 좌표에 그대로 박힌다', () => {
    const emission = { x: 777, y: 888 };
    const placement = stage.placeEffect('smoke', {
      source,
      sourceFrameId: CAST,
      emission,
    });

    expect(placement.anchorPoint).toEqual(emission);
  });

  it('잔류 이펙트는 무기가 움직여도 따라가지 않는다', () => {
    const emission = stage.framePoint(source, CAST, 'bladeTip');

    const first = stage.placeEffect('embers', { source, sourceFrameId: CAST, emission });
    //같은 발생 좌표를 들고 다른 프레임에서 다시 풀어도 자리가 안 바뀐다
    const later = stage.placeEffect('embers', {
      source,
      sourceFrameId: '11-skill3-finish',
      emission,
    });

    expect(later.anchorPoint).toEqual(first.anchorPoint);
    //무기 자리는 실제로 달라졌는지 확인
    expect(stage.framePoint(source, '11-skill3-finish', 'bladeTip')).not.toEqual(emission);
  });

  it('emissionPoint 인데 좌표를 안 주면 던진다', () => {
    expect(() =>
      stage.placeEffect('smoke', { source, sourceFrameId: CAST }),
    ).toThrow(StageError);
  });
});

describe('§6 합성과 반전', () => {
  it('이펙트마다 배율이 따로 있다', () => {
    //v4 팩 기준. 일괄 배율을 쓰면 베기가 명중 섬광만큼 작아진다 (SPEC-002 §5.5)
    const scales = sprites.manifest.effects.map((e) => e.scale);
    expect(scales.every((s) => s > 0)).toBe(true);
    expect(new Set(scales).size).toBeGreaterThan(1);
  });

  it('배율이 비트맵과 피벗에 같이 먹는다', () => {
    //긴 변이 캐릭터 키 × scale 이 된다 (SPEC-002 §5.5)
    const H = sprites.characterHeight;
    for (const effect of sprites.manifest.effects) {
      if (effect.anchor !== 'bladeTip') continue;
      const placement = stage.placeEffect(effect.id, { source: at('a1', 600), sourceFrameId: CAST });
      expect(Math.max(placement.size.width, placement.size.height)).toBeCloseTo(H * effect.scale);

      //피벗이 앵커에 그대로 얹힌다. 비트맵만 키우면 여기가 어긋난다
      const ratio = placement.size.width / effect.size.width;
      expect(placement.anchorPoint.x - placement.origin.x).toBeCloseTo(effect.pivot.x * ratio);
      expect(placement.anchorPoint.y - placement.origin.y).toBeCloseTo(effect.pivot.y * ratio);
    }
  });

  it('배율이 달라도 베기가 명중 섬광보다 크다', () => {
    const slash = sprites.effect('slash-downward');
    const impact = sprites.effect('impact');
    expect(slash.scale).toBeGreaterThan(impact.scale);
  });

  it('모든 이펙트가 일반 알파 합성이다', () => {
    for (const effect of sprites.manifest.effects) {
      expect(effect.blend).toBe('source-over');
    }
  });

  it('이펙트를 뒤집으면 피벗도 같이 뒤집힌다', () => {
    const source = at('a1', 600);
    const effect = sprites.effect('slash-diagonal');

    const normal = stage.placeEffect('slash-diagonal', { source, sourceFrameId: CAST });
    const flipped = stage.placeEffect(
      'slash-diagonal',
      { source, sourceFrameId: CAST },
      { flipped: true },
    );

    //앵커가 가리키는 점은 그대로고 비트맵만 반대편으로 놓인다
    expect(flipped.anchorPoint).toEqual(normal.anchorPoint);
    const ratio = ratioOf('slash-diagonal');
    expect(flipped.origin.x).toBeCloseTo(
      normal.anchorPoint.x - (effect.size.width - effect.pivot.x) * ratio,
    );
    expect(flipped.flipped).toBe(true);
  });

  it('매니페스트가 없는 캐릭터는 배치할 수 없다', () => {
    const empty = new Stage(new Map<string, SpriteCatalog>());
    expect(empty.has('incinerator')).toBe(false);
    expect(() => empty.catalogFor('incinerator')).toThrow(StageError);
  });
});

//파싱 테스트용으로 프레임을 원본 JSON 모양으로 되돌린다
function rawFrame(frame: {
  id: string;
  file: string;
  scale: number;
  scaleMatch: number;
  anchor: { x: number; y: number };
  headCenter: { x: number; y: number };
  axeHead: { x: number; y: number } | null;
  bladeTip: { x: number; y: number } | null;
  tipSource: string;
  bbox: number[];
}): Record<string, unknown> {
  const pair = (p: { x: number; y: number } | null) => (p ? [p.x, p.y] : null);
  return {
    id: frame.id,
    file: frame.file,
    scale: frame.scale,
    scaleMatch: frame.scaleMatch,
    anchor: pair(frame.anchor),
    headCenter: pair(frame.headCenter),
    axeHead: pair(frame.axeHead),
    bladeTip: pair(frame.bladeTip),
    tipSource: frame.tipSource,
    bbox: frame.bbox,
  };
}
