//예약 전투 시뮬레이터. 기본 대진은 실제 3D 무대 데이터와 같다
//npm run sim -- --seed 1 --bot greedy
//npm run sim -- --runs 200 --bot all --json docs/qa-m1-results.json
//--roster helper,main 은 미러 비교, --data 경로 는 튜닝 전후 비교용이다

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Battle } from '../src/domain/battle.js';
import { CameraDirector, type CameraCommand } from '../src/camera/director.js';
import { loadBattleCatalog } from '../src/platform/node-data.js';
import { loadUiData } from '../src/platform/node-ui.js';
import type { BattleCatalog } from '../src/domain/data.js';
import type { BattleEvent } from '../src/domain/types.js';
import { BOT_KINDS, runSimulation, summarize, type BotKind, type SimulationResult } from './simulation.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(here, '../docs/battle-data.json');
const UI_PATH = resolve(here, '../assets/ui/ui-data.json');
const STAGE_PATH = resolve(here, '../assets/ui/stage3d.json');

//잘못된 인자로 다른 측정을 하지 않도록 누락·오타를 여기서 막는다
function parseArgs(argv: string[]) {
  const args = { seed: 1, runs: 1, roster: null as string[] | null, bot: 'ai' as BotKind | 'all', data: DATA_PATH, json: null as string | null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`${key}: 값이 필요하다`);
    if (key === '--seed' || key === '--runs') {
      const n = Number(value);
      if (!Number.isSafeInteger(n) || (key === '--runs' && n < 1)) throw new Error(`${key}: 유효한 정수가 필요하다`);
      args[key === '--seed' ? 'seed' : 'runs'] = n;
    } else if (key === '--roster') {
      args.roster = value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!args.roster.length) throw new Error('로스터가 비었다');
    } else if (key === '--bot') {
      if (value !== 'all' && !BOT_KINDS.includes(value as BotKind)) throw new Error(`알 수 없는 봇: ${value}`);
      args.bot = value as BotKind | 'all';
    } else if (key === '--data') args.data = resolve(value);
    else if (key === '--json') args.json = resolve(value);
    else throw new Error(`알 수 없는 인자: ${key}`);
  }
  return args;
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
  private lastFace = new Map<string, string>();
  private turn = 0;

  //전투 상태와 이름표를 받아 교전 로그를 묶는다
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

      case 'cardFlipped':
        this.lastFace.set(event.combatantId, event.face === 'front' ? `앞 ${event.power}` : `뒤 ${event.power}`);
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

      case 'planSet':
        this.print(`예약 ${this.name(event.combatantId)}: ${event.steps.map((s) => this.catalog.skill(s.skillId).name).join(' → ')} / 행동력 ${event.actionPoints}`);
        return;
      case 'idle':
        this.print(`${this.name(event.combatantId)} 행동 없음`);
        return;
      case 'ultimateUsed':
        this.print(`${this.name(event.combatantId)} 결행 사용`);
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
    const face = this.lastFace.get(pending.winnerId) ?? '';
    const notes = pending.notes.length > 0 ? `  [${pending.notes.join(' ')}]` : '';

    const head =
      pending.kind === '합'
        ? `[합] ${attacker}(${pending.attackerSkill}) vs ${defender}(${pending.defenderSkill}) : ${this.name(pending.winnerId)} 승 ${pending.rounds}라운드`
        : `[일방] ${attacker}(${pending.attackerSkill}) → ${defender}`;

    const tail = final
      ? ` / ${face} / 피해 ${final.damage} → ${this.name(loserId)} HP ${final.hp}/${this.battle.combatant(loserId).base.maxHp}`
      : ` / ${face} / 피해 없음`;

    this.print(head + tail + notes);
  }
}

//카메라 명령을 한 줄씩 찍는다. 이 턴의 교전 로그 바로 뒤에 붙는다
function printCameraCommands(
  turn: number,
  commands: readonly CameraCommand[],
  labels: Map<string, string>,
): void {
  const name = (id: string): string => labels.get(id) ?? id;

  for (const command of commands) {
    //종류마다 한 줄. 모르는 종류를 idle 로 떨어뜨리지 않는다
    switch (command.type) {
      case 'focus': {
        const [first, second] = command.subjectIds;
        const tilt = command.tiltDeg ? `, 기울기 ${command.tiltDeg}°` : '';
        console.log(`[턴${turn}] [카메라] focus → ${name(first)} vs ${name(second)} (zoom ${command.zoom}${tilt})`);
        break;
      }
      case 'shake':
        console.log(`[턴${turn}] [카메라] shake (강도 ${command.intensity.toFixed(2)})`);
        break;
      case 'punch':
        console.log(`[턴${turn}] [카메라] punch (+${command.zoom})`);
        break;
      case 'slowmo':
        console.log(`[턴${turn}] [카메라] slowmo (×${command.scale}, ${command.sec}초)`);
        break;
      case 'idle':
        console.log(`[턴${turn}] [카메라] idle`);
        break;
    }
  }
}

//한 판의 마무리 요약
function printSummary(result: SimulationResult): void {
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

//기계용 결과에는 원시 판별 값·입력 사본·해시를 같이 남겨 전후 측정을 재현한다
const args = parseArgs(process.argv.slice(2));
const catalog = loadBattleCatalog(args.data);
const stage = JSON.parse(readFileSync(STAGE_PATH, 'utf8'));
const setup = args.roster ? { ally: args.roster, enemy: args.roster } : { ally: stage.battle.ally as string[], enemy: stage.battle.enemy as string[] };
const bots = args.bot === 'all' ? BOT_KINDS : [args.bot];
const verbose = args.runs === 1 && bots.length === 1;
const batches = bots.map((bot) => {
  let logger: BattleLogger | null = null;
  const director = verbose ? new CameraDirector(loadUiData(UI_PATH).camera) : null;
  const results = Array.from({ length: args.runs }, (_, i) => runSimulation(catalog, setup, args.seed + i, bot, stage.motion.heavyDamage,
    verbose ? (events, battle) => {
      const labels = makeLabels(battle);
      logger ??= new BattleLogger(catalog, battle, labels);
      logger.consume(events);
      if (director) printCameraCommands(battle.turn, director.consume(events), labels);
    } : undefined));
  const summary = summarize(results);
  if (verbose) printSummary(results[0]!);
  console.log(`${bot} / ${args.runs}판 / 시드 ${args.seed}~${args.seed + args.runs - 1} / ${setup.ally.join(',')} 대 ${setup.enemy.join(',')}`);
  console.log(`  아군 승률 ${(summary.allyWinRate * 100).toFixed(1)}% · 평균 ${summary.turns.mean.toFixed(3)}턴 · 합 ${(summary.clashRate * 100).toFixed(1)}% · 무거운 타 ${summary.heavyHits.toFixed(3)}회`);
  console.log(`  아군 결행 사용 ${summary.sides.ally.ultimateUses.toFixed(3)}회 / 공격 ${summary.sides.ally.ultimateAttacks.toFixed(3)}회 · 행동 없음 ${summary.sides.ally.idleTurns.toFixed(3)}턴 · 미종료 ${summary.wins.timeout}판`);
  console.log(`  양측 결행 사용 ${summary.ultimate.uses.toFixed(3)}회 / 공격 ${summary.ultimate.attacks.toFixed(3)}회 · 결행 사용이 있는 판 ${(summary.ultimate.useBattleRate * 100).toFixed(1)}%`);
  return { bot, summary, results };
});
if (args.json) {
  const hash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
  let sourceCommit: string | null = null;
  let dirty: boolean | null = null;
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim();
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: here, encoding: 'utf8' }).trim().length > 0;
  } catch {
    //소스 ZIP으로 실행해도 입력 해시와 사본은 남긴다
  }
  const report = { schemaVersion: 1, sourceCommit, dirty, command: process.argv.slice(2), seedStart: args.seed, runsPerBot: args.runs,
    setup, heavyDamage: stage.motion.heavyDamage,
    hashes: { battleData: hash(args.data), stage: hash(STAGE_PATH), runner: hash(fileURLToPath(import.meta.url)), simulation: hash(resolve(here, 'simulation.ts')) },
    battleData: JSON.parse(readFileSync(args.data, 'utf8')), batches };
  writeFileSync(args.json, JSON.stringify(report, null, 2) + '\n');
  console.log(`결과 저장: ${args.json}`);
}
