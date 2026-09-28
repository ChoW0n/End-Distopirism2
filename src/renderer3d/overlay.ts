//무대 위 DOM 겹층 (SPEC-005 §9.6·§8.10). 이름표·결과 알림·피해 숫자
//3D 좌표를 화면 비율로 바꾸는 건 무대가 하고, 여기는 받은 자리에 글을 놓기만 한다

import type { Side } from '../domain/types.js';

//화면 비율 좌표 (0~1, 좌상단 원점). 카메라 뒤면 null
export type ScreenPoint = { x: number; y: number } | null;

interface Tag {
  el: HTMLElement;
  name: HTMLElement;
  note: HTMLElement;
}

interface Callout {
  el: HTMLElement;
  combatantId: string;
  until: number;
}

//입력 단계에서 고른 사람 (SPEC-004 §10)
export interface Selection3d {
  ally: string | null;
  target: string | null;
  pickable: readonly string[];
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export class Overlay {
  private readonly root: HTMLElement;
  private readonly tags = new Map<string, Tag>();
  private callouts: Callout[] = [];
  private selection: Selection3d = { ally: null, target: null, pickable: [] };

  constructor(host: HTMLElement) {
    this.root = el('div', 'overlay3d');
    host.append(this.root);
  }

  //사람마다 이름표를 만든다
  setActors(actors: readonly { combatantId: string; name: string; side: Side }[]): void {
    for (const tag of this.tags.values()) tag.el.remove();
    this.tags.clear();
    for (const actor of actors) {
      const box = el('div', `tag3d ${actor.side}`);
      const name = el('b', '', actor.name);
      const note = el('small', '');
      box.append(name, note);
      this.root.append(box);
      this.tags.set(actor.combatantId, { el: box, name, note });
    }
  }

  setSelection(selection: Selection3d): void {
    this.selection = selection;
  }

  //이름표 아래 한 줄. 적이 노리는 대상 같은 것을 적는다. 빈 문자열이면 지운다
  setNote(combatantId: string, text: string): void {
    const tag = this.tags.get(combatantId);
    if (tag) tag.note.textContent = text;
  }

  //결과 알림을 띄운다. 실제 시간으로 흐른다
  callout(combatantId: string, success: boolean, title: string, reason: string, realNow: number, seconds: number): void {
    const box = el('div', success ? 'callout3d' : 'callout3d lose');
    box.append(el('b', '', title));
    if (reason) box.append(el('small', '', reason));
    box.style.animationDuration = `${seconds}s`;
    this.root.append(box);
    this.callouts.push({ el: box, combatantId, until: realNow + seconds });
  }

  //피해 숫자. 뜬 자리에 머물다 사라진다
  number(at: ScreenPoint, text: string, kind: '' | 'heavy' | 'tag'): void {
    if (!at) return;
    const box = el('div', `num3d ${kind}`, text);
    box.style.left = `${at.x * 100}%`;
    box.style.top = `${at.y * 100}%`;
    this.root.append(box);
    window.setTimeout(() => box.remove(), 1300);
  }

  //매 프레임 이름표·알림 자리를 옮긴다. head 는 사람 머리 위 화면 좌표
  update(head: (combatantId: string) => ScreenPoint, down: (combatantId: string) => boolean, realNow: number, calloutOffsetY: number): void {
    for (const [id, tag] of this.tags) {
      const p = head(id);
      tag.el.hidden = !p;
      if (!p) continue;
      tag.el.style.left = `${p.x * 100}%`;
      tag.el.style.top = `${p.y * 100}%`;
      const s = this.selection;
      tag.el.classList.toggle('down', down(id));
      tag.el.classList.toggle('pickable', s.pickable.includes(id));
      tag.el.classList.toggle('picked', s.ally === id || s.target === id);
    }
    for (const c of [...this.callouts]) {
      if (realNow >= c.until) {
        c.el.remove();
        this.callouts.splice(this.callouts.indexOf(c), 1);
        continue;
      }
      const p = head(c.combatantId);
      if (!p) continue;
      c.el.style.left = `${p.x * 100}%`;
      c.el.style.top = `${(p.y - calloutOffsetY) * 100}%`;
    }
  }

  clear(): void {
    for (const c of this.callouts) c.el.remove();
    this.callouts = [];
    for (const n of this.root.querySelectorAll('.num3d')) n.remove();
  }
}
