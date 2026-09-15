//전투 데이터(battle-data.json)의 스키마와 도메인이 내보내는 이벤트 타입을 정의한다
//렌더러에 의존하는 타입은 이 파일에 절대 들어오지 않는다

//진영 구분
export type Side = 'ally' | 'enemy';

//상태이상 식별자 4종
export type StatusId = 'bleed' | 'confusion' | 'poison' | 'defenseDown';

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

//스킬 카드 1장
export interface SkillData {
  id: number;
  name: string;
  baseDamage: number;
  coinPower: number;
  archetype: SkillArchetype;
  maxInDeck: number;
  effect: SkillEffect;
  text: string;
}

//상태이상 1종의 정의
export interface StatusEffectData {
  id: StatusId;
  name: string;
  timing: 'onClashStart' | 'onCoinRoll' | 'onDamageCalc';
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

//battle-data.json 전체
export interface BattleData {
  rules: BattleRules;
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
  | { type: 'clashStart'; attackerId: string; defenderId: string; attackerSkillId: number; defenderSkillId: number }
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
  | { type: 'defeated'; combatantId: string }
  | { type: 'clashEnd'; attackerId: string; defenderId: string; winnerId: string | null }
  | { type: 'turnEnd'; turn: number }
  | { type: 'battleEnd'; winner: Side | null };
