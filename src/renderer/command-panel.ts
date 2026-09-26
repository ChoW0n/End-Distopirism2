//명령 패널과 하단 현황판 (SPEC-004 §10·§11)
//
//DOM 을 만지는 곳이라 렌더러 층에 둔다. 입력 순서는 src/ui/input.ts 의 OrderInput 이 들고 있고
//여기는 그 상태를 버튼으로 보여 주고 누른 것을 돌려줄 뿐이다

import type { BattleCatalog } from '../domain/data.js';
import { cardView, type InputMember, type OrderInput } from '../ui/input.js';
import type { SideData } from '../ui/data.js';
import type { ActorSnapshot } from './canvas.js';

//패널이 부르는 쪽. 누른 것을 앱이 받아 입력 상태에 넣는다
export interface CommandHandlers {
  ally(id: string): void;
  target(id: string): void;
  card(skillId: number): void;
  go(): void;
}

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
  private readonly goButton: HTMLButtonElement;

  //패널 요소를 id 로 잡는다. 버튼 이벤트는 여기서 한 번만 건다
  constructor(
    private readonly catalog: BattleCatalog,
    private readonly side: SideData,
    private readonly handlers: CommandHandlers,
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
    this.goButton.addEventListener('click', () => handlers.go());
  }

  //입력 단계가 아닐 때. 버튼을 흐리게 하고 지금 무슨 일인지만 적는다
  idle(text: string): void {
    this.root.classList.add('off');
    this.step.textContent = text;
    this.hint.textContent = '';
    this.goButton.disabled = true;
  }

  //입력 상태를 버튼으로 다시 그린다. 누를 때마다 부른다
  show(input: OrderInput, allies: readonly (PanelMember & InputMember)[], enemies: readonly PanelMember[]): void {
    this.root.classList.remove('off');
    const current = allies.find((a) => a.id === input.selectedAlly) ?? null;
    const target = enemies.find((e) => e.id === input.selectedTarget) ?? null;

    //지금 할 일 한 줄. 순서는 아군 → 대상 → 카드 (§10.1)
    if (input.ready && !current) {
      this.step.textContent = '준비 완료 — 합 진행';
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
    } else {
      this.step.textContent = `③ ${current.name} → ${target.name} — 카드를 고른다`;
      this.hint.textContent = input.wouldClash(target.id) ? '합이 벌어진다' : '일방 공격이다 (서로 겨루지 않는다)';
    }

    this.allies.replaceChildren(
      ...allies.map((ally) => {
        const order = input.orderOf(ally.id);
        const button = this.pick(ally.name, this.side.ally, ally.id === input.selectedAlly);
        const note = order
          ? `${enemies.find((e) => e.id === order.targetId)?.name ?? '?'} · ${this.catalog.skill(order.skillId).slot}`
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
      ...(current ? current.deck : []).map((skillId, i) => {
        const view = cardView(this.catalog, skillId, current?.maxCoin ?? 0);
        const button = el('button', view.slot === 'ULT' ? 'card ult' : 'card');
        button.type = 'button';
        const top = el('div', 'top');
        top.append(el('span', 'slot', `${i + 1}. ${view.name}`), el('span', 'attr', view.attribute ?? '궁극기'));
        const dmg = el('div', 'dmg', `${view.minDamage}~${view.maxDamage}`);
        dmg.append(el('small', '', ' 위력'));
        button.append(top, dmg, el('p', '', view.text));
        button.disabled = !target;
        button.addEventListener('click', () => this.handlers.card(skillId));
        return button;
      }),
    );

    this.goButton.disabled = !input.ready;
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
