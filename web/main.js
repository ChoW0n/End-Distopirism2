//전투만 반복해서 돌려보는 테스트 페이지.
//규칙은 도메인(domain.js)이 전부 들고 있고, 여기는 화면에 그리고 입력만 받는다

const { Battle, WeightedEnemyAi, ClashResolver, BattleCatalog, parseBattleData, createSeededRng } = ED;

let catalog = null;
let battle = null;
let ai = null;
let aiContext = null;
let labels = new Map();
let autoAlly = false;

//이번 턴에 아직 명령을 안 낸 아군과, 현재 고르는 중인 아군
let pending = [];      //{actorId, targetId|null, skillId|null}
let picking = null;    //선택 중인 아군 id
let orders = [];

const $ = (id) => document.getElementById(id);
const log = (line) => { $('log').textContent += line + '\n'; $('log').scrollTop = 1e9; };
const name = (id) => labels.get(id) ?? id;

//전투 수치를 읽어 조회표를 만든다. 도메인이 읽는 파일 그대로다
async function boot() {
  //한 파일로 묶인 판에서는 데이터가 이미 안에 들어 있다
  const raw = window.__BATTLE_DATA__ ?? (await (await fetch('battle-data.json')).json());
  catalog = new BattleCatalog(parseBattleData(raw));
  $('restart').onclick = () => restart();
  $('resolve').onclick = () => resolveTurn();
  $('auto').onclick = () => { autoAlly = !autoAlly; $('auto').textContent = autoAlly ? '아군 수동' : '아군 자동'; if (autoAlly) fillAuto(); };
  $('batch').onclick = () => runBatch();
  restart();
}

//양 진영 로스터. 데이터에 있는 캐릭터 전원을 미러로 세운다
function roster(side) {
  const prefix = side === 'ally' ? 'a' : 'e';
  return catalog.data.characters.map((c, i) => ({ id: `${prefix}${i + 1}`, characterId: c.id, side }));
}

//한 판을 새로 시작한다. 같은 시드면 같은 전투가 나온다
function restart() {
  const seed = Number($('seed').value) || 1;
  const rng = createSeededRng(seed);
  ai = new WeightedEnemyAi();
  battle = new Battle(catalog, roster('ally'), roster('enemy'), { rng, enemyAi: ai });
  const resolver = new ClashResolver(catalog, rng, { alliesOf: (c) => battle.sideOf(c.side) });
  aiContext = { catalog, resolver, rng };

  labels = new Map(battle.combatants.map((c) => [c.id, c.side === 'ally' ? c.base.name : `${c.base.name}(적)`]));
  $('log').textContent = '';
  log(`=== 시드 ${seed} ===`);
  startTurn();
}

//턴을 연다. 적이 누구를 겨눴는지는 이때 정해진다
function startTurn() {
  if (battle.isFinished) return finish();
  consume(battle.startTurn());
  if (battle.isFinished) return finish();

  pending = battle.sideOf('ally').filter((c) => !c.isDefeated).map((c) => ({ actorId: c.id, targetId: null, skillId: null }));
  picking = pending[0]?.actorId ?? null;
  orders = [];
  if (autoAlly) fillAuto();
  render();
}

//아군 명령을 적 AI 로직으로 대신 고른다. 밸런스만 볼 때 쓴다
function fillAuto() {
  if (!battle || battle.phase !== 'awaitingOrders') return;
  const enemies = battle.sideOf('enemy').filter((c) => !c.isDefeated);
  const taken = new Set();
  for (const p of pending) {
    if (enemies.length === 0) break;
    const ally = battle.combatant(p.actorId);
    p.targetId = ai.chooseTarget(ally, enemies, taken, aiContext);
    taken.add(p.targetId);
    const target = battle.combatant(p.targetId);
    const isClash = battle.combatant(p.targetId) && enemyTargetOf(p.targetId) === ally.id;
    p.skillId = ai.chooseSkill(ally, { target, isClash, opponentSkillId: null }, aiContext);
  }
  render();
}

//적 하나가 겨누는 대상. 턴 시작 이벤트에서 모아 둔 값을 쓴다
const enemyTargets = new Map();
function enemyTargetOf(enemyId) { return enemyTargets.get(enemyId); }

//선택이 다 찼으면 합을 진행할 수 있다
function ready() { return pending.every((p) => p.targetId && p.skillId != null); }

//명령을 도메인에 넘기고 교전을 굴린다
function resolveTurn() {
  if (!ready()) return;
  battle.submitOrders(pending.map((p) => ({ actorId: p.actorId, targetId: p.targetId, skillId: p.skillId })));
  consume(battle.resolve());
  if (battle.isFinished) return finish();
  consume(battle.endTurn());
  startTurn();
}

//전투 이벤트를 사람이 읽는 줄로 바꾼다. 화면 갱신은 이벤트 처리 뒤 한 번만 한다
const badges = new Map();
function consume(events) {
  for (const e of events) {
    switch (e.type) {
      case 'turnStart': log(`\n--- 턴 ${e.turn} ---`); badges.clear(); enemyTargets.clear(); break;
      case 'enemyTargeted': enemyTargets.set(e.enemyId, e.targetId); log(`${name(e.enemyId)} → ${name(e.targetId)} 겨냥`); break;
      case 'clashStart': log(`[합] ${name(e.attackerId)}(${catalog.skill(e.attackerSkillId).name}) vs ${name(e.defenderId)}(${catalog.skill(e.defenderSkillId).name})`); break;
      case 'oneSidedStart': log(`[일방] ${name(e.attackerId)}(${catalog.skill(e.skillId).name}) → ${name(e.targetId)}`); break;
      case 'coinRolled': log(`  코인 ${name(e.combatantId)} ${e.rolls.map((r) => (r ? '●' : '○')).join('')} ${e.successCount}성공 (${Math.round(e.probability * 100)}%)`); break;
      case 'clashRoundWin': badges.set(e.winnerId, 'win'); badges.set(e.loserId, 'lose'); log(`  합 승 ${name(e.winnerId)}`); break;
      case 'deadlock': log(`  교착 ${e.count}/3`); break;
      case 'deadlockLimit': log('  교착 3회 — 합 종료'); break;
      case 'damageApplied': log(`  피해 ${name(e.combatantId)} -${e.damage} → HP ${e.hp}`); break;
      case 'damageNullified': log('  피해 무효'); break;
      case 'executed': log(`  처형 ${name(e.combatantId)}`); break;
      case 'mentalityChanged': log(`  정신력 ${name(e.combatantId)} ${e.delta > 0 ? '+' : ''}${e.delta} → ${e.mentality}`); break;
      case 'statusApplied': log(`  ${catalog.status(e.status).name} ${e.turns}턴 (${name(e.combatantId)})`); break;
      case 'statusTicked': log(`  ${catalog.status(e.status).name} ${name(e.combatantId)} -${e.damage}`); break;
      case 'attributeGained': log(`  속성 ${e.attribute} +1 (${name(e.combatantId)})`); break;
      case 'ultimateReady': log(`★ 궁극기 준비 — ${name(e.combatantId)}`); break;
      case 'ultimateUsed': log(`★ 궁극기 — ${name(e.combatantId)}`); break;
      case 'defeated': badges.set(e.combatantId, 'dead'); log(`  격파 ${name(e.combatantId)}`); break;
      case 'battleEnd': log(`\n=== ${e.winner === 'ally' ? '아군 승' : e.winner === 'enemy' ? '적 승' : '무승부'} ===`); break;
      default: break;
    }
  }
}

function finish() {
  $('banner').textContent = battle.winner === 'ally' ? '아군 승리' : battle.winner === 'enemy' ? '패배' : '무승부';
  pending = []; picking = null;
  render();
}

//화면 전체를 다시 그린다. 상태가 작아서 부분 갱신할 이유가 없다
function render() {
  $('turn').textContent = battle.turn;
  for (const side of ['ally', 'enemy']) {
    $(side).innerHTML = '';
    for (const c of battle.sideOf(side)) $(side).appendChild(unitView(c));
  }
  $('resolve').disabled = !ready() || battle.isFinished;
  renderOrders();
}

//유닛 한 명. 이름·체력·정신력·코인·속성 누적
function unitView(c) {
  const el = document.createElement('div');
  const order = pending.find((p) => p.actorId === c.id);
  el.className = 'unit' + (c.isDefeated ? ' dead' : '') + (picking === c.id ? ' sel' : '') + (order && order.skillId != null ? ' done' : '');
  const attrs = c.attributes ? Object.entries(c.attributes).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ') : '';
  const b = badges.get(c.id);
  el.innerHTML = `
    <div class="nm"><span>${name(c.id)}</span><span class="sub">HP ${c.hp}/${c.base.maxHp}</span></div>
    ${b ? `<span class="badge ${b}">${b === 'win' ? '합 승' : b === 'lose' ? '합 패' : '격파'}</span>` : ''}
    <div class="bar hp"><i style="width:${(c.hp / c.base.maxHp) * 100}%"></i></div>
    <div class="bar mt"><i style="width:${c.mentality}%"></i></div>
    <div class="sub">정신력 ${c.mentality}</div>
    <div class="coins">${Array.from({ length: c.base.maxCoin }, (_, i) => `<b class="${i < c.coin ? '' : 'off'}"></b>`).join('')}</div>
    ${attrs ? `<div class="attr">${attrs}</div>` : ''}`;
  //적을 누르면 지금 고르는 아군의 대상이 된다
  if (c.side === 'enemy' && !c.isDefeated) el.onclick = () => pickTarget(c.id);
  if (c.side === 'ally' && !c.isDefeated) el.onclick = () => { picking = c.id; render(); };
  return el;
}

function pickTarget(enemyId) {
  const p = pending.find((x) => x.actorId === picking);
  if (!p) return;
  p.targetId = enemyId;
  render();
}

//선택 중인 아군의 전용기 카드. 궁극기가 준비되면 한 장 더 붙는다
function renderOrders() {
  const box = $('orders');
  box.innerHTML = '';
  if (battle.isFinished) { box.innerHTML = '<div class="hint">재시작을 눌러 다시 돌린다</div>'; return; }
  const p = pending.find((x) => x.actorId === picking);
  if (!p) { box.innerHTML = '<div class="hint">아군을 고른다</div>'; return; }
  const actor = battle.combatant(p.actorId);

  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = `${name(p.actorId)} → ${p.targetId ? name(p.targetId) : '대상을 고른다(적을 클릭)'}`;
  box.appendChild(head);

  for (const skillId of actor.deck) {
    const s = catalog.skill(skillId);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="t">${s.name}</div>` +
      `<div class="d">기본 ${s.baseDamage} · 코인당 ${s.coinPower} · ${s.archetype}` +
      `${s.attribute ? ` · 속성 ${s.attribute}` : ''}${s.tbd ? ' · 미정' : ''}</div>`;
    card.onclick = () => { p.skillId = skillId; nextPick(); };
    box.appendChild(card);
  }
}

//카드를 고르면 아직 안 고른 다음 아군으로 넘어간다
function nextPick() {
  const next = pending.find((x) => x.skillId == null || !x.targetId);
  picking = next ? next.actorId : null;
  render();
}

//N판을 자동으로 돌려 승률만 본다. 반복 테스트가 이 페이지의 목적이다
function runBatch() {
  const runs = Math.max(1, Number($('runs').value) || 1);
  const base = Number($('seed').value) || 1;
  const tally = { ally: 0, enemy: 0, draw: 0 };
  let turns = 0;
  for (let i = 0; i < runs; i += 1) {
    const r = headless(base + i);
    tally[r.winner ?? 'draw'] += 1;
    turns += r.turns;
  }
  const pct = (n) => `${((n / runs) * 100).toFixed(1)}%`;
  log(`\n[자동 ${runs}판 · 시드 ${base}~${base + runs - 1}] 아군 ${tally.ally}(${pct(tally.ally)}) / 적 ${tally.enemy}(${pct(tally.enemy)}) / 무 ${tally.draw} / 평균 ${(turns / runs).toFixed(1)}턴`);
}

//화면 없이 한 판을 끝까지 돌린다. 양쪽 다 같은 AI 다
function headless(seed) {
  const rng = createSeededRng(seed);
  const bot = new WeightedEnemyAi();
  const b = new Battle(catalog, roster('ally'), roster('enemy'), { rng, enemyAi: bot });
  const resolver = new ClashResolver(catalog, rng, { alliesOf: (c) => b.sideOf(c.side) });
  const ctx = { catalog, resolver, rng };
  let turns = 0;
  //서로 안 죽고 끌리는 판을 자르는 안전장치. 도메인 규칙이 아니다
  while (!b.isFinished && turns < 100) {
    turns += 1;
    const start = b.startTurn();
    if (b.isFinished) break;
    const targets = new Map();
    for (const e of start) if (e.type === 'enemyTargeted') targets.set(e.enemyId, e.targetId);

    const enemies = b.sideOf('enemy').filter((c) => !c.isDefeated);
    const taken = new Set();
    const list = [];
    for (const ally of b.sideOf('ally')) {
      if (ally.isDefeated || enemies.length === 0) continue;
      const targetId = bot.chooseTarget(ally, enemies, taken, ctx);
      taken.add(targetId);
      const target = b.combatant(targetId);
      const skillId = bot.chooseSkill(ally, { target, isClash: targets.get(targetId) === ally.id, opponentSkillId: null }, ctx);
      list.push({ actorId: ally.id, targetId, skillId });
    }
    b.submitOrders(list);
    b.resolve();
    if (b.isFinished) break;
    b.endTurn();
  }
  return { winner: b.winner, turns };
}

boot();
