//무대 위 DOM 겹층 (SPEC-005 §9.6·§8.10). 이름표·결과 알림·피해 숫자
//3D 좌표를 화면 비율로 바꾸는 건 무대가 하고, 여기는 받은 자리에 글을 놓기만 한다

import type { Side } from '../domain/types.js';
import type { FootBarConfig } from './config.js';

//화면 비율 좌표 (0~1, 좌상단 원점). 카메라 뒤면 null
export type ScreenPoint = { x: number; y: number } | null;

interface Tag {
  el: HTMLElement;
  name: HTMLElement;
  note: HTMLElement;
  //발밑 체력·정신력 바 (SPEC-004 §2.2.1)
  foot: HTMLElement;
  hp: HTMLElement;
  hpText: HTMLElement;
  mt: HTMLElement;
  mtText: HTMLElement;
  //궁극기 칸 (SPEC-004 §2.2.1). 속성 합만큼 찬다
  ult: HTMLElement;
}

//궁극기 칸에 적을 값. 칸 수는 문턱값, ready 면 전부 빛난다
export interface UltimateGauge {
  filled: number;
  total: number;
  ready: boolean;
}

//발밑 바에 적을 값
export interface FootValues {
  hp: number;
  maxHp: number;
  mentality: number;
  maxMentality: number;
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
  //UI 기준 단위 1 이 몇 px 인지 (SPEC-004 §13.1). 발밑 바 크기가 이 단위다
  private unit = 1;
  //이름표를 눌렀을 때 (입력 단계에 고를 수 있는 사람만)
  onPick: ((combatantId: string) => void) | null = null;

  //bar: 발밑 바 수치 (stage3d.json footBar)
  constructor(
    host: HTMLElement,
    private readonly bar: FootBarConfig,
  ) {
    this.root = el('div', 'overlay3d');
    host.append(this.root);
  }

  //발밑 바 한 줄. 채움과 숫자
  private barRow(height: number, className: string): { row: HTMLElement; fill: HTMLElement; text: HTMLElement } {
    const row = el('div', `foot3d-row ${className}`);
    const track = el('div', 'foot3d-track');
    track.style.height = `calc(var(--u, 1) * ${height}px)`;
    const fill = el('i', '');
    fill.style.transitionDuration = `${this.bar.tween}s`;
    track.append(fill);
    const text = el('span', '');
    row.append(track, text);
    return { row, fill, text };
  }

  //사람마다 이름표를 만든다
  setActors(actors: readonly { combatantId: string; name: string; side: Side }[]): void {
    for (const tag of this.tags.values()) {
      tag.el.remove();
      tag.foot.remove();
    }
    this.tags.clear();
    for (const actor of actors) {
      const box = el('div', `tag3d ${actor.side}`);
      box.addEventListener('click', () => {
        if (this.selection.pickable.includes(actor.combatantId)) this.onPick?.(actor.combatantId);
      });
      const name = el('b', '', actor.name);
      const note = el('small', '');
      box.append(name, note);
      const foot = el('div', `foot3d ${actor.side}`);
      foot.style.gap = `calc(var(--u, 1) * ${this.bar.gap}px)`;
      foot.style.transitionDuration = `${this.bar.downFade}s`;
      const hp = this.barRow(this.bar.hpHeight, 'hp');
      const mt = this.barRow(this.bar.mtHeight, 'mt');
      const ult = el('div', 'foot3d-ult');
      ult.hidden = true;
      foot.append(hp.row, mt.row, ult);
      this.root.append(box, foot);
      this.tags.set(actor.combatantId, { el: box, name, note, foot, hp: hp.fill, hpText: hp.text, mt: mt.fill, mtText: mt.text, ult });
    }
  }

  setSelection(selection: Selection3d): void {
    this.selection = selection;
  }

  //UI 기준 단위 크기를 바꾼다 (창 크기가 바뀔 때)
  setUnit(unit: number): void {
    this.unit = unit > 0 ? unit : 1;
  }

  //궁극기 칸을 채운다. null 이면 숨긴다
  setGauge(combatantId: string, gauge: UltimateGauge | null): void {
    const tag = this.tags.get(combatantId);
    if (!tag) return;
    tag.ult.hidden = !gauge || gauge.total <= 0;
    if (!gauge || gauge.total <= 0) return;
    //칸 수가 바뀌면 다시 만든다
    if (tag.ult.children.length !== gauge.total) tag.ult.replaceChildren(...Array.from({ length: gauge.total }, () => el('i', '')));
    Array.from(tag.ult.children).forEach((pip, i) => pip.classList.toggle('on', gauge.ready || i < gauge.filled));
    tag.ult.classList.toggle('ready', gauge.ready);
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

  //매 프레임 이름표·알림·발밑 바 자리를 옮긴다. head 는 사람 머리 위, foot 은 발 화면 좌표
  update(
    head: (combatantId: string) => ScreenPoint,
    down: (combatantId: string) => boolean,
    realNow: number,
    calloutOffsetY: number,
    foot: (combatantId: string) => ScreenPoint = () => null,
    values: (combatantId: string) => FootValues | null = () => null,
  ): void {
    const height = this.root.clientHeight || 1;
    for (const [id, tag] of this.tags) {
      const f = foot(id);
      const h = head(id);
      const v = values(id);
      tag.foot.hidden = !f || !v;
      if (!f || !v) continue;
      //폭은 캐릭터 화면 키에 비례한다. 멀리 있으면 작아진다
      const tall = h ? Math.abs(f.y - h.y) * height : 0;
      tag.foot.style.width = `${Math.max(this.bar.minWidth * this.unit, tall * this.bar.widthRatio)}px`;
      tag.foot.style.left = `${f.x * 100}%`;
      tag.foot.style.top = `${f.y * 100}%`;
      const hpRatio = v.maxHp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxHp)) : 0;
      tag.hp.style.width = `${hpRatio * 100}%`;
      //원작처럼 체력 비율로 빨강 ↔ 초록
      tag.hp.style.background = `rgb(${Math.round(210 * (1 - hpRatio) + 60 * hpRatio)}, ${Math.round(40 * (1 - hpRatio) + 190 * hpRatio)}, 50)`;
      tag.hpText.textContent = `${v.hp}/${v.maxHp}`;
      tag.mt.style.width = `${v.maxMentality > 0 ? Math.max(0, Math.min(1, v.mentality / v.maxMentality)) * 100 : 0}%`;
      tag.mtText.textContent = String(v.mentality);
      tag.foot.classList.toggle('down', down(id));
    }
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
