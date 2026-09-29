//전투 이벤트를 교전 한 건 단위의 걸음으로 묶는다 (SPEC-005 §9.2)
//3D 무대는 걸음 하나를 타임라인 하나로 재생한다. 유니티 어댑터도 같은 규칙으로 PresentationCue 를 만든다
//
//여기는 그림을 모른다. three.js·DOM 은 renderer3d 만 안다
//v3.0 (D-23): 코인 대신 카드를 뒤집는다. 뒤집기 한 번 = 라운드 하나. 위력이 같으면 다시 뒤집는다

import type { BattleEvent, CardFace } from '../domain/types.js';

//아군 머리 위에 띄울 결과 한 줄 (SPEC-005 §8.10)
export interface StepCallout {
  combatantId: string;
  success: boolean;
  //큰 줄
  title: string;
  //작은 줄. 없으면 빈 문자열
  reason: string;
}

//카드 한 장을 뒤집은 결과. 머리 위 카드가 이 면으로 멈춘다 (SPEC-005 §11)
export interface FlipView {
  combatantId: string;
  skillId: number;
  face: CardFace;
  power: number;
  //앞면이 나올 확률이었던 값
  chance: number;
}

//합 한 라운드 = 양쪽이 카드를 한 번 뒤집은 것. 이긴 쪽이 있거나 교착(다시 뒤집기)이다
export type ClashRound =
  | {
      type: 'win';
      attackerFlip: FlipView;
      defenderFlip: FlipView;
      winnerId: string;
      loserId: string;
      winnerPower: number;
      loserPower: number;
      //이 라운드에 난 이벤트. 비교가 끝나는 순간 현황판에 적용한다
      events: BattleEvent[];
      callouts: StepCallout[];
    }
  | {
      type: 'deadlock';
      attackerFlip: FlipView;
      defenderFlip: FlipView;
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
      //공격자 카드를 뒤집은 결과. 드러난 위력이 곧 이 공격의 위력이다
      flip: FlipView;
      power: number;
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

//면 이름. 알림 글에 쓴다
export function faceLabel(face: CardFace): string {
  return face === 'front' ? '앞' : '뒤';
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

//cardFlipped 이벤트를 뒤집기 결과로 옮긴다
function toFlip(event: Extract<BattleEvent, { type: 'cardFlipped' }>): FlipView {
  return { combatantId: event.combatantId, skillId: event.skillId, face: event.face, power: event.power, chance: event.chance };
}

//일방 공격 한 건. 위력은 공격자가 뒤집은 카드, 피해는 대상 damageApplied 의 합이다
function oneSidedStep(group: BattleEvent[], context: ExchangeContext): StageStep {
  const start = group[0] as Extract<BattleEvent, { type: 'oneSidedStart' }>;
  let flip: FlipView = { combatantId: start.attackerId, skillId: start.skillId, face: 'back', power: 0, chance: 0 };
  let damage = 0;
  let defeated = false;
  for (const event of group) {
    if (event.type === 'cardFlipped' && event.combatantId === start.attackerId) flip = toFlip(event);
    if (event.type === 'damageApplied' && event.combatantId === start.targetId) damage += event.damage;
    if (event.type === 'defeated' && event.combatantId === start.targetId) defeated = true;
  }
  const callouts: StepCallout[] = [];
  if (context.isPlayerSide(start.attackerId)) {
    callouts.push(
      damage > 0
        ? { combatantId: start.attackerId, success: true, title: '공격 성공', reason: `${faceLabel(flip.face)} ${flip.power} · 피해 ${damage}` }
        : { combatantId: start.attackerId, success: false, title: '빗나감', reason: `${faceLabel(flip.face)} ${flip.power} · 피해 없음` },
    );
  }
  return {
    kind: 'oneSided',
    attackerId: start.attackerId,
    targetId: start.targetId,
    skillId: start.skillId,
    flip,
    power: flip.power,
    damage,
    defeated,
    callouts,
    events: group.filter((e) => e.type !== 'oneSidedStart' && e.type !== 'oneSidedEnd' && e.type !== 'cardFlipped'),
  };
}

//합 한 건. cardFlipped 두 개가 새 라운드를 연다. 라운드 판정 뒤에 난 이벤트는 그 라운드에 붙는다
function clashStep(group: BattleEvent[], context: ExchangeContext): StageStep {
  const start = group[0] as Extract<BattleEvent, { type: 'clashStart' }>;
  const rounds: ClashRound[] = [];
  //마지막 라운드 판정 뒤의 이벤트. 마무리 한 방에 붙는다
  let tail: BattleEvent[] = [];
  let current: ClashRound | null = null;
  //이번 라운드에 뒤집은 두 장. 판정이 오면 라운드가 된다
  let attackerFlip: FlipView | null = null;
  let defenderFlip: FlipView | null = null;
  //새 라운드를 연다. 라운드 사이에 끼어 있던 이벤트는 앞 라운드(없으면 이 라운드)에 붙여 잃지 않는다
  const openRound = (round: ClashRound): void => {
    const previous = rounds[rounds.length - 1];
    if (previous) previous.events.push(...tail);
    else round.events.unshift(...tail);
    tail = [];
    rounds.push(round);
  };
  const blank = (id: string, skillId: number): FlipView => ({ combatantId: id, skillId, face: 'back', power: 0, chance: 0 });

  for (const event of group.slice(1)) {
    if (event.type === 'clashEnd') continue;
    if (event.type === 'cardFlipped') {
      if (event.combatantId === start.attackerId) attackerFlip = toFlip(event);
      else defenderFlip = toFlip(event);
      current = null;
      continue;
    }
    if (event.type === 'damageCalculated') continue;
    const flips = {
      attackerFlip: attackerFlip ?? blank(start.attackerId, start.attackerSkillId),
      defenderFlip: defenderFlip ?? blank(start.defenderId, start.defenderSkillId),
    };
    if (event.type === 'clashRoundWin') {
      current = {
        type: 'win',
        ...flips,
        winnerId: event.winnerId,
        loserId: event.loserId,
        winnerPower: event.winnerDamage,
        loserPower: event.loserDamage,
        events: [event],
        callouts: roundCallouts(start, flips.attackerFlip, flips.defenderFlip, event.winnerId, context),
      };
      openRound(current);
      continue;
    }
    if (event.type === 'deadlock') {
      const power = flips.attackerFlip.power;
      current = {
        type: 'deadlock',
        ...flips,
        power,
        events: [event],
        callouts: [flips.attackerFlip, flips.defenderFlip]
          .filter((f) => context.isPlayerSide(f.combatantId))
          .map((mine) => {
            const other = mine === flips.attackerFlip ? flips.defenderFlip : flips.attackerFlip;
            return {
              combatantId: mine.combatantId,
              success: false,
              title: '교착',
              reason: `${faceLabel(mine.face)} ${mine.power} = ${faceLabel(other.face)} ${other.power} · 다시 뒤집기`,
            };
          }),
      };
      openRound(current);
      continue;
    }
    //판정 바로 뒤의 정신력·교착 한도는 그 라운드 몫이다. 다른 이벤트가 끼면 거기서부터는 마무리 몫이다
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

//라운드 판정에 바로 따라오는 이벤트. 정신력·교착 한도
function isRoundAftermath(event: BattleEvent): boolean {
  return event.type === 'mentalityChanged' || event.type === 'deadlockLimit';
}

//합 라운드 결과 알림. 아군 쪽 것만 만든다. 드러난 면과 위력을 적는다
function roundCallouts(
  start: Extract<BattleEvent, { type: 'clashStart' }>,
  attackerFlip: FlipView,
  defenderFlip: FlipView,
  winnerId: string,
  context: ExchangeContext,
): StepCallout[] {
  const out: StepCallout[] = [];
  for (const id of [start.attackerId, start.defenderId]) {
    if (!context.isPlayerSide(id)) continue;
    const mine = id === start.attackerId ? attackerFlip : defenderFlip;
    const other = id === start.attackerId ? defenderFlip : attackerFlip;
    const me = `${faceLabel(mine.face)} ${mine.power}`;
    const them = `${faceLabel(other.face)} ${other.power}`;
    out.push(
      id === winnerId
        ? { combatantId: id, success: true, title: '합 승리', reason: `${me} > ${them}` }
        : { combatantId: id, success: false, title: '합 패배', reason: `${me} < ${them}` },
    );
  }
  return out;
}

//규칙이 낸 피해 한 번을 타 수로 나눈다. 똑같이 나누고 나머지는 마지막 타에 얹는다 (SPEC-005 §12.2)
export function splitDamage(total: number, hits: number): number[] {
  const n = Math.max(1, Math.floor(hits));
  const base = Math.floor(total / n);
  const parts = Array.from({ length: n }, () => base);
  parts[n - 1] = total - base * (n - 1);
  return parts;
}
