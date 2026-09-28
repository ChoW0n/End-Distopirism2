//전투 이벤트를 교전 한 건 단위의 걸음으로 묶는다 (SPEC-005 §9.2)
//3D 무대는 걸음 하나를 타임라인 하나로 재생한다. 유니티 어댑터도 같은 규칙으로 PresentationCue 를 만든다
//
//여기는 그림을 모른다. three.js·DOM 은 renderer3d 만 안다

import type { BattleEvent } from '../domain/types.js';

//아군 머리 위에 띄울 결과 한 줄 (SPEC-005 §8.10)
export interface StepCallout {
  combatantId: string;
  success: boolean;
  //큰 줄
  title: string;
  //작은 줄. 없으면 빈 문자열
  reason: string;
}

//합 한 라운드. 이긴 쪽이 있거나 교착이다
export type ClashRound =
  | {
      type: 'win';
      winnerId: string;
      loserId: string;
      winnerPower: number;
      loserPower: number;
      //이 라운드에 난 이벤트. 부딪히는 순간 현황판에 적용한다
      events: BattleEvent[];
      callouts: StepCallout[];
    }
  | {
      type: 'deadlock';
      power: number;
      events: BattleEvent[];
      callouts: StepCallout[];
    };

//합 마무리 한 방. 이긴 쪽이 진 쪽을 친다
export interface ClashFinisher {
  winnerId: string;
  loserId: string;
  winnerSkillId: number;
  damage: number;
  defeated: boolean;
}

//교전 한 건 = 걸음 하나
export type StageStep =
  | {
      kind: 'oneSided';
      attackerId: string;
      targetId: string;
      skillId: number;
      power: number;
      successCount: number;
      damage: number;
      defeated: boolean;
      callouts: StepCallout[];
      //맞는 순간 적용할 이벤트
      events: BattleEvent[];
    }
  | {
      kind: 'clash';
      attackerId: string;
      defenderId: string;
      attackerSkillId: number;
      defenderSkillId: number;
      rounds: ClashRound[];
      finisher: ClashFinisher | null;
      //마무리 한 방에 적용할 이벤트 (마무리가 없으면 합이 끝날 때)
      events: BattleEvent[];
    }
  | { kind: 'state'; event: BattleEvent };

//누가 아군인지 알려 주는 통로. 결과 알림은 아군에게만 붙는다
export interface ExchangeContext {
  isPlayerSide(combatantId: string): boolean;
}

//이벤트 목록을 걸음으로 묶는다
export function toStageSteps(events: readonly BattleEvent[], context: ExchangeContext): StageStep[] {
  const steps: StageStep[] = [];
  let i = 0;
  while (i < events.length) {
    const event = events[i] as BattleEvent;
    if (event.type === 'oneSidedStart') {
      const end = findEnd(events, i, 'oneSidedEnd');
      steps.push(oneSidedStep(events.slice(i, end + 1), context));
      i = end + 1;
      continue;
    }
    if (event.type === 'clashStart') {
      const end = findEnd(events, i, 'clashEnd');
      steps.push(clashStep(events.slice(i, end + 1), context));
      i = end + 1;
      continue;
    }
    steps.push({ kind: 'state', event });
    i += 1;
  }
  return steps;
}

//닫는 이벤트 자리. 없으면 끝까지 한 묶음으로 본다
function findEnd(events: readonly BattleEvent[], from: number, type: 'oneSidedEnd' | 'clashEnd'): number {
  for (let j = from + 1; j < events.length; j++) {
    if ((events[j] as BattleEvent).type === type) return j;
  }
  return events.length - 1;
}

//일방 공격 한 건. 위력은 공격자 damageCalculated, 피해는 대상 damageApplied 의 합이다
function oneSidedStep(group: BattleEvent[], context: ExchangeContext): StageStep {
  const start = group[0] as Extract<BattleEvent, { type: 'oneSidedStart' }>;
  let power = 0;
  let successCount = 0;
  let damage = 0;
  let defeated = false;
  for (const event of group) {
    if (event.type === 'damageCalculated' && event.combatantId === start.attackerId) {
      power = event.damage;
      successCount = event.successCount;
    }
    if (event.type === 'damageApplied' && event.combatantId === start.targetId) damage += event.damage;
    if (event.type === 'defeated' && event.combatantId === start.targetId) defeated = true;
  }
  const callouts: StepCallout[] = [];
  if (context.isPlayerSide(start.attackerId)) {
    callouts.push(
      damage > 0
        ? { combatantId: start.attackerId, success: true, title: '공격 성공', reason: `피해 ${damage}` }
        : { combatantId: start.attackerId, success: false, title: '빗나감', reason: `코인 앞면 ${successCount}` },
    );
  }
  return {
    kind: 'oneSided',
    attackerId: start.attackerId,
    targetId: start.targetId,
    skillId: start.skillId,
    power,
    successCount,
    damage,
    defeated,
    callouts,
    events: group.filter((e) => e.type !== 'oneSidedStart' && e.type !== 'oneSidedEnd'),
  };
}

//합 한 건. coinRolled 두 개가 새 라운드를 연다. 라운드 판정 뒤에 난 이벤트는 그 라운드에 붙는다
function clashStep(group: BattleEvent[], context: ExchangeContext): StageStep {
  const start = group[0] as Extract<BattleEvent, { type: 'clashStart' }>;
  const rounds: ClashRound[] = [];
  //마지막 라운드 판정 뒤의 이벤트. 마무리 한 방에 붙는다
  let tail: BattleEvent[] = [];
  let current: ClashRound | null = null;
  //새 라운드를 연다. 라운드 사이에 끼어 있던 이벤트는 앞 라운드(없으면 이 라운드)에 붙여 잃지 않는다
  const openRound = (round: ClashRound): void => {
    const previous = rounds[rounds.length - 1];
    if (previous) previous.events.push(...tail);
    else round.events.unshift(...tail);
    tail = [];
    rounds.push(round);
  };

  for (const event of group.slice(1)) {
    if (event.type === 'clashEnd') continue;
    if (event.type === 'clashRoundWin') {
      current = {
        type: 'win',
        winnerId: event.winnerId,
        loserId: event.loserId,
        winnerPower: event.winnerDamage,
        loserPower: event.loserDamage,
        events: [event],
        callouts: roundCallouts(start.attackerId, start.defenderId, event.winnerId, event.winnerDamage, event.loserDamage, context),
      };
      openRound(current);
      continue;
    }
    if (event.type === 'deadlock') {
      const power = lastPower(group, rounds.length, start.attackerId);
      current = {
        type: 'deadlock',
        power,
        events: [event],
        callouts: [start.attackerId, start.defenderId]
          .filter((id) => context.isPlayerSide(id))
          .map((id) => ({ combatantId: id, success: false, title: '교착', reason: `위력 ${power} = ${power}` })),
      };
      openRound(current);
      continue;
    }
    //다음 라운드의 코인 굴림이 오기 전까지는 앞 라운드의 뒷일이다
    if (event.type === 'coinRolled' || event.type === 'damageCalculated') {
      current = null;
      continue;
    }
    //판정 바로 뒤의 코인·정신력은 그 라운드 몫이다. 다른 이벤트가 끼면 거기서부터는 마무리 몫이다
    if (current && isRoundAftermath(event)) {
      current.events.push(event);
      continue;
    }
    current = null;
    tail.push(event);
  }

  //라운드 뒤에 붙은 것 중 피해·쓰러짐은 마무리 한 방의 몫이다
  const lastWin = [...rounds].reverse().find((r) => r.type === 'win') as Extract<ClashRound, { type: 'win' }> | undefined;
  let finisher: ClashFinisher | null = null;
  if (lastWin) {
    const loserHits = tail.filter(
      (e): e is Extract<BattleEvent, { type: 'damageApplied' }> => e.type === 'damageApplied' && e.combatantId === lastWin.loserId,
    );
    if (loserHits.length > 0) {
      finisher = {
        winnerId: lastWin.winnerId,
        loserId: lastWin.loserId,
        winnerSkillId: lastWin.winnerId === start.attackerId ? start.attackerSkillId : start.defenderSkillId,
        damage: loserHits.reduce((sum, e) => sum + e.damage, 0),
        defeated: tail.some((e) => e.type === 'defeated' && e.combatantId === lastWin.loserId),
      };
    }
  }

  return {
    kind: 'clash',
    attackerId: start.attackerId,
    defenderId: start.defenderId,
    attackerSkillId: start.attackerSkillId,
    defenderSkillId: start.defenderSkillId,
    rounds,
    finisher,
    events: tail,
  };
}

//라운드 판정에 바로 따라오는 이벤트. 코인 잃음·정신력·교착 한도
function isRoundAftermath(event: BattleEvent): boolean {
  return event.type === 'coinLost' || event.type === 'mentalityChanged' || event.type === 'deadlockLimit';
}

//교착 라운드의 위력. 바로 앞 damageCalculated 중 공격자 값이다
function lastPower(group: BattleEvent[], roundIndex: number, attackerId: string): number {
  let seen = -1;
  let power = 0;
  for (const event of group) {
    if (event.type === 'clashRoundWin' || event.type === 'deadlock') seen += 1;
    if (seen >= roundIndex) break;
    if (event.type === 'damageCalculated' && event.combatantId === attackerId) power = event.damage;
  }
  return power;
}

//합 라운드 결과 알림. 아군 쪽 것만 만든다
function roundCallouts(
  attackerId: string,
  defenderId: string,
  winnerId: string,
  winnerPower: number,
  loserPower: number,
  context: ExchangeContext,
): StepCallout[] {
  const out: StepCallout[] = [];
  for (const id of [attackerId, defenderId]) {
    if (!context.isPlayerSide(id)) continue;
    out.push(
      id === winnerId
        ? { combatantId: id, success: true, title: '합 승리', reason: `위력 ${winnerPower} > ${loserPower}` }
        : { combatantId: id, success: false, title: '합 패배', reason: `위력 열세 ${loserPower} < ${winnerPower}` },
    );
  }
  return out;
}
