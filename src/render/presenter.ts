//전투 이벤트를 렌더 명령으로 바꾼다. 도메인이 이벤트를 내보내고 어댑터가 받는 구조 그대로다
//CameraDirector 와 같은 자리에 있고, 이쪽은 "무엇을 어디에 그릴지"를 정한다
//
//실제 그리기(three.js·canvas)는 여기서 하지 않는다. 명령까지만 낸다

import type { BattleCatalog } from '../domain/data.js';
import type { BattleEvent } from '../domain/types.js';
import type { Point } from './manifest.js';
import type { EffectPlacement, Stage, StagePlacement } from './stage.js';

//참가자 id 로 무대 배치를 찾는 통로. 화면 좌표는 도메인이 아니라 여기가 들고 있다
export interface PresenterContext {
  actor(combatantId: string): StagePlacement;
}

//렌더러가 받아 해석할 명령
export type RenderCommand =
  | { type: 'playFrames'; combatantId: string; frameIds: string[] }
  | { type: 'spawnEffect'; sourceId: string; targetId: string | null; placement: EffectPlacement }
  | { type: 'playCutscene'; combatantId: string };

//지금 진행 중인 교전. 피해가 들어왔을 때 누가 때린 건지 알아야 한다
interface ActiveEngagement {
  attackerId: string;
  attackerFrameId: string;
  defenderId: string;
  defenderFrameId: string | null;
}

export class BattlePresenter {
  //교전 상태는 여기 하나만 둔다. 카메라와 같은 이유로 두 군데서 들지 않는다
  private engagement: ActiveEngagement | null = null;

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

  //교전이 시작되면 양쪽이 자기 전용기 동작에 들어간다
  private beginEngagement(
    commands: RenderCommand[],
    attackerId: string,
    attackerSkillId: number,
    defenderId: string,
    defenderSkillId: number | null,
  ): void {
    const attackerFrames = this.pushSkill(commands, attackerId, attackerSkillId);
    const defenderFrames = defenderSkillId === null ? null : this.pushSkill(commands, defenderId, defenderSkillId);

    this.engagement = {
      attackerId,
      //이펙트는 실제로 휘두르는 프레임에 붙는다. 마지막 장이 그 순간이다
      attackerFrameId: attackerFrames[attackerFrames.length - 1] ?? this.namedFrame(attackerId, 'idle'),
      defenderId,
      defenderFrameId: defenderFrames ? (defenderFrames[defenderFrames.length - 1] ?? null) : null,
    };
  }

  //전용기 하나의 프레임 순서를 낸다. 궁극기는 컷신으로 빠진다
  private pushSkill(commands: RenderCommand[], combatantId: string, skillId: number): string[] {
    const slot = this.battle.skill(skillId).slot;
    if (slot === 'ULT') {
      commands.push({ type: 'playCutscene', combatantId });
      return [];
    }

    const catalog = this.stage.catalogFor(this.context.actor(combatantId).characterId);
    const frameIds = catalog.frameSequence(slot);
    if (frameIds.length > 0) commands.push({ type: 'playFrames', combatantId, frameIds });
    return frameIds;
  }

  //피해를 받은 쪽이 피격 자세를 잡고, 그 몸에 명중 섬광이 붙는다
  private onDamage(commands: RenderCommand[], damagedId: string): void {
    this.pushNamedFrame(commands, damagedId, 'hit');

    const engagement = this.engagement;
    if (!engagement) return;

    //때린 쪽은 교전의 반대편이다. 자기 체력을 지불한 경우엔 명중이 아니라 넘어간다
    const sourceId = damagedId === engagement.defenderId ? engagement.attackerId : engagement.defenderId;
    if (sourceId === damagedId) return;

    const source = this.context.actor(sourceId);
    const target = this.context.actor(damagedId);
    const sourceFrameId =
      sourceId === engagement.attackerId ? engagement.attackerFrameId : engagement.defenderFrameId;
    if (!sourceFrameId) return;

    //명중 자리에 붙는 이펙트를 데이터에서 찾는다. id 를 코드에 박지 않는다
    for (const effect of this.stage.catalogFor(source.characterId).effectsByAnchor('hitPoint')) {
      const placement = this.stage.placeEffect(effect.id, {
        source,
        sourceFrameId,
        target,
        targetFrameId: this.frameOf(damagedId, engagement),
      });
      commands.push({ type: 'spawnEffect', sourceId, targetId: damagedId, placement });
    }
  }

  //교전이 끝나면 둘 다 기본 자세로 돌아간다
  private endEngagement(commands: RenderCommand[], combatantIds: string[]): void {
    for (const id of combatantIds) this.pushNamedFrame(commands, id, 'idle');
    this.engagement = null;
  }

  //이름 끝으로 찾은 프레임 하나를 재생시킨다
  private pushNamedFrame(commands: RenderCommand[], combatantId: string, suffix: string): void {
    const frameId = this.namedFrame(combatantId, suffix);
    commands.push({ type: 'playFrames', combatantId, frameIds: [frameId] });
  }

  //idle·hit·guard 처럼 이름으로 찾는 프레임. 없으면 첫 프레임으로 떨어진다
  private namedFrame(combatantId: string, suffix: string): string {
    const catalog = this.stage.catalogFor(this.context.actor(combatantId).characterId);
    const found = catalog.frameEndingWith(suffix);
    return found ? found.id : (catalog.manifest.frames[0]?.id ?? suffix);
  }

  //교전 안에서 이 참가자가 지금 쓰고 있는 프레임
  private frameOf(combatantId: string, engagement: ActiveEngagement): string {
    if (combatantId === engagement.attackerId) return engagement.attackerFrameId;
    return engagement.defenderFrameId ?? this.namedFrame(combatantId, 'idle');
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
