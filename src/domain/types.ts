//전투 데이터(battle-data.json)의 스키마와 도메인이 내보내는 이벤트 타입을 정의한다
//렌더러에 의존하는 타입은 이 파일에 절대 들어오지 않는다

//진영 구분
export type Side = 'ally' | 'enemy';

//상태이상 식별자 4종
export type StatusId = 'bleed' | 'confusion' | 'poison' | 'defenseDown';

//누적 속성 3종. 전용기 S1/S2/S3 와 1:1 대응한다 (v2.0 §2)
export type Attribute = 'attack' | 'defense' | 'support';

//전용기 자리. ULT 는 궁극기라 어느 자리에도 속하지 않는다
export type SkillSlot = 'S1' | 'S2' | 'S3' | 'ULT';

//카드 원형. 변동폭(최대/최소) 구간을 나타내는 분류값
export type SkillArchetype = '안정' | '표준' | '도박' | '유틸';

//전투 전역 규칙 수치
export interface BattleRules {
  coinBaseProbability: number;
  mentalityMax: number;
  mentalityOnClashWin: number;
  mentalityOnDeadlock: number;
  mentalityRegenPerTurn: number;
  mentalityRegenCap: number;
  confusionThreshold: number;
  confusionPenalty: number;
  levelDiffStep: number;
  deadlockLimit: number;
  //일방 공격은 겨룬 게 아니라서 기본값이 둘 다 false 다 (SPEC §4.7)
  oneSidedGivesMentality: boolean;
  oneSidedConsumesCoin: boolean;
  //속성 합이 이 값에 닿으면 궁극기가 준비된다 (v2.0 §3.1)
  ultimateThreshold: number;
  ultimateSkillId: number;
}

//캐릭터 기본 스탯
export interface CharacterData {
  id: string;
  name: string;
  maxHp: number;
  atkLevel: number;
  defLevel: number;
  maxCoin: number;
  mentality: number;
  role: string;
  //이 캐릭터의 전용기 3종. 카드 풀을 공유하지 않는다 (v2.0 §1)
  skills: number[];
}

//카드 효과가 발동하는 시점
export type SkillTiming =
  | 'onDamage'
  | 'beforeDamage'
  | 'beforeDamageCalc'
  | 'onTakeDamage'
  | 'onClashEnd'
  | 'onCoinSuccess+onDamageCalc';

//체력이 임계치 미만이면 즉시 처형
export interface ExecuteEffect {
  type: 'execute';
  hpThresholdPercent: number;
}

//현재 정신력의 비율만큼 증감
export interface MentalityEffect {
  type: 'mentality';
  percentOfCurrent: number;
}

//내 체력을 대가로 지불하고 추가 피해를 얻는다
export interface SelfHpCostEffect {
  type: 'selfHpCost';
  amount: number;
  bonusDamagePerCoin: number;
}

//상태이상 부여
export interface ApplyStatusEffect {
  type: 'applyStatus';
  target: 'self' | 'opponent';
  status: StatusId;
  turns: number;
}

//최종 피해에 고정값을 더한다
export interface DamageModifierEffect {
  type: 'damageModifier';
  target: 'self' | 'opponent';
  amount: number;
}

//피해를 완전히 무효화한다
export interface NullifyDamageEffect {
  type: 'nullifyDamage';
}

//다음 턴 코인 회복량을 증감시킨다
export interface NextTurnCoinEffect {
  type: 'nextTurnCoin';
  target: 'allies';
  amount: number;
}

//성공 코인 1개당 공격레벨이 오르고 추가 피해도 붙는다
export interface AtkBonusPerCoinEffect {
  type: 'atkBonusPerCoin';
  amount: number;
  bonusDamagePerCoin: number;
}

export type SkillEffectBody =
  | ExecuteEffect
  | MentalityEffect
  | SelfHpCostEffect
  | ApplyStatusEffect
  | DamageModifierEffect
  | NullifyDamageEffect
  | NextTurnCoinEffect
  | AtkBonusPerCoinEffect;

//승패에 따라 갈리는 효과 묶음. always 는 승패와 무관하게 발동한다
export interface SkillEffect {
  timing: SkillTiming;
  onWin?: SkillEffectBody;
  onLose?: SkillEffectBody;
  always?: SkillEffectBody;
}

//전용기 1종
export interface SkillData {
  id: number;
  name: string;
  //주인 캐릭터. 궁극기는 주인이 없어서 null 이다
  character: string | null;
  slot: SkillSlot;
  //합 승리 시 올라가는 속성. 궁극기는 올리는 속성이 없다
  attribute: Attribute | null;
  baseDamage: number;
  coinPower: number;
  archetype: SkillArchetype;
  maxInDeck: number;
  //수치가 아직 정해지지 않은 카드. AI 가 고르지 않는다 (v2.0 §3.2)
  tbd: boolean;
  //v2.0 전용기에는 효과가 없다. 상태이상이 보류라 효과를 임의로 설계하지 않는다 (v2.0 §1.2)
  effect?: SkillEffect;
  text: string;
}

//상태이상 1종의 정의
export interface StatusEffectData {
  id: StatusId;
  name: string;
  timing: 'onTurnStart' | 'onCoinRoll' | 'onDamageCalc';
  effect: {
    hpPercentDamage?: number;
    of?: 'maxHp';
    mentalityModifier?: number;
    incomingDamagePercent?: number;
    outgoingDamagePercent?: number;
    defenseMultiplier?: number;
  };
  defaultTurns: number;
  stackable: boolean;
}

//적 AI 가중치 수치. SPEC §13.4
export interface EnemyAiRules {
  mentalityDangerThreshold: number;
  mentalityDangerArchetypeWeight: Record<SkillArchetype, number>;
  redundantStatusPenalty: number;
  //타겟 선택 (§13.6)
  aiTargetLowHpBias: number;
  aiTargetDuplicatePenalty: number;
  //방어 태세 위협도 구간 (§13.7). 경계가 n개면 가중치는 n+1개다
  aiGuardThreatThresholds: number[];
  aiGuardWeights: number[];
}

//battle-data.json 전체
export interface BattleData {
  rules: BattleRules;
  enemyAi: EnemyAiRules;
  characters: CharacterData[];
  skills: SkillData[];
  statusEffects: StatusEffectData[];
}

//정신력이 바뀐 이유. UI 가 연출을 고르는 데 쓴다
export type MentalityReason =
  | 'clashWin'
  | 'deadlock'
  | 'skill'
  | 'turnRegen';

//도메인이 내보내는 이벤트. 렌더러는 이것만 구독한다
export type BattleEvent =
  | { type: 'turnStart'; turn: number }
  | { type: 'coinRestored'; combatantId: string; coin: number }
  | { type: 'enemyTargeted'; enemyId: string; targetId: string }
  | { type: 'clashStart'; attackerId: string; defenderId: string; attackerSkillId: number; defenderSkillId: number }
  | { type: 'oneSidedStart'; attackerId: string; targetId: string; skillId: number }
  | { type: 'oneSidedEnd'; attackerId: string; targetId: string }
  | { type: 'coinRolled'; combatantId: string; rolls: boolean[]; successCount: number; probability: number }
  | { type: 'damageCalculated'; combatantId: string; damage: number; successCount: number; levelBonus: number }
  | { type: 'clashRoundWin'; winnerId: string; loserId: string; winnerDamage: number; loserDamage: number }
  | { type: 'deadlock'; attackerId: string; defenderId: string; count: number }
  | { type: 'deadlockLimit'; attackerId: string; defenderId: string }
  | { type: 'coinLost'; combatantId: string; coin: number }
  | { type: 'mentalityChanged'; combatantId: string; delta: number; mentality: number; reason: MentalityReason }
  | { type: 'damageApplied'; combatantId: string; damage: number; hp: number }
  | { type: 'damageNullified'; combatantId: string; skillId: number }
  | { type: 'executed'; combatantId: string }
  | { type: 'statusApplied'; combatantId: string; status: StatusId; turns: number }
  | { type: 'statusTicked'; combatantId: string; status: StatusId; damage: number }
  | { type: 'statusExpired'; combatantId: string; status: StatusId }
  | { type: 'attributeGained'; combatantId: string; attribute: Attribute; value: number }
  | { type: 'ultimateReady'; combatantId: string }
  | { type: 'ultimateUsed'; combatantId: string; skillId: number }
  | { type: 'defeated'; combatantId: string }
  | { type: 'clashEnd'; attackerId: string; defenderId: string; winnerId: string | null }
  | { type: 'turnEnd'; turn: number }
  | { type: 'battleEnd'; winner: Side | null };
