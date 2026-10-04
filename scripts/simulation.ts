//예약판으로 실제 자동 관전과 같은 전투를 돌리고 M1 지표를 모은다
import { WeightedEnemyAi, type EnemyAiContext } from '../src/domain/ai.js';
import { Battle } from '../src/domain/battle.js';
import { ClashResolver } from '../src/domain/clash.js';
import type { Combatant } from '../src/domain/combatant.js';
import type { BattleCatalog } from '../src/domain/data.js';
import { PlanBoard, plannedBattleOptions } from '../src/domain/plan.js';
import { createSeededRng } from '../src/domain/rng.js';
import type { BattleEvent, PlanStep, Side } from '../src/domain/types.js';
import { toStageSteps } from '../src/render/exchange.js';

export type BotKind = 'ai' | 'greedy' | 'cautious';
export const BOT_KINDS: readonly BotKind[] = ['ai', 'greedy', 'cautious'];
export interface SimulationSetup { ally: readonly string[]; enemy: readonly string[] }
export interface SideMetrics {
  idleTurns: number;
  idleAttacksReceived: number;
  ultimateUses: number;
  ultimateAttacks: number;
  plans: number;
  debtPlans: number;
  minActionPoints: number;
}
export interface SimulationResult {
  seed: number;
  bot: BotKind;
  winner: Side | null;
  timedOut: boolean;
  turns: number;
  clashes: number;
  oneSided: number;
  heavyHits: number;
  sides: Record<Side, SideMetrics>;
  survivors: { label: string; hp: number; maxHp: number; mentality: number }[];
}

//선택 전략만 다르게 하고 예약 확정·비용·회복은 모두 실제 예약판에 맡긴다
export class ReservationBot {
  //AI 봇은 예약판의 기존 정책을 그대로 사용한다
  constructor(readonly kind: BotKind, private readonly ai: WeightedEnemyAi, private readonly context: EnemyAiContext) {}

  //욕심·신중 봇도 같은 가중 추첨을 쓰되 예약에 쓸 수 있는 예산만 다르다
  choose(actor: Combatant, battle: Battle, board: PlanBoard): PlanStep[] {
    if (this.kind === 'ai') return board.choosePlan(actor);
    const { catalog } = this.context;
    const floor = this.kind === 'greedy' ? catalog.rules.actionPoints.floor : 0;
    const opponents = battle.combatants.filter((c) => c.side !== actor.side && !c.isDefeated);
    const steps: PlanStep[] = [];
    let left = board.actionPoints(actor.id);
    for (let i = 0; i < actor.deck.length && opponents.length > 0; i++) {
      const candidates = actor.deck.filter((id) => !steps.some((s) => s.skillId === id)
        && !catalog.skill(id).tbd && left - catalog.skill(id).apCost >= floor);
      if (candidates.length === 0) break;
      const targetId = this.ai.chooseTarget(actor, opponents, new Set(), this.context);
      const skillId = this.ai.chooseSkill(actor, {
        target: battle.combatant(targetId), isClash: true, opponentSkillId: null, candidates,
      }, this.context);
      steps.push({ targetId, skillId });
      left -= catalog.skill(skillId).apCost;
    }
    if (steps.length === 0) throw new Error(`${this.kind}: ${actor.id}가 예산 안에서 낼 카드가 없다`);
    return steps;
  }
}

//판당 누적기. 시뮬레이터가 규칙을 대신 계산하지 않고 도메인·연출 어댑터의 결과만 센다
class Metrics {
  readonly sides: Record<Side, SideMetrics>;
  clashes = 0;
  oneSided = 0;
  heavyHits = 0;
  private readonly idle = new Set<string>();

  //행동력 최솟값은 참가자 시작값부터 센다
  constructor(private readonly battle: Battle, board: PlanBoard, private readonly catalog: BattleCatalog, private readonly heavyDamage: number) {
    const initial = (side: Side): SideMetrics => ({ idleTurns: 0, idleAttacksReceived: 0, ultimateUses: 0, ultimateAttacks: 0,
      plans: 0, debtPlans: 0, minActionPoints: Math.min(...battle.sideOf(side).map((c) => board.actionPoints(c.id))) });
    this.sides = { ally: initial('ally'), enemy: initial('enemy') };
  }

  //한 진영이 여럿이면 행동 없음은 참가자·턴 수이고, 현재 데모 1대1에서는 턴 수와 같다
  consume(events: readonly BattleEvent[]): void {
    for (const e of events) {
      if (e.type === 'turnStart') this.idle.clear();
      if (e.type === 'clashStart') this.clashes++;
      if (e.type === 'oneSidedStart') {
        this.oneSided++;
        if (this.idle.has(e.targetId)) this.of(e.targetId).idleAttacksReceived++;
      }
      if (e.type === 'idle') { this.of(e.combatantId).idleTurns++; this.idle.add(e.combatantId); }
      if (e.type === 'ultimateUsed') this.of(e.combatantId).ultimateUses++;
      if (e.type === 'planSet') {
        this.of(e.combatantId).plans++;
        if (e.actionPoints < 0) this.of(e.combatantId).debtPlans++;
      }
      if (e.type === 'actionPointsChanged') {
        const side = this.of(e.combatantId);
        side.minActionPoints = Math.min(side.minActionPoints, e.actionPoints);
      }
    }
    for (const step of toStageSteps(events, { isPlayerSide: (id) => this.battle.combatant(id).side === 'ally' })) {
      const hit = step.kind === 'oneSided' ? { id: step.attackerId, skill: step.skillId, damage: step.damage }
        : step.kind === 'clash' && step.finisher ? { id: step.finisher.winnerId, skill: step.finisher.winnerSkillId, damage: step.finisher.damage } : null;
      if (!hit) continue;
      if (hit.damage >= this.heavyDamage) this.heavyHits++;
      if (hit.skill === this.catalog.rules.ultimateSkillId) this.of(hit.id).ultimateAttacks++;
    }
  }

  //참가자 ID를 소속 진영의 집계로 바꾼다
  private of(id: string): SideMetrics { return this.sides[this.battle.combatant(id).side]; }
}

//자동 관전과 난수원·호출 순서를 맞춘다. onEvents는 로그와 회귀 검증에만 쓴다
export function runSimulation(catalog: BattleCatalog, setup: SimulationSetup, seed: number, bot: BotKind, heavyDamage: number,
  onEvents?: (events: readonly BattleEvent[], battle: Battle, board: PlanBoard) => void, maxTurns = 100): SimulationResult {
  const rng = createSeededRng(seed);
  const ai = new WeightedEnemyAi();
  const context = { catalog, resolver: new ClashResolver(catalog, rng), rng };
  const board = new PlanBoard(catalog, ai, context);
  const roster = (side: Side, ids: readonly string[]) => ids.map((characterId, i) => ({ id: `${side === 'ally' ? 'a' : 'e'}${i + 1}`, characterId, side }));
  const battle = new Battle(catalog, roster('ally', setup.ally), roster('enemy', setup.enemy), { rng, ...plannedBattleOptions(board) });
  board.attach(battle);
  const strategy = new ReservationBot(bot, ai, context);
  const metrics = new Metrics(battle, board, catalog, heavyDamage);
  const consume = (events: readonly BattleEvent[]): void => { metrics.consume(events); onEvents?.(events, battle, board); };
  for (let t = 0; t < maxTurns && !battle.isFinished; t++) {
    const start = battle.startTurn();
    consume(start);
    if (battle.isFinished) break;
    const aimed = new Map<string, string>();
    for (const e of start) if (e.type === 'enemyTargeted') aimed.set(e.enemyId, e.targetId);
    for (const ally of battle.sideOf('ally')) {
      if (board.needsPlan(ally.id)) consume(board.submit(ally.id, strategy.choose(ally, battle, board)));
    }
    battle.submitOrders(board.orders(aimed));
    consume(battle.resolve());
    if (battle.isFinished) break;
    consume(battle.endTurn());
    consume(board.endTurn());
  }
  return { seed, bot, winner: battle.winner, timedOut: !battle.isFinished, turns: battle.turn,
    clashes: metrics.clashes, oneSided: metrics.oneSided, heavyHits: metrics.heavyHits, sides: metrics.sides,
    survivors: battle.combatants.filter((c) => !c.isDefeated).map((c) => ({
      label: c.side === 'ally' ? c.base.name : `${c.base.name}(적)`, hp: c.hp, maxHp: c.base.maxHp, mentality: c.mentality,
    })),
  };
}

//전체 판 원시 결과를 분모로 요약한다. 미종료 판을 조용히 버리지 않는다
export function summarize(results: readonly SimulationResult[]) {
  if (results.length === 0) throw new Error('집계할 판이 없다');
  const sum = (f: (r: SimulationResult) => number): number => results.reduce((n, r) => n + f(r), 0);
  const mean = (f: (r: SimulationResult) => number): number => sum(f) / results.length;
  const clashes = sum((r) => r.clashes);
  const oneSided = sum((r) => r.oneSided);
  const side = (s: Side) => ({
    idleTurns: mean((r) => r.sides[s].idleTurns), idleAttacksReceived: mean((r) => r.sides[s].idleAttacksReceived),
    ultimateUses: mean((r) => r.sides[s].ultimateUses), ultimateAttacks: mean((r) => r.sides[s].ultimateAttacks),
    ultimateUseBattleRate: mean((r) => Number(r.sides[s].ultimateUses > 0)),
    ultimateAttackBattleRate: mean((r) => Number(r.sides[s].ultimateAttacks > 0)),
    plans: mean((r) => r.sides[s].plans), debtPlans: mean((r) => r.sides[s].debtPlans),
    minActionPoints: Math.min(...results.map((r) => r.sides[s].minActionPoints)),
  });
  return { runs: results.length, wins: { ally: sum((r) => Number(r.winner === 'ally')), enemy: sum((r) => Number(r.winner === 'enemy')),
    draw: sum((r) => Number(!r.timedOut && r.winner === null)), timeout: sum((r) => Number(r.timedOut)) },
    allyWinRate: mean((r) => Number(r.winner === 'ally')),
    turns: { mean: mean((r) => r.turns), min: Math.min(...results.map((r) => r.turns)), max: Math.max(...results.map((r) => r.turns)),
      inDemoRangeRate: mean((r) => Number(r.turns >= 4 && r.turns <= 8)) },
    clashes, oneSided, clashRate: clashes + oneSided > 0 ? clashes / (clashes + oneSided) : 0,
    heavyHits: mean((r) => r.heavyHits), sides: { ally: side('ally'), enemy: side('enemy') },
    ultimate: { uses: mean((r) => r.sides.ally.ultimateUses + r.sides.enemy.ultimateUses),
      attacks: mean((r) => r.sides.ally.ultimateAttacks + r.sides.enemy.ultimateAttacks),
      useBattleRate: mean((r) => Number(r.sides.ally.ultimateUses + r.sides.enemy.ultimateUses > 0)),
      attackBattleRate: mean((r) => Number(r.sides.ally.ultimateAttacks + r.sides.enemy.ultimateAttacks > 0)) },
  };
}
