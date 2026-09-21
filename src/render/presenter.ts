//전투 이벤트를 렌더 명령으로 바꾼다. 도메인이 이벤트를 내보내고 어댑터가 받는 구조 그대로다
//CameraDirector 와 같은 자리에 있고, 이쪽은 "무엇을 어디에 그릴지"를 정한다
//
//실제 그리기(three.js·canvas)는 여기서 하지 않는다. 명령까지만 낸다

import type { BattleCatalog } from '../domain/data.js';
import type { BattleEvent } from '../domain/types.js';
import { CutsceneDirector, type LayerTransform } from './cutscene.js';
import type { Point, SpriteCatalog } from './manifest.js';
import type { EffectPlacement, Stage, StagePlacement } from './stage.js';

//참가자 id 로 무대 배치를 찾는 통로. 화면 좌표는 도메인이 아니라 여기가 들고 있다
export interface PresenterContext {
  actor(combatantId: string): StagePlacement;
}

//궁극기가 지나가는 네 단계 (SPEC-001 v2.0 §3.1)
//ready 는 턴 종료 판정, cardAdded 는 다음 턴 시작, cutscene 은 실제 사용, used 는 속성 초기화
export type UltimatePhase = 'ready' | 'cardAdded' | 'cutscene' | 'used';

//렌더러가 받아 해석할 명령
export type RenderCommand =
  | { type: 'playFrames'; combatantId: string; frameIds: string[] }
  //frameId 가 있으면 그 프레임이 재생될 때, null 이면 바로 터뜨린다
  | {
      type: 'spawnEffect';
      sourceId: string;
      targetId: string | null;
      frameId: string | null;
      placement: EffectPlacement;
    }
  //컷신 레이어는 cutscene 단계에만 들어 있다. 나머지 단계는 UI 표시용이다
  | { type: 'ultimate'; combatantId: string; phase: UltimatePhase; layers: LayerTransform[] | null }
  //에셋이 아직 안 들어온 캐릭터. 다른 캐릭터 그림을 대신 물리지 않는다 (SPEC-002 §10)
  | { type: 'placeholder'; combatantId: string; characterId: string };

//교전에 참가한 한쪽. 피해가 들어왔을 때 어느 이펙트를 어디에 붙일지 여기서 읽는다
interface EngagementSide {
  combatantId: string;
  //이펙트를 붙일 기준 프레임. 에셋이 아직 없는 캐릭터면 null 이다
  frameId: string | null;
  //이 교전에서 쓸 이펙트 목록. 전용기면 프레임 바인딩, 궁극기면 궁극기 바인딩이다
  effectIds: string[];
}

//지금 진행 중인 교전. 피해가 들어왔을 때 누가 때린 건지 알아야 한다
interface ActiveEngagement {
  attacker: EngagementSide;
  defender: EngagementSide;
}

export class BattlePresenter {
  //교전 상태는 여기 하나만 둔다. 카메라와 같은 이유로 두 군데서 들지 않는다
  private engagement: ActiveEngagement | null = null;
  //궁극기 카드가 덱에 들어오길 기다리는 참가자. 도메인이 다음 턴 시작에 넣어준다
  private ultimatePending = new Set<string>();
  //컷신 감독은 캐릭터마다 하나씩 만들어 재사용한다
  private readonly cutscenes = new Map<string, CutsceneDirector | null>();

  constructor(
    private readonly battle: BattleCatalog,
    private readonly stage: Stage,
    private readonly context: PresenterContext,
  ) {}

  //이벤트 묶음을 받아 렌더 명령 목록을 낸다
  consume(events: readonly BattleEvent[]): RenderCommand[] {
    const commands: RenderCommand[] = [];

    for (const event of events) {
      switch (event.type) {
        //도메인은 카드 추가를 따로 알리지 않는다. 직전 턴의 ready 를 여기서 받아 넘긴다
        case 'turnStart':
          for (const id of this.ultimatePending) this.pushUltimate(commands, id, 'cardAdded');
          this.ultimatePending.clear();
          break;

        case 'ultimateReady':
          this.ultimatePending.add(event.combatantId);
          this.pushUltimate(commands, event.combatantId, 'ready');
          break;

        case 'ultimateUsed':
          this.pushUltimate(commands, event.combatantId, 'used');
          break;

        case 'clashStart':
          this.beginEngagement(commands, event.attackerId, event.attackerSkillId, event.defenderId, event.defenderSkillId);
          break;

        case 'oneSidedStart':
          this.beginEngagement(commands, event.attackerId, event.skillId, event.targetId, null);
          break;

        //피해가 실제로 들어갔을 때만 명중 연출을 낸다 (SPEC-002 §6-1)
        case 'damageApplied':
          if (event.damage > 0) this.onDamage(commands, event.combatantId);
          break;

        //막힌 경우엔 섬광·화염·지면 충격을 띄우지 않는다
        case 'damageNullified':
          this.pushNamedFrame(commands, event.combatantId, 'guard');
          break;

        //쓰러진 자리에 연기·잔불이 남는다. 발생 좌표를 박아 무기 추적을 끊는다
        case 'defeated':
          this.onDefeated(commands, event.combatantId);
          break;

        case 'clashEnd':
          this.endEngagement(commands, [event.attackerId, event.defenderId]);
          break;

        case 'oneSidedEnd':
          this.endEngagement(commands, [event.attackerId, event.targetId]);
          break;

        default:
          break;
      }
    }

    return commands;
  }

  //궁극기 단계 하나를 낸다. cutscene 단계에만 레이어 배치가 실린다
  private pushUltimate(
    commands: RenderCommand[],
    combatantId: string,
    phase: UltimatePhase,
    layers: LayerTransform[] | null = null,
  ): void {
    commands.push({ type: 'ultimate', combatantId, phase, layers });
  }

  //교전이 시작되면 양쪽이 자기 전용기 동작에 들어간다
  private beginEngagement(
    commands: RenderCommand[],
    attackerId: string,
    attackerSkillId: number,
    defenderId: string,
    defenderSkillId: number | null,
  ): void {
    this.engagement = {
      attacker: this.beginSide(commands, attackerId, attackerSkillId),
      defender:
        defenderSkillId === null
          ? { combatantId: defenderId, frameId: this.idleOrNull(defenderId), effectIds: [] }
          : this.beginSide(commands, defenderId, defenderSkillId),
    };
  }

  //한쪽의 동작을 내고, 피해가 들어갔을 때 쓸 프레임과 이펙트를 확정한다
  private beginSide(commands: RenderCommand[], combatantId: string, skillId: number): EngagementSide {
    const placement = this.context.actor(combatantId);
    if (!this.stage.has(placement.characterId)) {
      commands.push({ type: 'placeholder', combatantId, characterId: placement.characterId });
      return { combatantId, frameId: null, effectIds: [] };
    }

    const catalog = this.stage.catalogFor(placement.characterId);
    const isUltimate = this.battle.skill(skillId).slot === 'ULT';
    const side = isUltimate
      ? this.beginUltimate(commands, combatantId, catalog)
      : this.beginSkill(commands, combatantId, catalog, skillId);

    //무기 궤적은 휘두르는 동작 자체라 빗나가도 보인다. 그래서 프레임과 같이 낸다.
    //섬광·지면 충격·화염은 §6-1 대로 피해가 들어간 뒤에만 낸다
    if (side.frameId) {
      for (const effectId of side.effectIds) {
        if (catalog.effect(effectId).anchor !== 'bladeTip') continue;
        commands.push({
          type: 'spawnEffect',
          sourceId: combatantId,
          targetId: null,
          frameId: side.frameId,
          placement: this.stage.placeEffect(effectId, { source: placement, sourceFrameId: side.frameId }),
        });
      }
    }
    return side;
  }

  //전용기 하나의 프레임 순서를 낸다. 이펙트는 마지막 장(실제로 휘두르는 순간)에 붙는다
  private beginSkill(
    commands: RenderCommand[],
    combatantId: string,
    catalog: SpriteCatalog,
    skillId: number,
  ): EngagementSide {
    const slot = this.battle.skill(skillId).slot;
    const frameIds = catalog.frameSequence(slot === 'ULT' ? 'S3' : slot);
    if (frameIds.length === 0) {
      return { combatantId, frameId: this.idleOrNull(combatantId), effectIds: [] };
    }

    commands.push({ type: 'playFrames', combatantId, frameIds });
    //어느 프레임에서 무엇이 터지는지는 캐릭터별 바인딩 파일이 정한다 (SPEC-002 §5.4)
    const frameId = frameIds[frameIds.length - 1] as string;
    return { combatantId, frameId, effectIds: catalog.effectsOnFrame(frameId) };
  }

  //궁극기는 프레임 대신 컷신으로 나간다. 이펙트는 전용기 3의 마무리 자세에 붙는다 (SPEC-002 §5.4)
  private beginUltimate(
    commands: RenderCommand[],
    combatantId: string,
    catalog: SpriteCatalog,
  ): EngagementSide {
    const director = this.cutsceneFor(this.context.actor(combatantId).characterId);
    this.pushUltimate(commands, combatantId, 'cutscene', director ? director.layers(director.peakPose()) : null);

    const finish = catalog.frameSequence('S3');
    return {
      combatantId,
      frameId: finish[finish.length - 1] ?? this.idleOrNull(combatantId),
      effectIds: catalog.bindings.ultimate,
    };
  }

  //캐릭터의 컷신 감독. 컷신 데이터가 없는 캐릭터는 null 이고 레이어 없이 넘어간다
  private cutsceneFor(characterId: string): CutsceneDirector | null {
    const cached = this.cutscenes.get(characterId);
    if (cached !== undefined) return cached;

    const data = this.stage.catalogFor(characterId).manifest.cutscene;
    const director = data ? new CutsceneDirector(data) : null;
    this.cutscenes.set(characterId, director);
    return director;
  }

  //피해를 받은 쪽이 피격 자세를 잡고, 그 몸에 명중 섬광이 붙는다
  private onDamage(commands: RenderCommand[], damagedId: string): void {
    this.pushNamedFrame(commands, damagedId, 'hit');

    const engagement = this.engagement;
    if (!engagement) return;
    if (!this.stage.has(this.context.actor(damagedId).characterId)) return;

    //때린 쪽은 교전의 반대편이다. 자기 체력을 지불한 경우엔 명중이 아니라 넘어간다
    const attacked = damagedId === engagement.defender.combatantId;
    const side = attacked ? engagement.attacker : engagement.defender;
    if (side.combatantId === damagedId) return;

    const source = this.context.actor(side.combatantId);
    const target = this.context.actor(damagedId);
    if (!this.stage.has(source.characterId)) return;
    if (!side.frameId) return;

    const catalog = this.stage.catalogFor(source.characterId);
    const targetFrameId = (attacked ? engagement.defender : engagement.attacker).frameId ?? undefined;
    const context = { source, sourceFrameId: side.frameId, target, targetFrameId };

    //명중 자리에 붙는 이펙트를 데이터에서 찾는다. id 를 코드에 박지 않는다
    for (const effect of catalog.effectsByAnchor('hitPoint')) {
      //피해가 확정된 순간이라 프레임을 기다리지 않는다
      commands.push({
        type: 'spawnEffect',
        sourceId: side.combatantId,
        targetId: damagedId,
        frameId: null,
        placement: this.stage.placeEffect(effect.id, context),
      });
    }

    //이 교전에 묶인 지면 충격·화염도 여기서 낸다. 맞았을 때만 나와야 하기 때문이다
    for (const effectId of side.effectIds) {
      const anchor = catalog.effect(effectId).anchor;
      if (anchor === 'bladeTip' || anchor === 'hitPoint') continue;
      commands.push({
        type: 'spawnEffect',
        sourceId: side.combatantId,
        targetId: damagedId,
        frameId: null,
        //발생 좌표는 때린 순간의 날끝이다. 이후 무기를 따라가지 않는다
        placement: this.stage.placeEffect(effectId, {
          ...context,
          emission: this.stage.framePoint(source, side.frameId, 'bladeTip'),
        }),
      });
    }
  }

  //격파 잔류 이펙트. 쓰러진 자리의 월드 좌표를 그대로 박는다 (SPEC-002 §6)
  private onDefeated(commands: RenderCommand[], combatantId: string): void {
    const placement = this.context.actor(combatantId);
    if (!this.stage.has(placement.characterId)) return;

    const catalog = this.stage.catalogFor(placement.characterId);
    if (catalog.bindings.defeat.length === 0) return;

    const idle = this.namedFrame(combatantId, 'idle');
    //몸통 높이에서 피어오른다. 접지점과 머리 중심의 중간을 쓴다
    const head = this.stage.framePoint(placement, idle, 'headCenter');
    const emission = {
      x: (placement.position.x + head.x) / 2,
      y: (placement.position.y + head.y) / 2,
    };

    for (const effectId of catalog.bindings.defeat) {
      commands.push({
        type: 'spawnEffect',
        sourceId: combatantId,
        targetId: null,
        frameId: null,
        placement: this.stage.placeEffect(effectId, {
          source: placement,
          sourceFrameId: idle,
          emission,
        }),
      });
    }
  }

  //교전이 끝나면 둘 다 기본 자세로 돌아간다
  private endEngagement(commands: RenderCommand[], combatantIds: string[]): void {
    for (const id of combatantIds) this.pushNamedFrame(commands, id, 'idle');
    this.engagement = null;
  }

  //이름 끝으로 찾은 프레임 하나를 재생시킨다. 에셋이 없으면 플레이스홀더로 빠진다
  private pushNamedFrame(commands: RenderCommand[], combatantId: string, suffix: string): void {
    const placement = this.context.actor(combatantId);
    if (!this.stage.has(placement.characterId)) {
      commands.push({ type: 'placeholder', combatantId, characterId: placement.characterId });
      return;
    }
    commands.push({ type: 'playFrames', combatantId, frameIds: [this.namedFrame(combatantId, suffix)] });
  }

  //idle·hit·guard 처럼 이름으로 찾는 프레임. 없으면 첫 프레임으로 떨어진다
  private namedFrame(combatantId: string, suffix: string): string {
    const catalog = this.stage.catalogFor(this.context.actor(combatantId).characterId);
    const found = catalog.frameEndingWith(suffix);
    return found ? found.id : (catalog.manifest.frames[0]?.id ?? suffix);
  }

  //에셋이 있으면 기본 프레임, 없으면 null. 플레이스홀더 캐릭터가 섞여도 터지지 않게 한다
  private idleOrNull(combatantId: string): string | null {
    if (!this.stage.has(this.context.actor(combatantId).characterId)) return null;
    return this.namedFrame(combatantId, 'idle');
  }
}

//잔류 이펙트를 발생 좌표에 묶어 둔다. 무기를 따라가지 않는다 (SPEC-002 §6)
//호출한 쪽이 생성 시점의 월드 좌표를 넘기면 그 값이 그대로 박힌다
export function spawnResidual(
  stage: Stage,
  effectId: string,
  source: StagePlacement,
  sourceFrameId: string,
  emission: Point,
): EffectPlacement {
  return stage.placeEffect(effectId, { source, sourceFrameId, emission });
}
