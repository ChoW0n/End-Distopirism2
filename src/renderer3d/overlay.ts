//무대 위 DOM 겹층 (SPEC-005 §9.6·§8.10). 이름표·결과 알림·피해 숫자
//3D 좌표를 화면 비율로 바꾸는 건 무대가 하고, 여기는 받은 자리에 글을 놓기만 한다

import { clampRatio, extendEnds, GaugePath, pathData, pipStates, type GaugeLayout, type UltimateStage } from '../render/arc-gauge.js';
import type { Side, StatusId } from '../domain/types.js';
import type { FootGaugeConfig } from './config.js';

//화면 비율 좌표 (0~1, 좌상단 원점). 카메라 뒤면 null
export type ScreenPoint = { x: number; y: number } | null;

const SVG = 'http://www.w3.org/2000/svg';

//발밑 반원 게이지 한 사람 몫 (SPEC-004 §14.3)
interface Gauge {
  el: HTMLElement;
  svg: SVGSVGElement;
  //채움·감소 잔상 가림판 경로
  hpMask: SVGPathElement;
  spMask: SVGPathElement;
  hpLossMask: SVGPathElement;
  spLossMask: SVGPathElement;
  hpLoss: SVGElement;
  spLoss: SVGElement;
  //결행 칸 묶음
  pips: SVGGElement;
  selection: SVGElement | null;
  critical: SVGElement | null;
  num: HTMLElement;
  //지난 비율. 줄면 잔상을 낸다
  hpRatio: number | null;
  spRatio: number | null;
  lossUntil: number;
}

interface Tag {
  el: HTMLElement;
  name: HTMLElement;
  note: HTMLElement;
  gauge: Gauge;
  //이름표 오른쪽 상태 아이콘 (SPEC-004 §13.5 U10)
  status: HTMLElement;
  //이름표 위 행동력 칸과 예약 줄 (SPEC-001 v4.0 §6)
  plan: HTMLElement;
}

//이름표 위에 보일 예약 사정. 칸 이름은 턴 순서대로
export interface PlanMark {
  actionPoints: number;
  max: number;
  floor: number;
  steps: readonly { name: string; slot: string }[];
  //예약도 행동력도 없어 이번 턴 행동이 없다
  idle: boolean;
}

//이름표 옆에 띄울 상태 하나. 남은 턴을 숫자로
export interface StatusMark {
  id: StatusId;
  turns: number;
}

//합 결과 알림 중 판 그림(U14)으로 보이는 것. 나머지는 글 판 그대로 (SPEC-004 §13.5)
const RESULT_PLATES: Record<string, string> = { '합 승리': 'win', '합 패배': 'lose', 교착: 'draw' };

//결행 칸에 적을 값 (SPEC-004 §14.4). charge 는 흔적 합, total 은 문턱, stage 는 도메인이 정한 단계
export interface UltimateGauge {
  charge: number;
  total: number;
  stage: UltimateStage;
}

//발밑 게이지에 적을 값
export interface FootValues {
  hp: number;
  maxHp: number;
  mentality: number;
  maxMentality: number;
}

//게이지 그림 (assets/ui/kit 의 G_*·U12_*). 없으면 같은 경로를 선으로 그린다
export interface GaugeKit {
  base: string | null;
  layout: GaugeLayout;
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

//SVG 요소 하나. 속성을 같이 건다
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

//가림판 경로 굵기 여유. 채움 그림 띠의 가장자리가 잘리지 않게 중심선 굵기보다 넓힌다
const MASK_SLACK = 8;
//게이지마다 가림판 id 를 다르게
let gaugeSerial = 0;

export class Overlay {
  private readonly root: HTMLElement;
  private readonly tags = new Map<string, Tag>();
  private callouts: Callout[] = [];
  private selection: Selection3d = { ally: null, target: null, pickable: [] };
  //UI 기준 단위 1 이 몇 px 인지 (SPEC-004 §13.1). 발밑 게이지 크기가 이 단위다
  private unit = 1;
  //게이지 그림과 경로. 없으면 게이지를 만들지 않는다
  private kit: GaugeKit | null = null;
  private hpPath: GaugePath | null = null;
  private spPath: GaugePath | null = null;
  //움직임 줄이기. 감소 잔상을 내지 않는다 (SPEC-004 §14.3)
  reducedMotion = false;
  //이름표를 눌렀을 때 (입력 단계에 고를 수 있는 사람만)
  onPick: ((combatantId: string) => void) | null = null;

  //gauge: 발밑 게이지 수치 (stage3d.json footGauge)
  constructor(
    host: HTMLElement,
    private readonly gauge: FootGaugeConfig,
  ) {
    this.root = el('div', 'overlay3d');
    host.append(this.root);
  }

  //게이지 그림·경로를 받는다. 다음 setActors 부터 쓴다
  setGaugeKit(kit: GaugeKit | null): void {
    this.kit = kit;
    this.hpPath = kit ? new GaugePath(kit.layout.hp.points) : null;
    this.spPath = kit ? new GaugePath(kit.layout.sp.points) : null;
  }

  //그림 주소. 그림이 없으면 null
  private file(name: string): string | null {
    return this.kit?.base ? `${this.kit.base}/${name}.png` : null;
  }

  //캔버스 크기 그림 한 장 (G_*). 그림이 없으면 null
  private layer(name: string, className = ''): SVGImageElement | null {
    const href = this.file(name);
    if (!href || !this.kit) return null;
    const [w, h] = this.kit.layout.canvas;
    const image = svg('image', { href, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none' });
    if (className) image.setAttribute('class', className);
    return image;
  }

  //발밑 반원 게이지 하나를 만든다. 층 순서는 트랙 → 잔상 → 채움 → 틀 → 결행 칸 → 선택 → 위험 (§14.3)
  private makeGauge(side: Side): Gauge {
    const kit = this.kit as GaugeKit;
    const layout = kit.layout;
    const [w, h] = layout.canvas;
    const box = el('div', `gauge3d ${side}`);
    //기준점이 발에 오게 옮긴다. 그림 비율 그대로
    box.style.transform = `translate(${(-layout.anchor[0] / w) * 100}%, ${(-layout.anchor[1] / h) * 100}%)`;
    box.style.transitionDuration = `${this.gauge.downFade}s`;
    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', overflow: 'visible' });
    root.style.aspectRatio = `${w} / ${h}`;
    const id = `g${++gaugeSerial}`;
    const defs = svg('defs');
    const mask = (name: string, width: number): SVGPathElement => {
      const m = svg('mask', { id: `${id}-${name}`, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: w + 40, height: h + 40 });
      const path = svg('path', { fill: 'none', stroke: '#fff', 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' });
      m.append(path);
      defs.append(m);
      return path;
    };
    const hpMask = mask('hp', layout.hp.width + MASK_SLACK);
    const spMask = mask('sp', layout.sp.width + MASK_SLACK);
    const hpLossMask = mask('hpl', layout.hp.width + MASK_SLACK);
    const spLossMask = mask('spl', layout.sp.width + MASK_SLACK);
    root.append(defs);
    const full = (path: GaugePath | null): string => pathData(path ? path.prefix(1) : []);
    //그림이 있으면 그림 층, 없으면 같은 중심선을 선으로
    const masked = (name: string, maskName: string, color: string, width: number): SVGElement => {
      const image = this.layer(name);
      const node: SVGElement = image ?? svg('path', { d: full(name.includes('hp') ? this.hpPath : this.spPath), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linejoin': 'round' });
      node.setAttribute('mask', `url(#${id}-${maskName})`);
      return node;
    };
    const track = (name: string, which: 'hp' | 'sp'): SVGElement =>
      this.layer(name) ?? svg('path', { d: full(which === 'hp' ? this.hpPath : this.spPath), fill: 'none', stroke: '#0b111a', 'stroke-opacity': 0.85, 'stroke-width': layout[which].width + 3, 'stroke-linejoin': 'round', class: 'track' });
    root.append(track('G_hp_track', 'hp'), track('G_sp_track', 'sp'));
    const hpLoss = masked('G_hp_loss', 'hpl', layout.hp.color, layout.hp.width);
    const spLoss = masked('G_sp_loss', 'spl', layout.sp.color, layout.sp.width);
    hpLoss.setAttribute('class', 'loss');
    spLoss.setAttribute('class', 'loss');
    root.append(hpLoss, spLoss);
    root.append(masked('G_hp_fill', 'hp', layout.hp.color, layout.hp.width), masked('G_sp_fill', 'sp', layout.sp.color, layout.sp.width));
    const frame = this.layer('G_frame');
    if (frame) root.append(frame);
    const pips = svg('g', { class: 'pips' });
    root.append(pips);
    const selection = this.layer('G_selection', 'sel');
    const critical = this.layer('G_critical', 'crit');
    if (selection) root.append(selection);
    if (critical) root.append(critical);
    const num = el('span', 'gauge-num');
    box.append(root, num);
    return { el: box, svg: root, hpMask, spMask, hpLossMask, spLossMask, hpLoss, spLoss, pips, selection, critical, num, hpRatio: null, spRatio: null, lossUntil: 0 };
  }

  //사람마다 이름표와 발밑 게이지를 만든다
  setActors(actors: readonly { combatantId: string; name: string; side: Side }[]): void {
    for (const tag of this.tags.values()) {
      tag.el.remove();
      tag.gauge.el.remove();
    }
    this.tags.clear();
    for (const actor of actors) {
      const box = el('div', `tag3d ${actor.side}`);
      box.addEventListener('click', () => {
        if (this.selection.pickable.includes(actor.combatantId)) this.onPick?.(actor.combatantId);
      });
      const name = el('b', '', actor.name);
      //이름표 판은 늘이지 않는다(U9 220x52). 이름 자리에 7자 넘게 들어가면 글자를 줄인다 (§14.9)
      name.style.setProperty('--fit', String(Math.max(0.6, Math.min(1, 7 / Math.max(1, [...actor.name].length)))));
      const note = el('small', '');
      const status = el('div', 'status');
      const plan = el('div', 'plan');
      box.append(plan, name, note, status);
      const gauge = this.kit ? this.makeGauge(actor.side) : null;
      if (gauge) this.root.append(gauge.el);
      this.root.append(box);
      //게이지 그림 경로가 없으면 빈 상자로 둔다 (게이지만 빠지고 게임은 돈다)
      this.tags.set(actor.combatantId, { el: box, name, note, gauge: gauge ?? this.emptyGauge(), status, plan });
    }
  }

  //게이지를 못 만들 때 쓰는 빈 자리
  private emptyGauge(): Gauge {
    const box = el('div', 'gauge3d');
    box.hidden = true;
    const p = svg('path');
    const g = svg('g');
    return { el: box, svg: svg('svg'), hpMask: p, spMask: p, hpLossMask: p, spLossMask: p, hpLoss: p, spLoss: p, pips: g, selection: null, critical: null, num: el('span', ''), hpRatio: null, spRatio: null, lossUntil: 0 };
  }

  setSelection(selection: Selection3d): void {
    this.selection = selection;
  }

  //UI 기준 단위 크기를 바꾼다 (창 크기가 바뀔 때)
  setUnit(unit: number): void {
    this.unit = unit > 0 ? unit : 1;
  }

  //결행 칸을 채운다. null 이면 숨긴다 (SPEC-004 §14.4)
  setGauge(combatantId: string, gauge: UltimateGauge | null): void {
    const tag = this.tags.get(combatantId);
    if (!tag || !this.kit) return;
    const positions = this.kit.layout.pip.positions;
    const slots = gauge ? Math.min(gauge.total, positions.length) : 0;
    if (!gauge || slots <= 0) {
      tag.gauge.pips.replaceChildren();
      return;
    }
    const scale = this.kit.layout.pip.scale;
    //U12 그림은 56x14 를 0.5배로
    const pw = 56 * scale;
    const ph = 14 * scale;
    tag.gauge.pips.replaceChildren(
      ...pipStates(gauge.charge, slots, gauge.stage).map((state, i) => {
        const [x, y] = positions[i] as readonly [number, number];
        const href = this.file(`U12_ultimate_${state}`);
        const node = href ? svg('image', { href, x, y, width: pw, height: ph, preserveAspectRatio: 'none' }) : svg('rect', { x, y, width: pw, height: ph });
        node.setAttribute('class', `pip ${state}`);
        return node;
      }),
    );
  }

  //이름표 아래 한 줄. 적이 노리는 대상 같은 것을 적는다. 빈 문자열이면 지운다. clash 면 합 표지(U5 합)
  setNote(combatantId: string, text: string, clash = false): void {
    const tag = this.tags.get(combatantId);
    if (!tag) return;
    tag.note.textContent = text;
    tag.note.classList.toggle('clash', clash && text !== '');
  }

  //이름표 오른쪽 상태 아이콘을 다시 그린다. 빈 목록이면 지운다
  setStatuses(combatantId: string, marks: readonly StatusMark[]): void {
    const tag = this.tags.get(combatantId);
    if (!tag) return;
    tag.status.replaceChildren(
      ...marks.map((m) => {
        const icon = el('i', '');
        icon.dataset['id'] = m.id;
        icon.append(el('span', '', String(m.turns)));
        return icon;
      }),
    );
  }

  //이름표 위 행동력 칸(빚은 붉은 칸)과 남은 예약을 다시 그린다. null 이면 지운다 (SPEC-001 v4.0 §6)
  setPlan(combatantId: string, mark: PlanMark | null): void {
    const tag = this.tags.get(combatantId);
    if (!tag) return;
    if (!mark) {
      tag.plan.replaceChildren();
      return;
    }
    const pips = el('span', 'ap');
    pips.title = `행동력 ${mark.actionPoints} / ${mark.max}`;
    const debt = Math.max(0, -mark.actionPoints);
    for (let i = 0; i < mark.max; i++) pips.append(el('i', i < mark.actionPoints ? 'on' : ''));
    for (let i = 0; i < debt; i++) pips.append(el('i', 'debt'));
    pips.append(el('span', mark.actionPoints < 0 ? 'n neg' : 'n', String(mark.actionPoints)));
    const row = el('span', 'steps');
    if (mark.idle) row.append(el('em', 'idle', '행동 없음'));
    mark.steps.forEach((step, i) => {
      const chip = el('em', `step ${step.slot.toLowerCase()}${i === 0 ? ' now' : ''}`);
      chip.append(el('span', 'k', String(i + 1)), step.name);
      row.append(chip);
    });
    tag.plan.replaceChildren(pips, row);
  }

  //결과 알림을 띄운다. 실제 시간으로 흐른다
  callout(combatantId: string, success: boolean, title: string, reason: string, realNow: number, seconds: number): void {
    const plate = RESULT_PLATES[title];
    const box = el('div', plate ? `callout3d plate ${plate}${success ? '' : ' lose'}` : success ? 'callout3d' : 'callout3d lose');
    box.append(el('b', '', title));
    if (reason) box.append(el('small', '', reason));
    box.style.animationDuration = `${seconds}s`;
    this.root.append(box);
    this.callouts.push({ el: box, combatantId, until: realNow + seconds });
  }

  //피해 숫자. 뜬 자리에 머물다 사라진다
  //last 는 여러 타의 마지막 타(금색 테두리, SPEC-005 §17.2)
  number(at: ScreenPoint, text: string, kind: '' | 'heavy' | 'tag' | 'last'): void {
    if (!at) return;
    const box = el('div', `num3d ${kind}`, text);
    box.style.left = `${at.x * 100}%`;
    box.style.top = `${at.y * 100}%`;
    this.root.append(box);
    window.setTimeout(() => box.remove(), 1300);
  }

  //교전 중에는 이름표 위 예약 줄을 숨긴다. 머리 위 카드 뒤집기와 겹친다 (SPEC-001 v4.0 §6)
  setCombat(on: boolean): void {
    this.root.classList.toggle('combat', on);
  }

  //화면 전체 흰 섬광 한 번 (SPEC-005 §17.2). 흔들림 줄이기면 하지 않는다
  flash(alpha: number, seconds: number): void {
    if (this.reducedMotion) return;
    const box = el('div', 'flash3d');
    box.style.setProperty('--a', String(alpha));
    box.style.animationDuration = `${seconds}s`;
    this.root.append(box);
    window.setTimeout(() => box.remove(), seconds * 1000 + 50);
  }

  //합 위력 충돌 (SPEC-005 §17.2). 두 사람 사이에 왼쪽·오른쪽 위력을 맞부딪혀 보인다. winner 가 null 이면 교착
  powerClash(at: ScreenPoint, left: number, right: number, winner: 'left' | 'right' | null): void {
    if (!at) return;
    const box = el('div', `clash3d${winner ? ` win-${winner}` : ' draw'}${this.reducedMotion ? ' still' : ''}`);
    box.style.left = `${at.x * 100}%`;
    box.style.top = `${at.y * 100}%`;
    box.append(el('b', 'l', String(left)), el('i', '', ':'), el('b', 'r', String(right)));
    this.root.append(box);
    window.setTimeout(() => box.remove(), 900);
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
    const s = this.selection;
    for (const [id, tag] of this.tags) {
      const g = tag.gauge;
      if (!this.kit || !this.hpPath || !this.spPath) break;
      const f = foot(id);
      const h = head(id);
      const v = values(id);
      g.el.hidden = !f || !v;
      if (!f || !v) continue;
      //폭은 캐릭터 화면 키에 비례하고 최소·최대 사이에 가둔다. 그림 비율 그대로 (§14.3)
      const tall = h ? Math.abs(f.y - h.y) * height : 0;
      const width = Math.max(this.gauge.minWidth, Math.min(this.gauge.maxWidth, (tall / this.unit) * this.gauge.widthRatio));
      g.el.style.width = `${width * this.unit}px`;
      g.el.style.left = `${f.x * 100}%`;
      g.el.style.top = `${f.y * 100}%`;
      const isDown = down(id);
      const hpRatio = isDown ? 0 : clampRatio(v.maxHp > 0 ? v.hp / v.maxHp : 0);
      const spRatio = clampRatio(v.maxMentality > 0 ? v.mentality / v.maxMentality : 0);
      //값이 줄면 이전~현재 구간에 잔상. 최종 값은 바로 그린다
      const lost = (path: GaugePath, mask: SVGPathElement, before: number | null, now: number): boolean => {
        if (before === null || now >= before || this.reducedMotion) return false;
        mask.setAttribute('d', pathData(path.segment(now, before)));
        return true;
      };
      const hpLost = lost(this.hpPath, g.hpLossMask, g.hpRatio, hpRatio);
      const spLost = lost(this.spPath, g.spLossMask, g.spRatio, spRatio);
      if (hpLost || spLost) g.lossUntil = realNow + this.gauge.lossSeconds;
      if (hpLost) g.hpLoss.classList.add('on');
      if (spLost) g.spLoss.classList.add('on');
      if (realNow >= g.lossUntil) {
        g.hpLoss.classList.remove('on');
        g.spLoss.classList.remove('on');
      }
      if (g.hpRatio !== hpRatio) g.hpMask.setAttribute('d', pathData(extendEnds(this.hpPath.prefix(hpRatio), MASK_SLACK, true, hpRatio >= 1)));
      if (g.spRatio !== spRatio) g.spMask.setAttribute('d', pathData(extendEnds(this.spPath.prefix(spRatio), MASK_SLACK, true, spRatio >= 1)));
      g.hpRatio = hpRatio;
      g.spRatio = spRatio;
      //고른 사람만 선택 층과 숫자. 겹치면 위로 올린다
      const picked = s.ally === id || s.target === id;
      g.el.classList.toggle('picked', picked);
      g.selection?.classList.toggle('on', picked);
      g.critical?.classList.toggle('on', !isDown && hpRatio > 0 && hpRatio <= this.gauge.criticalRatio);
      g.num.textContent = picked ? `체력 ${Math.max(0, Math.round(v.hp))}/${v.maxHp} · 정신력 ${Math.round(v.mentality)}` : '';
      g.el.classList.toggle('down', isDown);
    }
    for (const [id, tag] of this.tags) {
      const p = head(id);
      tag.el.hidden = !p;
      if (!p) continue;
      tag.el.style.left = `${p.x * 100}%`;
      tag.el.style.top = `${p.y * 100}%`;
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
