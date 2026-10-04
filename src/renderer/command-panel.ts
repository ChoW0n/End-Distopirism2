//명령 패널과 하단 현황판 (SPEC-004 §10·§11)
//
//DOM 을 만지는 곳이라 렌더러 층에 둔다. 입력 순서는 src/ui/input.ts 의 OrderInput 이 들고 있고
//여기는 그 상태를 버튼으로 보여 주고 누른 것을 돌려줄 뿐이다

import type { BattleCatalog } from '../domain/data.js';
import type { Attribute } from '../domain/types.js';
import { cardView, type CardView, type InputMember, type OrderInput } from '../ui/input.js';
import { PlanInput } from '../ui/plan-input.js';
import type { DisplayData, SideData } from '../ui/data.js';
import type { ActorSnapshot } from './canvas.js';

//패널이 부르는 쪽. 누른 것을 앱이 받아 입력 상태에 넣는다
export interface CommandHandlers {
  ally(id: string): void;
  target(id: string): void;
  card(skillId: number): void;
  go(): void;
}

//흔적 내역. 속성별 개수와 결행 문턱 (SPEC-004 §14.6)
export interface TraceCount {
  attack: number;
  defense: number;
  support: number;
  threshold: number;
}

//상세 줄·카드 판에 쓰는 것 (SPEC-004 §14.5·§14.6). 2D 화면처럼 없으면 예전 글 카드로 그린다
export interface PanelDetail {
  //표시 이름·용어 치환
  display: DisplayData | null;
  //UI 묶음 폴더. 있으면 카일 완성 카드 K 판과 흔적 기호를 쓴다
  kit: string | null;
  //지금 이 아군이 이 카드를 뒤집으면 앞면이 나올 확률 (도메인 질의)
  chance(allyId: string, skillId: number): number | null;
  //이 아군의 흔적 내역
  traces(allyId: string): TraceCount | null;
}

//흔적 순서와 기호 그림 (SPEC-004 §14.7)
const TRACE_ORDER: readonly Attribute[] = ['attack', 'defense', 'support'];
const TRACE_NAME: Record<Attribute, string> = { attack: '각인', defense: '통찰', support: '결의' };
const TRACE_FILE: Record<Attribute, string> = { attack: 'R_mark', defense: 'R_insight', support: 'R_resolve' };
//잠김 이유 (SPEC-004 §14.6)
const LOCKED_CARD = '먼저 칠 적을 무대에서 고른다';
const LOCKED_DEBT = '행동력이 빚 한도 아래로 내려가 더할 수 없다';

//패널에 보일 사람 한 명
export interface PanelMember {
  id: string;
  name: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export class CommandPanel {
  private readonly root: HTMLElement;
  private readonly step: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly allies: HTMLElement;
  private readonly enemies: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly detailLine: HTMLElement | null;
  private readonly goButton: HTMLButtonElement;
  //교전 시작이 잠겼을 때 누르면 띄울 이유
  private goLocked = '';
  //상세 줄 기본 내용. 카드를 가리키다 떼면 이것으로 돌아간다
  private detailRest: Node[] = [];

  //패널 요소를 id 로 잡는다. 버튼 이벤트는 여기서 한 번만 건다
  //portrait: 아군 칸 초상화 창에 넣을 그림 주소 (SPEC-004 §13.5 U6). 없으면 이름만
  constructor(
    private readonly catalog: BattleCatalog,
    private readonly side: SideData,
    private readonly handlers: CommandHandlers,
    private readonly portrait: (characterId: string) => string | null = () => null,
    private readonly detail: PanelDetail | null = null,
  ) {
    const find = (id: string): HTMLElement => {
      const found = document.getElementById(id);
      if (!found) throw new Error(`명령 패널 요소가 없다: #${id}`);
      return found;
    };
    this.root = find('command');
    this.step = find('cmd-step');
    this.hint = find('cmd-hint');
    this.allies = find('cmd-allies');
    this.enemies = find('cmd-enemies');
    this.cards = find('cmd-cards');
    this.goButton = find('cmd-go') as HTMLButtonElement;
    this.detailLine = document.getElementById('cmd-detail');
    //잠겼으면 막지 않고 이유를 띄운다
    this.goButton.addEventListener('click', () => {
      if (this.goButton.getAttribute('aria-disabled') === 'true') this.say(this.goLocked);
      else handlers.go();
    });
  }

  //잠김 이유 같은 짧은 안내를 단계 안내 아래 줄에
  private say(text: string): void {
    if (!text) return;
    this.hint.replaceChildren(el('strong', '', text));
  }

  //잠금. disabled 대신 aria-disabled 로 두어 눌러도 이유를 띄울 수 있게 한다
  private lock(button: HTMLButtonElement, locked: boolean): void {
    button.classList.toggle('locked', locked);
    button.setAttribute('aria-disabled', String(locked));
  }

  //상세 줄을 바꾼다. rest 면 기본 내용으로 둔다
  private showDetail(nodes: readonly (Node | string)[], rest = false): void {
    if (!this.detailLine) return;
    this.detailLine.replaceChildren(...nodes);
    if (rest) this.detailRest = Array.from(this.detailLine.childNodes);
  }

  //카드 한 장의 표시 모양. 캐릭터 한정 이름·용어 치환을 건다
  private view(characterId: string, skillId: number): CardView {
    const display = this.detail?.display;
    return cardView(this.catalog, skillId, { name: display?.cardKit[characterId]?.[skillId], terms: display?.terms });
  }

  //흔적 기호 하나
  private glyph(trace: Attribute): HTMLElement {
    const icon = el('i', 'trace');
    icon.dataset['trace'] = trace;
    if (this.detail?.kit) icon.style.setProperty('--glyph', `url(${this.detail.kit}/${TRACE_FILE[trace]}.png)`);
    return icon;
  }

  //앞면 확률 글. 카드마다 같으면 한 값, 다르면 최소~최대 (카드별 값은 카드를 가리키면 나온다)
  private chanceText(allyId: string, deck: readonly number[]): string {
    const chances = deck.map((id) => this.detail?.chance(allyId, id) ?? null).filter((p): p is number => p !== null).map((p) => Math.round(p * 100));
    if (chances.length === 0) return '';
    const low = Math.min(...chances);
    const high = Math.max(...chances);
    return low === high ? `앞면 확률 ${low}%` : `앞면 확률 ${low}~${high}%`;
  }

  //흔적 내역 줄 조각. 기호 + 이름 + 개수, 끝에 합/문턱
  private traceNodes(allyId: string): Node[] {
    const t = this.detail?.traces(allyId);
    if (!t) return [];
    const out: Node[] = [];
    for (const trace of TRACE_ORDER) {
      const part = el('span', 'trace-count');
      part.append(this.glyph(trace), `${TRACE_NAME[trace]} ${t[trace]}`);
      out.push(part);
    }
    const total = t.attack + t.defense + t.support;
    out.push(el('span', 'trace-total', `결행 ${Math.min(total, t.threshold)}/${t.threshold}`));
    return out;
  }

  //입력 단계가 아닐 때. 버튼을 흐리게 하고 지금 무슨 일인지만 적는다
  idle(text: string): void {
    this.root.classList.add('off');
    this.step.textContent = text;
    this.hint.textContent = '';
    this.showDetail([], true);
    this.goButton.disabled = true;
    this.lock(this.goButton, true);
  }

  //입력 상태를 버튼으로 다시 그린다. 누를 때마다 부른다
  //여러 턴 예약(PlanInput)이면 누른 순서·행동력을 같이 보인다 (SPEC-001 v4.0 §6)
  show(input: OrderInput | PlanInput, allies: readonly (PanelMember & InputMember)[], enemies: readonly PanelMember[]): void {
    this.root.classList.remove('off');
    const current = allies.find((a) => a.id === input.selectedAlly) ?? null;
    const target = enemies.find((e) => e.id === input.selectedTarget) ?? null;
    const plan = input instanceof PlanInput ? input : null;

    //지금 할 일 한 줄. 순서는 아군 → 대상 → 카드 (§10.1)
    if (input.ready && !current) {
      this.step.textContent = '준비 완료 — 교전 시작';
      this.hint.textContent = '아군 칸을 누르면 그 지시를 다시 한다';
    } else if (!current) {
      this.step.textContent = '① 아군을 고른다';
      this.hint.textContent = '';
    } else if (!target) {
      this.step.textContent = `② ${current.name} — 칠 적을 고른다`;
      const threat = enemies.filter((e) => input.wouldClash(e.id)).map((e) => e.name);
      this.hint.innerHTML = '';
      if (threat.length > 0) {
        this.hint.append('나를 노리는 적: ');
        this.hint.append(el('strong', '', threat.join(', ')));
        this.hint.append(' — 같이 노리면 합, 다른 적을 치면 서로 한 대씩 맞는다');
      } else {
        this.hint.textContent = '이번 턴에 나를 노리는 적이 없다. 누구를 쳐도 일방 공격이다';
      }
    } else if (plan) {
      this.step.textContent = `③ ${current.name} → ${target.name} — 쓸 순서대로 카드를 누른다`;
      const budget = plan.budgetOf(current.id);
      this.hint.replaceChildren();
      if (budget) {
        this.hint.append(`행동력 ${budget.actionPoints} → 예약 뒤 `);
        this.hint.append(el('strong', budget.after < 0 ? 'debt' : '', String(budget.after)));
        this.hint.append(` · 예약이 끝나면 ${budget.end}`);
        if (budget.end < 1) this.hint.append(el('strong', 'debt', ' — 그다음 턴은 행동 없이 맞는다'));
      }
    } else {
      this.step.textContent = `③ ${current.name} → ${target.name} — 카드를 고른다`;
      this.hint.textContent = input.wouldClash(target.id) ? '합이 벌어진다' : '일방 공격이다 (서로 겨루지 않는다)';
    }

    //상세 줄: 지금 아군의 앞면 확률과 흔적 내역 (§14.6)
    if (current) {
      const chance = this.chanceText(current.id, current.deck);
      this.showDetail([...(chance ? [el('span', 'chance', chance)] : []), ...this.traceNodes(current.id)], true);
    } else this.showDetail([], true);

    this.allies.replaceChildren(
      ...allies.map((ally) => {
        const order = input.orderOf(ally.id);
        const button = this.pick(ally.name, this.side.ally, ally.id === input.selectedAlly);
        const face = this.portrait(ally.characterId);
        if (face) {
          const frame = el('span', 'face');
          const img = el('img');
          img.src = face;
          img.alt = '';
          frame.append(img);
          button.prepend(frame);
        }
        const planned = plan?.stepsOf(ally.id) ?? [];
        const note = planned.length > 0
          ? planned.map((st) => this.view(ally.characterId, st.skillId).name).join(' → ')
          : order
          ? `${enemies.find((e) => e.id === order.targetId)?.name ?? '?'} · ${this.view(ally.characterId, order.skillId).name}`
          : ally.id === input.selectedAlly
            ? '지시 중'
            : '대기';
        button.append(el('small', '', note));
        if (order) button.classList.add('done');
        button.addEventListener('click', () => this.handlers.ally(ally.id));
        return button;
      }),
    );

    this.enemies.replaceChildren(
      ...enemies.map((enemy) => {
        const button = this.pick(enemy.name, this.side.enemy, enemy.id === input.selectedTarget);
        const clash = input.wouldClash(enemy.id);
        button.append(el('small', '', clash ? '나를 노림 · 합' : '일방'));
        if (clash) button.classList.add('clash');
        button.disabled = !current;
        button.addEventListener('click', () => this.handlers.target(enemy.id));
        return button;
      }),
    );

    this.cards.replaceChildren(
      ...(current ? current.deck : []).map((skillId) => {
        const view = this.view(current?.characterId ?? '', skillId);
        //슬롯 홈 개수로 판을 고른다 (U2·U16). 카일 완성 카드면 K 판 (§14.5). 지금 아군이 이미 고른 카드는 선택 판
        const turn = plan && current ? plan.stepsOf(current.id).findIndex((st) => st.skillId === skillId) + 1 : 0;
        const chosen = plan ? turn > 0 : current ? input.orderOf(current.id)?.skillId === skillId : false;
        const complete = !!this.detail?.kit && !!current && this.detail.display?.cardKit[current.characterId]?.[skillId] !== undefined;
        const button = el('button', `card ${view.slot === 'ULT' ? 'ult' : view.slot.toLowerCase()}${chosen ? ' chosen' : ''}${complete ? ' k' : ''}`);
        button.type = 'button';
        if (complete && this.detail?.kit) {
          for (const state of ['default', 'selected', 'locked'] as const) button.style.setProperty(`--k-${state}`, `url(${this.detail.kit}/K${skillId}_${state}.png)`);
        }
        const kind = view.attribute ?? '결행';
        //설명은 카드에 얹지 않고 툴팁·접근성 이름·상세 줄로 (§14.5)
        button.title = `${view.name} (${kind}) — ${view.text}`;
        button.setAttribute('aria-label', `${view.name}, ${kind}, 앞 ${view.frontPower} 뒤 ${view.backPower}. ${view.text}`);
        const art = el('span', 'art');
        if (!complete) art.append(view.trace ? this.glyph(view.trace) : el('i', 'trace ult'));
        const front = el('span', 'pw front');
        front.append(el('small', '', '앞'), String(view.frontPower));
        const back = el('span', 'pw back');
        back.append(el('small', '', '뒤'), String(view.backPower));
        button.append(el('span', 'title', view.name), art, front, back, el('span', 'kind', kind));
        //예약이면 몇 번째 턴인지와 비용을 단다
        if (plan) {
          if (turn > 0) button.append(el('span', 'order', String(turn)));
          button.append(el('span', 'cost', `행동 ${this.catalog.skill(skillId).apCost}`));
        }
        const debt = !!plan && !!target && !plan.canToggle(skillId);
        const locked = !target || debt;
        this.lock(button, locked);
        //가리키면 그 카드 설명, 떼면 기본 상세 줄
        const explain = (): void => {
          const p = current ? this.detail?.chance(current.id, skillId) : null;
          const parts: (Node | string)[] = [el('strong', '', view.name), ` — ${view.text}`];
          if (p !== null && p !== undefined) parts.push(el('span', 'chance', ` · 앞면 ${Math.round(p * 100)}%`));
          this.showDetail(parts);
        };
        const rest = (): void => this.showDetail(this.detailRest);
        button.addEventListener('pointerenter', explain);
        button.addEventListener('focus', explain);
        button.addEventListener('pointerleave', rest);
        button.addEventListener('blur', rest);
        button.addEventListener('click', () => {
          if (locked) this.say(debt ? LOCKED_DEBT : LOCKED_CARD);
          else this.handlers.card(skillId);
        });
        return button;
      }),
    );

    //교전 시작. 지시가 다 안 찼으면 잠그고 남은 아군을 이유로
    const waiting = allies.filter((a) => !input.orderOf(a.id)).map((a) => a.name);
    this.goLocked = waiting.length > 0 ? `${plan ? '예약이' : '지시가'} 남은 아군: ${waiting.join(', ')}` : '';
    this.goButton.disabled = false;
    this.lock(this.goButton, !input.ready);
  }

  //아군·적 칸 하나
  private pick(name: string, color: string, pressed: boolean): HTMLButtonElement {
    const button = el('button', 'pick');
    button.type = 'button';
    button.style.setProperty('--side', color);
    button.setAttribute('aria-pressed', String(pressed));
    button.append(el('b', '', name));
    return button;
  }
}

//하단 현황판. 렌더러가 바에 받은 숫자를 그대로 보인다 (§11)
export class BattleHud {
  private last = '';

  constructor(
    private readonly allyRoot: HTMLElement,
    private readonly enemyRoot: HTMLElement,
    private readonly side: SideData,
    private readonly colors: { hp: string; mentality: string },
  ) {}

  //바뀐 게 있을 때만 다시 그린다. 매 장면 불러도 된다
  update(units: readonly ActorSnapshot[]): void {
    const key = JSON.stringify(units);
    if (key === this.last) return;
    this.last = key;
    this.allyRoot.replaceChildren(...units.filter((u) => u.side === 'ally').map((u) => this.unit(u)));
    this.enemyRoot.replaceChildren(...units.filter((u) => u.side === 'enemy').map((u) => this.unit(u)));
  }

  private unit(unit: ActorSnapshot): HTMLElement {
    const box = el('div', unit.down ? 'hud-unit down' : 'hud-unit');
    box.style.setProperty('--side', unit.side === 'ally' ? this.side.ally : this.side.enemy);
    box.append(el('b', '', unit.name));
    const hp = unit.hp;
    const bar = el('div', 'hud-bar');
    const fill = el('i');
    fill.style.setProperty('--fill', this.colors.hp);
    fill.style.width = hp ? `${Math.max(0, Math.min(100, (hp.value / hp.max) * 100))}%` : '100%';
    bar.append(fill);
    const num = el('div', 'hud-num');
    num.append(el('span', '', hp ? `체력 ${Math.round(hp.value)}/${hp.max}` : '체력 -'));
    const mind = el('em', '', unit.mentality ? `정신력 ${Math.round(unit.mentality.value)}` : '');
    mind.style.color = this.colors.mentality;
    num.append(mind);
    box.append(bar, num);
    return box;
  }
}
