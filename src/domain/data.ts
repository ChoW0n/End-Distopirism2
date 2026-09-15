//battle-data.json 을 검증해서 도메인 타입으로 바꾼다
//파일을 직접 읽지 않는다. 읽는 건 플랫폼(어댑터)의 일이고 여기는 파싱과 검증만 한다

import type {
  BattleData,
  BattleRules,
  CharacterData,
  SkillData,
  SkillEffect,
  SkillEffectBody,
  StatusEffectData,
  StatusId,
  SkillArchetype,
  SkillTiming,
} from './types.js';

//데이터가 스펙과 어긋날 때 던진다. 잘못된 값으로 전투를 시작하는 것보다 낫다
export class BattleDataError extends Error {
  constructor(message: string) {
    super(`battle-data: ${message}`);
    this.name = 'BattleDataError';
  }
}

type Json = Record<string, unknown>;

//객체인지 확인하고 아니면 던진다
function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BattleDataError(`${path} 가 객체가 아니다`);
  }
  return value as Json;
}

//숫자를 꺼낸다
function num(source: Json, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BattleDataError(`${path}.${key} 가 숫자가 아니다`);
  }
  return value;
}

//문자열을 꺼낸다
function str(source: Json, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new BattleDataError(`${path}.${key} 가 문자열이 아니다`);
  }
  return value;
}

//허용된 값 목록 안에 있는 문자열만 꺼낸다
function literal<T extends string>(source: Json, key: string, allowed: readonly T[], path: string): T {
  const value = str(source, key, path);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BattleDataError(`${path}.${key} 가 허용되지 않은 값이다: ${value}`);
  }
  return value as T;
}

//배열을 꺼낸다
function arr(source: Json, key: string, path: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new BattleDataError(`${path}.${key} 가 배열이 아니다`);
  }
  return value;
}

const STATUS_IDS = ['bleed', 'confusion', 'poison', 'defenseDown'] as const;
const ARCHETYPES = ['안정', '표준', '도박', '유틸'] as const;
const TIMINGS = [
  'onDamage',
  'beforeDamage',
  'beforeDamageCalc',
  'onTakeDamage',
  'onClashEnd',
  'onCoinSuccess+onDamageCalc',
] as const;

//"successCount*2" 같은 식을 계수 2로 바꾼다. 문자열을 실행하지 않고 패턴만 읽는다
function parseCoinCoefficient(value: unknown, path: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string') {
    throw new BattleDataError(`${path} 가 문자열이 아니다`);
  }
  const matched = /^successCount\s*\*\s*(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!matched?.[1]) {
    throw new BattleDataError(`${path} 를 해석할 수 없다: ${value}`);
  }
  return Number(matched[1]);
}

//카드 효과 한 덩어리를 해석한다
function parseEffectBody(raw: unknown, path: string): SkillEffectBody {
  const source = obj(raw, path);
  const type = str(source, 'type', path);

  switch (type) {
    case 'execute':
      return { type, hpThresholdPercent: num(source, 'hpThresholdPercent', path) };
    case 'mentality':
      return { type, percentOfCurrent: num(source, 'percentOfCurrent', path) };
    case 'selfHpCost':
      return {
        type,
        amount: num(source, 'amount', path),
        bonusDamagePerCoin: parseCoinCoefficient(source['thenBonusDamage'], `${path}.thenBonusDamage`),
      };
    case 'applyStatus':
      return {
        type,
        target: literal(source, 'target', ['self', 'opponent'] as const, path),
        status: literal<StatusId>(source, 'status', STATUS_IDS, path),
        turns: num(source, 'turns', path),
      };
    case 'damageModifier':
      return {
        type,
        target: literal(source, 'target', ['self', 'opponent'] as const, path),
        amount: num(source, 'amount', path),
      };
    case 'nullifyDamage':
      return { type };
    case 'nextTurnCoin':
      return {
        type,
        target: literal(source, 'target', ['allies'] as const, path),
        amount: num(source, 'amount', path),
      };
    case 'atkBonusPerCoin':
      return {
        type,
        amount: num(source, 'amount', path),
        bonusDamagePerCoin: parseCoinCoefficient(source['thenBonusDamage'], `${path}.thenBonusDamage`),
      };
    default:
      throw new BattleDataError(`${path}.type 을 알 수 없다: ${type}`);
  }
}

//카드의 효과 블록(타이밍 + 승/패/상시)을 해석한다
function parseEffect(raw: unknown, path: string): SkillEffect {
  const source = obj(raw, path);
  const effect: SkillEffect = {
    timing: literal<SkillTiming>(source, 'timing', TIMINGS, path),
  };
  if (source['onWin'] !== undefined) effect.onWin = parseEffectBody(source['onWin'], `${path}.onWin`);
  if (source['onLose'] !== undefined) effect.onLose = parseEffectBody(source['onLose'], `${path}.onLose`);
  if (source['always'] !== undefined) effect.always = parseEffectBody(source['always'], `${path}.always`);
  return effect;
}

//전역 규칙 수치를 읽는다
function parseRules(raw: unknown): BattleRules {
  const source = obj(raw, 'rules');
  return {
    coinBaseProbability: num(source, 'coinBaseProbability', 'rules'),
    mentalityMax: num(source, 'mentalityMax', 'rules'),
    mentalityOnClashWin: num(source, 'mentalityOnClashWin', 'rules'),
    mentalityOnDeadlock: num(source, 'mentalityOnDeadlock', 'rules'),
    mentalityRegenPerTurn: num(source, 'mentalityRegenPerTurn', 'rules'),
    mentalityRegenCap: num(source, 'mentalityRegenCap', 'rules'),
    confusionThreshold: num(source, 'confusionThreshold', 'rules'),
    confusionPenalty: num(source, 'confusionPenalty', 'rules'),
    levelDiffStep: num(source, 'levelDiffStep', 'rules'),
    deadlockLimit: num(source, 'deadlockLimit', 'rules'),
  };
}

//캐릭터 한 명을 읽는다
function parseCharacter(raw: unknown, index: number): CharacterData {
  const path = `characters[${index}]`;
  const source = obj(raw, path);
  return {
    id: str(source, 'id', path),
    name: str(source, 'name', path),
    maxHp: num(source, 'maxHp', path),
    atkLevel: num(source, 'atkLevel', path),
    defLevel: num(source, 'defLevel', path),
    maxCoin: num(source, 'maxCoin', path),
    mentality: num(source, 'mentality', path),
    role: str(source, 'role', path),
  };
}

//카드 한 장을 읽는다
function parseSkill(raw: unknown, index: number): SkillData {
  const path = `skills[${index}]`;
  const source = obj(raw, path);
  return {
    id: num(source, 'id', path),
    name: str(source, 'name', path),
    baseDamage: num(source, 'baseDamage', path),
    coinPower: num(source, 'coinPower', path),
    archetype: literal<SkillArchetype>(source, 'archetype', ARCHETYPES, path),
    maxInDeck: num(source, 'maxInDeck', path),
    effect: parseEffect(source['effect'], `${path}.effect`),
    text: str(source, 'text', path),
  };
}

//상태이상 한 종을 읽는다
function parseStatusEffect(raw: unknown, index: number): StatusEffectData {
  const path = `statusEffects[${index}]`;
  const source = obj(raw, path);
  const effect = obj(source['effect'], `${path}.effect`);
  const parsed: StatusEffectData['effect'] = {};

  //선택 필드라 존재하는 것만 옮긴다
  if (effect['hpPercentDamage'] !== undefined) parsed.hpPercentDamage = num(effect, 'hpPercentDamage', path);
  if (effect['of'] !== undefined) parsed.of = literal(effect, 'of', ['maxHp'] as const, path);
  if (effect['mentalityModifier'] !== undefined) parsed.mentalityModifier = num(effect, 'mentalityModifier', path);
  if (effect['incomingDamagePercent'] !== undefined) {
    parsed.incomingDamagePercent = num(effect, 'incomingDamagePercent', path);
  }
  if (effect['outgoingDamagePercent'] !== undefined) {
    parsed.outgoingDamagePercent = num(effect, 'outgoingDamagePercent', path);
  }
  if (effect['defenseMultiplier'] !== undefined) parsed.defenseMultiplier = num(effect, 'defenseMultiplier', path);

  return {
    id: literal<StatusId>(source, 'id', STATUS_IDS, path),
    name: str(source, 'name', path),
    timing: literal(source, 'timing', ['onClashStart', 'onCoinRoll', 'onDamageCalc'] as const, path),
    effect: parsed,
    defaultTurns: num(source, 'defaultTurns', path),
    stackable: source['stackable'] === true,
  };
}

//JSON.parse 결과를 받아 검증된 전투 데이터로 바꾼다
export function parseBattleData(raw: unknown): BattleData {
  const source = obj(raw, 'root');
  const data: BattleData = {
    rules: parseRules(source['rules']),
    characters: arr(source, 'characters', 'root').map(parseCharacter),
    skills: arr(source, 'skills', 'root').map(parseSkill),
    statusEffects: arr(source, 'statusEffects', 'root').map(parseStatusEffect),
  };

  if (data.characters.length === 0) throw new BattleDataError('캐릭터가 하나도 없다');
  if (data.skills.length === 0) throw new BattleDataError('스킬이 하나도 없다');

  //id 는 조회 키라 중복되면 안 된다
  const skillIds = new Set<number>();
  for (const skill of data.skills) {
    if (skillIds.has(skill.id)) throw new BattleDataError(`스킬 id 가 중복된다: ${skill.id}`);
    skillIds.add(skill.id);
  }
  const characterIds = new Set<string>();
  for (const character of data.characters) {
    if (characterIds.has(character.id)) throw new BattleDataError(`캐릭터 id 가 중복된다: ${character.id}`);
    characterIds.add(character.id);
  }

  return data;
}

//id 로 빠르게 찾기 위한 조회표
export class BattleCatalog {
  private readonly charactersById: Map<string, CharacterData>;
  private readonly skillsById: Map<number, SkillData>;
  private readonly statusesById: Map<StatusId, StatusEffectData>;

  //검증된 데이터를 받아 조회표를 만든다
  constructor(readonly data: BattleData) {
    this.charactersById = new Map(data.characters.map((c) => [c.id, c]));
    this.skillsById = new Map(data.skills.map((s) => [s.id, s]));
    this.statusesById = new Map(data.statusEffects.map((s) => [s.id, s]));
  }

  get rules(): BattleRules {
    return this.data.rules;
  }

  //캐릭터를 찾는다. 없으면 던진다
  character(id: string): CharacterData {
    const found = this.charactersById.get(id);
    if (!found) throw new BattleDataError(`캐릭터를 찾을 수 없다: ${id}`);
    return found;
  }

  //스킬을 찾는다. 없으면 던진다
  skill(id: number): SkillData {
    const found = this.skillsById.get(id);
    if (!found) throw new BattleDataError(`스킬을 찾을 수 없다: ${id}`);
    return found;
  }

  //상태이상 정의를 찾는다. 없으면 던진다
  status(id: StatusId): StatusEffectData {
    const found = this.statusesById.get(id);
    if (!found) throw new BattleDataError(`상태이상을 찾을 수 없다: ${id}`);
    return found;
  }

  //덱이 카드별 최대 장수(maxInDeck) 제한을 지키는지 본다. 방어 태세 1장 제한이 여기로 걸린다
  validateDeck(skillIds: readonly number[]): void {
    const counts = new Map<number, number>();
    for (const id of skillIds) {
      const skill = this.skill(id);
      const next = (counts.get(id) ?? 0) + 1;
      counts.set(id, next);
      if (next > skill.maxInDeck) {
        throw new BattleDataError(`덱에 「${skill.name}」 이 ${skill.maxInDeck}장을 넘는다`);
      }
    }
  }
}
