//전투 이벤트를 보고 카메라가 어떤 상태여야 하는지 정한다
//three.js·DOM 은 여기 들어오지 않는다. 실제로 움직이는 건 나중에 붙일 렌더러 어댑터의 일이다
//
//원본 카메라 버그는 커서추종 Lerp 와 DOTween 복귀 트윈이 각자 transform 을 덮어써서 생겼다.
//쓰는 주체가 둘이었던 게 원인이라 여기서는 "지금 뭘 보고 있는지"를 필드 하나로만 들고 있는다

import type { BattleEvent } from '../domain/types.js';

//처형은 피해량과 무관하게 최대로 흔든다
const SHAKE_MAX = 1;

//카메라 수치. assets/ui/ui-data.json 의 camera 절에서 온다 (SPEC-005 §4)
export interface CameraTuning {
  //교전에 붙었을 때의 확대 배율
  focusZoom: number;
  //라운드마다 순간적으로 더 당기는 양과 시간
  punchZoom: number;
  punchSec: number;
  //합 중에 화면을 기울이는 각도. 일방 공격은 기울이지 않는다
  tiltDeg: number;
  //격파 슬로모
  slowmoScale: number;
  slowmoSec: number;
  //이 피해량이면 흔들림이 최대가 된다
  shakeReferenceDamage: number;
}

//렌더러가 받아 해석할 카메라 명령
export type CameraCommand =
  | { type: 'idle' }
  | { type: 'focus'; subjectIds: [string, string]; zoom: number; tiltDeg: number }
  | { type: 'shake'; intensity: number }
  //아래 둘은 순간 효과다. 보고 있는 대상(shot)은 안 바뀐다
  | { type: 'punch'; zoom: number; sec: number }
  | { type: 'slowmo'; scale: number; sec: number };

//카메라가 지금 보고 있는 것. 이 값이 카메라 상태의 유일한 출처다. 기울기도 여기 들어 있다
export type CameraShot =
  | { kind: 'idle' }
  | { kind: 'focus'; subjectIds: [string, string]; zoom: number; tiltDeg: number };

//교전이 시작되는 이벤트인지 본다
function isEngagementStart(event: BattleEvent): boolean {
  return event.type === 'clashStart' || event.type === 'oneSidedStart';
}

export class CameraDirector {
  //카메라 상태는 여기 하나뿐이다. 다른 곳에 복제해두지 않는다
  private shot: CameraShot = { kind: 'idle' };

  //수치는 데이터에서 받는다. 코드에 박지 않는다
  constructor(private readonly tuning: CameraTuning) {}

  //지금 카메라가 보고 있는 것
  get currentShot(): CameraShot {
    return this.shot;
  }

  //이벤트 묶음을 받아 카메라 명령 목록을 낸다. 도메인이 이벤트를 내보내는 것과 같은 방식이다.
  //upcoming 은 이번 묶음 뒤에 올 이벤트다. 이벤트를 하나씩 흘릴 때 원경 판단에 쓴다 (SPEC-005 §3.1)
  consume(events: readonly BattleEvent[], upcoming: readonly BattleEvent[] = []): CameraCommand[] {
    const commands: CameraCommand[] = [];

    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (!event) continue;

      switch (event.type) {
        //합은 기울여서 긴장을 준다. 일방 공격은 똑바로 본다
        case 'clashStart':
          this.pushShot(commands, {
            kind: 'focus',
            subjectIds: [event.attackerId, event.defenderId],
            zoom: this.tuning.focusZoom,
            tiltDeg: this.tuning.tiltDeg,
          });
          break;

        case 'oneSidedStart':
          this.pushShot(commands, {
            kind: 'focus',
            subjectIds: [event.attackerId, event.targetId],
            zoom: this.tuning.focusZoom,
            tiltDeg: 0,
          });
          break;

        //합이 한 번 오갈 때마다 순간적으로 당긴다
        case 'clashRoundWin':
        case 'deadlock':
          commands.push({ type: 'punch', zoom: this.tuning.punchZoom, sec: this.tuning.punchSec });
          break;

        //쓰러지는 순간을 늘여 보여 준다
        case 'defeated':
          commands.push({ type: 'slowmo', scale: this.tuning.slowmoScale, sec: this.tuning.slowmoSec });
          break;

        //피해는 보고 있는 대상을 바꾸지 않는다. 화면만 한 번 흔든다
        case 'damageApplied':
          if (event.damage > 0) {
            commands.push({ type: 'shake', intensity: Math.min(1, event.damage / this.tuning.shakeReferenceDamage) });
          }
          break;

        case 'executed':
          commands.push({ type: 'shake', intensity: SHAKE_MAX });
          break;

        //교전이 끝나도 뒤에 다른 교전이 남아 있으면 그쪽이 이어받는다. 사이에 원경을 끼우면 깜빡인다
        case 'clashEnd':
        case 'oneSidedEnd':
          if (![...events.slice(i + 1), ...upcoming].some(isEngagementStart)) {
            this.pushShot(commands, { kind: 'idle' });
          }
          break;

        case 'battleEnd':
          this.pushShot(commands, { kind: 'idle' });
          break;

        default:
          break;
      }
    }

    return commands;
  }

  //상태를 바꾸고 실제로 달라졌을 때만 명령을 낸다. 같은 그림을 두 번 지시하지 않는다
  private pushShot(commands: CameraCommand[], next: CameraShot): void {
    if (this.sameAsCurrent(next)) return;
    this.shot = next;
    commands.push(
      next.kind === 'idle'
        ? { type: 'idle' }
        : { type: 'focus', subjectIds: next.subjectIds, zoom: next.zoom, tiltDeg: next.tiltDeg },
    );
  }

  //바꾸려는 상태가 지금과 같은지 본다
  private sameAsCurrent(next: CameraShot): boolean {
    const current = this.shot;
    if (current.kind !== next.kind) return false;
    if (current.kind === 'idle' || next.kind === 'idle') return true;
    return (
      current.subjectIds[0] === next.subjectIds[0] &&
      current.subjectIds[1] === next.subjectIds[1] &&
      current.zoom === next.zoom &&
      current.tiltDeg === next.tiltDeg
    );
  }
}
