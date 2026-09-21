//무대 위 좌표를 계산한다. SPEC-002 §5.1 의 앵커 4종이 여기서 실제 좌표로 바뀐다
//
//배치는 매니페스트의 anchor 로만 한다. 이미지 크기로 배치하지 않는다 (SPEC-002 §3.1).
//프레임마다 캐릭터 크기가 달라서 이미지 기준으로 놓으면 공격할 때마다 캐릭터가 움직인다

import type { EffectData, Point, SpriteCatalog } from './manifest.js';

//무대에 선 캐릭터 하나. position 은 발이 닿는 지점이다
//combatantId 는 전투 안의 식별자, characterId 는 어느 스프라이트를 쓰는지다. 둘은 다르다
export interface StagePlacement {
  combatantId: string;
  characterId: string;
  position: Point;
  //1 이면 원본 방향, -1 이면 좌우 반전
  facing: 1 | -1;
}

//이펙트 좌표를 풀 때 필요한 주변 정보
export interface EffectContext {
  //이펙트를 내는 쪽
  source: StagePlacement;
  sourceFrameId: string;
  //맞는 쪽. hitPoint 를 풀려면 있어야 한다
  target?: StagePlacement;
  targetFrameId?: string;
  //emissionPoint 용. 발생 시점에 확정된 월드 좌표
  emission?: Point;
}

//화면에 놓일 이펙트 한 장
export interface EffectPlacement {
  effectId: string;
  //비트맵 좌상단이 놓일 무대 좌표
  origin: Point;
  //피벗이 실제로 놓인 무대 좌표. 회전 중심이자 앵커가 가리키는 점이다
  anchorPoint: Point;
  size: { width: number; height: number };
  flipped: boolean;
  blend: string;
  loop: boolean;
  frames: { file: string; ms: number }[];
}

//좌표를 풀 수 없을 때 던진다
export class StageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageError';
  }
}

export class Stage {
  //캐릭터마다 스프라이트 조회표가 다르다. 없는 캐릭터는 배치할 수 없다
  constructor(private readonly catalogs: ReadonlyMap<string, SpriteCatalog>) {}

  //이 참가자의 스프라이트 조회표를 찾는다
  catalogFor(characterId: string): SpriteCatalog {
    const found = this.catalogs.get(characterId);
    if (!found) throw new StageError(`스프라이트 매니페스트가 없다: ${characterId}`);
    return found;
  }

  //프레임 안의 한 점을 무대 좌표로 옮긴다.
  //anchor 를 원점으로 본 상대 위치를 무대 위치에 얹고, 반전이면 x 만 뒤집는다
  framePoint(
    placement: StagePlacement,
    frameId: string,
    key: 'headCenter' | 'bladeTip' | 'axeHead',
  ): Point {
    const frame = this.catalogFor(placement.characterId).frame(frameId);
    const local = frame[key];
    if (!local) throw new StageError(`${frameId} 에 ${key} 좌표가 없다`);

    return {
      x: placement.position.x + placement.facing * (local.x - frame.anchor.x),
      y: placement.position.y + (local.y - frame.anchor.y),
    };
  }

  //프레임 비트맵의 좌상단이 놓일 무대 좌표. 렌더러는 이 값으로 그린다
  frameOrigin(placement: StagePlacement, frameId: string): Point {
    const catalog = this.catalogFor(placement.characterId);
    const frame = catalog.frame(frameId);
    const canvas = catalog.manifest.canvas;

    //반전이면 캔버스를 뒤집으므로 anchor 의 반대편 거리만큼 왼쪽으로 민다
    const offsetX = placement.facing === 1 ? frame.anchor.x : canvas.width - frame.anchor.x;
    return {
      x: placement.position.x - offsetX,
      y: placement.position.y - frame.anchor.y,
    };
  }

  //이펙트가 붙을 지점을 앵커 종류에 따라 푼다 (SPEC-002 §5.1)
  resolveAnchor(effect: EffectData, context: EffectContext): Point {
    switch (effect.anchor) {
      //프레임의 날끝. 베기 궤적이 여기 붙는다
      case 'bladeTip':
        return this.framePoint(context.source, context.sourceFrameId, 'bladeTip');

      //날끝 x 에 접지선 y. 지면 충격과 수직 화염이 여기 붙는다
      case 'groundPoint': {
        const tip = this.framePoint(context.source, context.sourceFrameId, 'bladeTip');
        return { x: tip.x, y: context.source.position.y };
      }

      //맞은 대상의 좌표. 도메인은 id 만 주므로 어댑터가 좌표로 바꾼다 (SPEC-002 §5.3)
      case 'hitPoint':
        return this.hitPoint(context);

      //발생 지점을 그대로 쓴다. 무기를 따라가지 않는다 (SPEC-002 §6)
      case 'emissionPoint':
        if (!context.emission) throw new StageError(`${effect.id} 는 발생 좌표가 있어야 한다`);
        return { ...context.emission };
    }
  }

  //맞은 쪽의 몸통 높이. 접지점과 머리 중심의 중간을 쓴다
  private hitPoint(context: EffectContext): Point {
    const { target, targetFrameId } = context;
    if (!target || !targetFrameId) throw new StageError('명중 좌표를 풀려면 대상이 있어야 한다');

    const head = this.framePoint(target, targetFrameId, 'headCenter');
    return {
      x: (target.position.x + head.x) / 2,
      y: (target.position.y + head.y) / 2,
    };
  }

  //이펙트 한 장을 화면에 놓는다. 피벗이 앵커 지점에 오도록 좌상단을 뒤로 민다
  placeEffect(
    effectId: string,
    context: EffectContext,
    options: { flipped?: boolean } = {},
  ): EffectPlacement {
    const catalog = this.catalogFor(context.source.characterId);
    const effect = catalog.effect(effectId);
    const anchorPoint = this.resolveAnchor(effect, context);

    //반전 시 비트맵과 피벗을 함께 뒤집는다. 캐릭터 반전과 따로 판단한다 (SPEC-002 §6-5)
    const flipped = options.flipped ?? false;
    const pivotX = flipped ? effect.size.width - effect.pivot.x : effect.pivot.x;

    return {
      effectId,
      origin: { x: anchorPoint.x - pivotX, y: anchorPoint.y - effect.pivot.y },
      anchorPoint,
      size: effect.size,
      flipped,
      blend: effect.blend,
      loop: effect.loop,
      frames: effect.frames.map((f) => ({ ...f })),
    };
  }
}
