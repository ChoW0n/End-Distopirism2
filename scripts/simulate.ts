//콘솔 전투 시뮬레이터. 카드 수치가 실제로 어떻게 굴러가는지 보려고 만든 것이다
//도메인은 건드리지 않고 Battle 과 WeightedEnemyAi 를 그대로 가져다 쓰기만 한다
//
//  npm run sim -- --seed 1          한 판을 로그와 함께
//  npm run sim -- --runs 200        200판 돌리고 승률만

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Battle, type BattleOrder } from '../src/domain/battle.js';
import { WeightedEnemyAi, type EnemyAiContext } from '../src/domain/ai.js';
import { ClashResolver } from '../src/domain/clash.js';
import { CameraDirector, type CameraCommand } from '../src/camera/director.js';
import { createSeededRng } from '../src/domain/rng.js';
import { loadBattleCatalog } from '../src/platform/node-data.js';
import type { BattleCatalog } from '../src/domain/data.js';
import type { CombatantInit } from '../src/domain/combatant.js';
import type { BattleEvent, Side } from '../src/domain/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '../docs/battle-data.json');

//서로 물고 늘어져 끝나지 않는 판을 잘라내는 상한. 도메인 규칙이 아니라 러너의 안전장치다
const MAX_TURNS = 100;

//양 진영이 같이 쓰는 덱. 카드 9종을 고루 넣되 방어 태세는 1장 제한을 지킨다
const DECK = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009];

//한 판의 결과
interface RunResult {
  winner: Side | null;
  turns: number;
  survivors: { label: string; hp: number; maxHp: number; mentality: number }[];
}

//명령줄 인자를 읽는다
function parseArgs(argv: string[]): { seed: number; runs: number } {
  let seed = 1;
  let runs = 1;
  for (let i = 0; i < argv.length; i += 1) {
    const value = Number(argv[i + 1]);
    if (argv[i] === '--seed' && Number.isFinite(value)) seed = value;
    if (argv[i] === '--runs' && Number.isFinite(value)) runs = Math.max(1, Math.floor(value));
  }
  return { seed, runs };
}

//3 대 3 미러 구성. 양 진영이 같은 캐릭터 3명을 쓴다
function makeRoster(side: Side): CombatantInit[] {
  const prefix = side === 'ally' ? 'a' : 'e';
  return (['helper', 'main', 'police'] as const).map((characterId, index) => ({
    id: `${prefix}${index + 1}`,
    characterId,
    side,
    deck: [...DECK],
  }));
}

//로그에 쓸 이름표. 같은 캐릭터가 양쪽에 있어서 적은 표시를 붙인다
function makeLabels(battle: Battle): Map<string, string> {
  const labels = new Map<string, string>();
  for (const combatant of battle.combatants) {
    labels.set(combatant.id, combatant.side === 'ally' ? combatant.base.name : `${combatant.base.name}(적)`);
  }
  return labels;
}

//교전 한 건을 모아 한 줄로 만드는 누적기
interface Pending {
  kind: '합' | '일방';
  attackerId: string;
  defenderId: string;
  attackerSkill: string;
  defenderSkill: string | null;
  rounds: number;
  winnerId: string | null;
  deadlocked: boolean;
  damages: { id: string; damage: number; hp: number }[];
  notes: string[];
}

//이벤트 흐름을 사람이 읽을 수 있는 줄로 바꾼다. 전체 JSON 을 쏟아내지 않는다
class BattleLogger {
  private pending: Pending | null = null;
  private lastSuccess = new Map<string, number>();
  private turn = 0;

  constructor(
    private readonly catalog: BattleCatalog,
    private readonly battle: Battle,
    private readonly labels: Map<string, string>,
  ) {}

  //이벤트 목록을 받아 순서대로 처리한다
  consume(events: readonly BattleEvent[]): void {
    for (const event of events) this.handle(event);
  }

  private name(id: string): string {
    return this.labels.get(id) ?? id;
  }

  private hpText(id: string): string {
    const combatant = this.battle.combatant(id);
    return `HP ${combatant.hp}/${combatant.base.maxHp}`;
  }

  private print(line: string): void {
    console.log(`[턴${this.turn}] ${line}`);
  }

  private handle(event: BattleEvent): void {
    switch (event.type) {
      case 'turnStart':
        this.turn = event.turn;
        return;

      case 'enemyTargeted':
        this.print(`적 지정  ${this.name(event.enemyId)} → ${this.name(event.targetId)}`);
        return;

      case 'clashStart':
        this.pending = {
          kind: '합',
          attackerId: event.attackerId,
          defenderId: event.defenderId,
          attackerSkill: this.catalog.skill(event.attackerSkillId).name,
          defenderSkill: this.catalog.skill(event.defenderSkillId).name,
          rounds: 0,
          winnerId: null,
          deadlocked: false,
          damages: [],
          notes: [],
        };
        return;

      case 'oneSidedStart':
        this.pending = {
          kind: '일방',
          attackerId: event.attackerId,
          defenderId: event.targetId,
          attackerSkill: this.catalog.skill(event.skillId).name,
          defenderSkill: null,
          rounds: 0,
          winnerId: event.attackerId,
          deadlocked: false,
          damages: [],
          notes: [],
        };
        return;

      case 'coinRolled':
        this.lastSuccess.set(event.combatantId, event.successCount);
        return;

      case 'clashRoundWin':
        if (this.pending) {
          this.pending.rounds += 1;
          this.pending.winnerId = event.winnerId;
        }
        return;

      case 'deadlockLimit':
        if (this.pending) {
          this.pending.deadlocked = true;
          this.pending.winnerId = null;
        }
        return;

      case 'damageApplied':
        if (this.pending) this.pending.damages.push({ id: event.combatantId, damage: event.damage, hp: event.hp });
        //턴 시작 출혈 등 교전 밖에서 들어온 피해
        else this.print(`${this.name(event.combatantId)} 피해 ${event.damage} → ${this.hpText(event.combatantId)}`);
        return;

      case 'damageNullified':
        this.pending?.notes.push('무효');
        return;

      case 'executed':
        this.pending?.notes.push('처형');
        return;

      case 'statusApplied':
        this.pending?.notes.push(`+${this.catalog.status(event.status).name}(${this.name(event.combatantId)})`);
        return;

      case 'statusTicked':
        if (this.pending) this.pending.notes.push(`${this.catalog.status(event.status).name} ${event.damage}`);
        else {
          const label = this.catalog.status(event.status).name;
          this.print(`${label}  ${this.name(event.combatantId)} -${event.damage} → ${this.hpText(event.combatantId)}`);
        }
        return;

      case 'defeated':
        this.pending?.notes.push(`격파: ${this.name(event.combatantId)}`);
        return;

      case 'clashEnd':
      case 'oneSidedEnd':
        this.flush();
        return;

      default:
        return;
    }
  }

  //모아둔 교전 하나를 한 줄로 찍는다
  private flush(): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    const attacker = this.name(pending.attackerId);
    const defender = this.name(pending.defenderId);

    if (pending.deadlocked) {
      this.print(`[합] ${attacker}(${pending.attackerSkill}) vs ${defender}(${pending.defenderSkill}) : 교착 3회`);
      return;
    }
    if (!pending.winnerId) {
      this.print(`[${pending.kind}] ${attacker} vs ${defender} : 무승부`);
      return;
    }

    const loserId = pending.winnerId === pending.attackerId ? pending.defenderId : pending.attackerId;
    const final = pending.damages.find((d) => d.id === loserId);
    const success = this.lastSuccess.get(pending.winnerId) ?? 0;
    const notes = pending.notes.length > 0 ? `  [${pending.notes.join(' ')}]` : '';

    const head =
      pending.kind === '합'
        ? `[합] ${attacker}(${pending.attackerSkill}) vs ${defender}(${pending.defenderSkill}) : ${this.name(pending.winnerId)} 승 ${pending.rounds}라운드`
        : `[일방] ${attacker}(${pending.attackerSkill}) → ${defender}`;

    const tail = final
      ? ` / 코인 ${success}성공 / 피해 ${final.damage} → ${this.name(loserId)} HP ${final.hp}/${this.battle.combatant(loserId).base.maxHp}`
      : ` / 코인 ${success}성공 / 피해 없음`;

    this.print(head + tail + notes);
  }
}

//한 판을 끝까지 돌린다. verbose 면 매 교전을 한 줄씩 찍는다
function runBattle(catalog: BattleCatalog, seed: number, verbose: boolean): RunResult {
  const rng = createSeededRng(seed);
  const ai = new WeightedEnemyAi();
  const battle = new Battle(catalog, makeRoster('ally'), makeRoster('enemy'), { rng, enemyAi: ai });

  //아군도 같은 AI 로 둔다. 지금은 밸런스 관찰이 목적이라 전용 AI 가 필요 없다
  const resolver = new ClashResolver(catalog, rng, { alliesOf: (c) => battle.sideOf(c.side) });
  const aiContext: EnemyAiContext = { catalog, resolver, rng };

  const labels = makeLabels(battle);
  const logger = verbose ? new BattleLogger(catalog, battle, labels) : null;
  //카메라 감독은 전투당 하나. 도메인이 낸 이벤트를 로거와 같이 나눠 본다
  const director = verbose ? new CameraDirector() : null;

  let turns = 0;
  while (!battle.isFinished && turns < MAX_TURNS) {
    turns += 1;

    const startEvents = battle.startTurn();
    logger?.consume(startEvents);
    if (battle.isFinished) break;

    //적이 누구를 겨눴는지는 턴 시작 이벤트에 들어 있다. 아군은 이걸 보고 합을 걸지 정한다
    const enemyTargets = new Map<string, string>();
    for (const event of startEvents) {
      if (event.type === 'enemyTargeted') enemyTargets.set(event.enemyId, event.targetId);
    }

    battle.submitOrders(makeAllyOrders(battle, ai, aiContext, enemyTargets));
    //전투 진행을 먼저 시키고 로그를 넘긴다. 로거가 없을 때 호출이 통째로 생략되면 안 된다
    const resolveEvents = battle.resolve();
    logger?.consume(resolveEvents);
    //같은 이벤트 배열을 그대로 넘긴다. 카메라용으로 따로 만들지 않는다
    if (director) printCameraCommands(turns, director.consume(resolveEvents), labels);
    if (battle.isFinished) break;

    const endEvents = battle.endTurn();
    logger?.consume(endEvents);
  }

  const survivors = battle.combatants
    .filter((c) => !c.isDefeated)
    .map((c) => ({
      label: labels.get(c.id) ?? c.id,
      hp: c.hp,
      maxHp: c.base.maxHp,
      mentality: c.mentality,
    }));

  return { winner: battle.winner, turns, survivors };
}

//카메라 명령을 한 줄씩 찍는다. 이 턴의 교전 로그 바로 뒤에 붙는다
function printCameraCommands(
  turn: number,
  commands: readonly CameraCommand[],
  labels: Map<string, string>,
): void {
  const name = (id: string): string => labels.get(id) ?? id;

  for (const command of commands) {
    if (command.type === 'focus') {
      const [first, second] = command.subjectIds;
      console.log(`[턴${turn}] [카메라] focus → ${name(first)} vs ${name(second)} (zoom ${command.zoom})`);
      continue;
    }
    if (command.type === 'shake') {
      console.log(`[턴${turn}] [카메라] shake (강도 ${command.intensity.toFixed(2)})`);
      continue;
    }
    console.log(`[턴${turn}] [카메라] idle`);
  }
}

//아군의 타겟과 카드를 적 AI 로직 그대로 고른다
function makeAllyOrders(
  battle: Battle,
  ai: WeightedEnemyAi,
  context: EnemyAiContext,
  enemyTargets: Map<string, string>,
): BattleOrder[] {
  const enemies = battle.sideOf('enemy').filter((c) => !c.isDefeated);
  const orders: BattleOrder[] = [];
  const alreadyTargeted = new Set<string>();

  for (const ally of battle.sideOf('ally')) {
    if (ally.isDefeated) continue;
    if (enemies.length === 0) break;

    const targetId = ai.chooseTarget(ally, enemies, alreadyTargeted, context);
    alreadyTargeted.add(targetId);

    //상대가 나를 겨누고 있으면 합이 된다. 적이 낼 카드는 모르므로 덱 평균으로 판단한다
    const isClash = enemyTargets.get(targetId) === ally.id;
    const target = battle.combatant(targetId);
    const skillId = ai.chooseSkill(ally, { target, isClash, opponentSkillId: null }, context);

    orders.push({ actorId: ally.id, targetId, skillId });
  }

  return orders;
}

//한 판의 마무리 요약
function printSummary(result: RunResult): void {
  const winner = result.winner === 'ally' ? '아군' : result.winner === 'enemy' ? '적' : '무승부';
  console.log('');
  console.log(`결과: ${winner} / ${result.turns}턴`);
  if (result.survivors.length === 0) {
    console.log('  생존자 없음');
    return;
  }
  for (const s of result.survivors) {
    console.log(`  ${s.label}  HP ${s.hp}/${s.maxHp}  정신력 ${s.mentality}`);
  }
}

//N 판을 돌리고 승률과 평균 턴 수만 낸다
function printBatch(catalog: BattleCatalog, seed: number, runs: number): void {
  const tally = { ally: 0, enemy: 0, draw: 0 };
  let totalTurns = 0;
  let shortest = Number.POSITIVE_INFINITY;
  let longest = 0;

  for (let i = 0; i < runs; i += 1) {
    const result = runBattle(catalog, seed + i, false);
    if (result.winner === 'ally') tally.ally += 1;
    else if (result.winner === 'enemy') tally.enemy += 1;
    else tally.draw += 1;

    totalTurns += result.turns;
    shortest = Math.min(shortest, result.turns);
    longest = Math.max(longest, result.turns);
  }

  const percent = (n: number): string => `${((n / runs) * 100).toFixed(1)}%`;
  console.log(`${runs}판 (시드 ${seed}~${seed + runs - 1})`);
  console.log(`  아군 승  ${tally.ally}  (${percent(tally.ally)})`);
  console.log(`  적 승    ${tally.enemy}  (${percent(tally.enemy)})`);
  console.log(`  무승부   ${tally.draw}  (${percent(tally.draw)})`);
  console.log(`  평균 턴  ${(totalTurns / runs).toFixed(1)}  (최소 ${shortest} / 최대 ${longest})`);
}

const { seed, runs } = parseArgs(process.argv.slice(2));
const catalog = loadBattleCatalog(DATA_PATH);

if (runs > 1) {
  printBatch(catalog, seed, runs);
} else {
  console.log(`시드 ${seed}`);
  printSummary(runBattle(catalog, seed, true));
}
