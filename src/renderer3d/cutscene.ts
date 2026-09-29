//궁극기 컷신 화면 (SPEC-005 §10.2). 무대 위에 화면 전체를 덮는 2D 캔버스 한 장
//배경(캐릭터 고유 전장 합성) 위에 확대 전경을 얹고 천천히 다가간다. 끝 무렵 화면을 가르는 선 하나를 긋는다
//시간은 실제 시간이다

import type { UltimateCutscene } from '../render/ultimate.js';

//재생 중인 컷신 한 번
interface Showing {
  start: number;
  seconds: number;
  //시작부터 선을 긋기 시작하는 시각(초)
  lineAt: number;
  background: CanvasImageSource | null;
  foreground: HTMLImageElement | null;
  line: HTMLImageElement | null;
  spec: UltimateCutscene;
}

export class CutsceneOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private showing: Showing | null = null;

  //무대를 담은 요소 위에 캔버스를 깐다. 입력은 막지 않는다
  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cutscene';
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none', zIndex: '5' });
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  //컷신을 연다. seconds 동안 보이고, lineAt 초에 선을 긋는다
  play(spec: UltimateCutscene, images: { background: CanvasImageSource | null; foreground: HTMLImageElement | null; line: HTMLImageElement | null }, now: number, seconds: number, lineAt: number): void {
    this.showing = { start: now, seconds, lineAt, spec, ...images };
    this.canvas.style.display = 'block';
  }

  //컷신을 닫는다 (재시작)
  clear(): void {
    this.showing = null;
    this.canvas.style.display = 'none';
  }

  //매 프레임 그린다. 시간이 다 되면 닫는다
  update(now: number): void {
    const s = this.showing;
    const ctx = this.ctx;
    if (!s || !ctx) return;
    const t = now - s.start;
    if (t >= s.seconds) {
      this.clear();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const spec = s.spec;
    //화면을 덮는 크기. 컷신 원화 비율을 지키며 넘치게 채운다
    const cover = Math.max(w / spec.size.width, h / spec.size.height);
    const k = Math.min(1, t / s.seconds);
    const zoom = spec.zoomFrom + (spec.zoomTo - spec.zoomFrom) * k;
    const fadeIn = Math.min(1, t / Math.max(1e-3, spec.fade));
    const fadeOut = Math.min(1, (s.seconds - t) / Math.max(1e-3, spec.fade));
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(0, 0, w, h);
    const draw = (image: CanvasImageSource | null, scale: number) => {
      if (!image) return;
      const dw = spec.size.width * cover * scale;
      const dh = spec.size.height * cover * scale;
      ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };
    //배경은 덜 다가가서 전경과 깊이 차가 난다
    draw(s.background, 1 + (zoom - 1) * 0.4);
    draw(s.foreground, zoom);
    //화면을 가르는 선. 왼쪽에서 오른쪽으로 긋고 그대로 남는다
    const lineT = t - s.lineAt;
    if (s.line && lineT >= 0) {
      const reveal = Math.min(1, lineT / Math.max(1e-3, spec.lineWipe));
      const lh = Math.max(2, s.line.naturalHeight * cover);
      const y = h * spec.lineY - lh / 2;
      ctx.drawImage(s.line, 0, 0, s.line.naturalWidth * reveal, s.line.naturalHeight, 0, y, w * reveal, lh);
      //그어지는 순간 화면이 한 번 번쩍인다
      if (lineT < spec.lineWipe * 2) {
        ctx.globalAlpha *= 0.35 * (1 - lineT / (spec.lineWipe * 2));
        ctx.fillStyle = '#dfe8ff';
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.restore();
  }
}
