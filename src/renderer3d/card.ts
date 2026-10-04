//머리 위 카드 한 장 (SPEC-005 §11). 세로축으로 돌다가 나온 면으로 멈춘다
//판이 있으면 v4 배치 (SPEC-004 §14.8): 제목 줄에 표시 이름과 앞/뒤 라벨, 아래 수치 자리에 그 면의 위력만 크게.
//범용 U15 판이면 그림 창에 흔적 기호(결행은 마름모). 카일 완성 카드 K 는 그림이 이미 들어 있어 더 얹지 않는다
//판이 없으면 임시 도형: 앞면은 밝은 바탕 + 마름모 문양 + 앞 위력, 뒷면은 같은 모양을 회색으로

import * as THREE from 'three';
import type { CardFace } from '../domain/types.js';

//카드에 적을 것
export interface CardFaceInfo {
  name: string;
  slot: string;
  frontPower: number;
  backPower: number;
  //진영 색. 임시 도형 테두리와 문양에 쓴다
  tint: string;
  //그림 창에 얹을 흔적 기호 (R_*). 없으면 마름모
  glyph?: HTMLImageElement | null;
}

//판 그림. 앞·뒤 한 장씩. complete 면 동작 표식까지 들어간 완성 카드(K)
export interface CardPlates {
  front: HTMLImageElement;
  back: HTMLImageElement;
  complete?: boolean;
}

//v4 세로 카드 자리 (assets/ui/kit/manifest.json U15·K overhead)
const TITLE = { x: 37, y: 18, w: 182, h: 30 } as const;
const ART = { x: 26, y: 55, w: 204, h: 222 } as const;
const SAFE = { x: 27, y: 296, w: 202, h: 47 } as const;
//글 색 (§14.2)
const TEXT = '#fff1d7';
const MUTED = '#b7b6b6';
const GOLD = '#d9b77c';

//흰 실루엣 기호를 색으로 물들여 가운데에 contain 으로 놓는다
function drawGlyph(ctx: CanvasRenderingContext2D, glyph: HTMLImageElement, color: string, cx: number, cy: number, size: number): void {
  const layer = document.createElement('canvas');
  layer.width = size;
  layer.height = size;
  const g = layer.getContext('2d');
  if (!g) return;
  const ratio = Math.min(size / Math.max(1, glyph.naturalWidth), size / Math.max(1, glyph.naturalHeight));
  const w = glyph.naturalWidth * ratio;
  const h = glyph.naturalHeight * ratio;
  g.drawImage(glyph, (size - w) / 2, (size - h) / 2, w, h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  ctx.drawImage(layer, cx - size / 2, cy - size / 2);
}

//판 위에 한 면을 그린다. 제목 · 앞/뒤 라벨 · 그 면의 위력. 범용 판이면 그림 창에 흔적 기호
function drawPlated(info: CardFaceInfo, plates: CardPlates, back: boolean): HTMLCanvasElement {
  const w = 256;
  const h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(back ? plates.back : plates.front, 0, 0, w, h);
  if (!plates.complete) {
    const cx = ART.x + ART.w / 2;
    const cy = ART.y + ART.h / 2;
    const color = back ? MUTED : GOLD;
    if (info.glyph) drawGlyph(ctx, info.glyph, color, cx, cy, 120);
    else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(-40, -40, 80, 80);
      ctx.restore();
    }
  }
  ctx.textBaseline = 'middle';
  //제목 줄: 가운데 이름, 오른쪽 끝 앞/뒤
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(info.name, TITLE.x + TITLE.w / 2, TITLE.y + TITLE.h / 2 + 1, TITLE.w - 64);
  ctx.textAlign = 'right';
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = back ? MUTED : GOLD;
  ctx.fillText(back ? '뒤' : '앞', TITLE.x + TITLE.w, TITLE.y + TITLE.h / 2 + 1);
  //수치 자리: 그 면의 위력만
  ctx.textAlign = 'center';
  ctx.fillStyle = back ? MUTED : TEXT;
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.fillText(String(back ? info.backPower : info.frontPower), SAFE.x + SAFE.w / 2, SAFE.y + SAFE.h / 2 + 2);
  return canvas;
}

//카드 그림 한 면을 캔버스에 그린다. 회색이면 같은 배치를 무채색으로
function drawFace(info: CardFaceInfo, gray: boolean): HTMLCanvasElement {
  const w = 256;
  const h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const paper = gray ? '#6b6864' : '#e9dcbc';
  const ink = gray ? '#d6d1c9' : '#2a1d0c';
  const edge = gray ? '#3b3936' : info.tint;
  const emblem = gray ? '#8d8984' : info.tint;
  //바탕과 테두리
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = paper;
  ctx.fillRect(12, 12, w - 24, h - 24);
  //슬롯 줄
  ctx.fillStyle = ink;
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(info.slot, 26, 24);
  ctx.textAlign = 'right';
  ctx.fillText(gray ? '뒤' : '앞', w - 26, 24);
  //가운데 마름모 문양 (그림 자리)
  ctx.save();
  ctx.translate(w / 2, h * 0.42);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = emblem;
  ctx.fillRect(-46, -46, 92, 92);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(-46, -46, 92, 92);
  ctx.restore();
  //위력
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 88px system-ui, sans-serif';
  ctx.fillText(String(gray ? info.backPower : info.frontPower), w / 2, h * 0.74);
  //이름
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillText(info.name, w / 2, h - 34, w - 40);
  return canvas;
}

//캔버스를 판 재질로
function faceMaterial(canvas: HTMLCanvasElement): THREE.MeshBasicMaterial {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false });
}

export class FlipCard {
  //자리·카메라 향함을 맡는 뿌리
  readonly root = new THREE.Group();
  //세로축 회전·튐 배율을 맡는 안쪽
  private readonly inner = new THREE.Group();
  private readonly front: THREE.Mesh;
  private readonly back: THREE.Mesh;
  private readonly materials: THREE.MeshBasicMaterial[];
  //트윈 손잡이. 돌기(라디안)·배율·투명도·어둡기(0~1)
  readonly state = { spin: 0, scale: 0, opacity: 1, dim: 0 };

  //카드 크기(월드 높이)와 그릴 정보를 받는다. plates 가 있으면 U15 판 위에 그린다
  constructor(info: CardFaceInfo, height: number, plates: CardPlates | null = null) {
    const width = height * (256 / 360);
    const geometry = new THREE.PlaneGeometry(width, height);
    const frontMaterial = faceMaterial(plates ? drawPlated(info, plates, false) : drawFace(info, false));
    const backMaterial = faceMaterial(plates ? drawPlated(info, plates, true) : drawFace(info, true));
    this.materials = [frontMaterial, backMaterial];
    this.front = new THREE.Mesh(geometry, frontMaterial);
    this.back = new THREE.Mesh(geometry, backMaterial);
    //뒷면은 반 바퀴 돌려 붙인다. 돌리면 앞·뒤가 번갈아 보인다
    this.back.rotation.y = Math.PI;
    for (const mesh of [this.front, this.back]) {
      mesh.renderOrder = 60;
      this.inner.add(mesh);
    }
    this.root.add(this.inner);
    this.root.visible = false;
  }

  //나온 면으로 멈출 때의 회전값. 바퀴 수만큼 돈 뒤 앞이면 0, 뒤면 반 바퀴
  static restAngle(face: CardFace, turns: number): number {
    return turns * Math.PI * 2 + (face === 'back' ? Math.PI : 0);
  }

  //머리 위 자리와 카메라 회전을 받아 매 프레임 맞춘다 (SPEC-005 §8.9 처럼 판은 카메라를 본다)
  update(at: THREE.Vector3, camera: THREE.Camera): void {
    this.root.visible = this.state.scale > 0.001 && this.state.opacity > 0.001;
    this.root.position.copy(at);
    this.root.quaternion.copy(camera.quaternion);
    this.inner.rotation.set(0, this.state.spin, 0);
    this.inner.scale.setScalar(this.state.scale);
    const shade = 1 - 0.55 * this.state.dim;
    for (const m of this.materials) {
      m.opacity = this.state.opacity;
      m.color.setScalar(shade);
    }
  }

  //공개 순간 커지는 크기를 미리 확보한다. 회전 중 깊이가 생긴 실제 모서리도 함께 지킨다
  frameCorners(camera: THREE.Camera, revealScale: number): THREE.Vector3[] {
    this.front.updateWorldMatrix(true, false);
    const positions = this.front.geometry.getAttribute('position');
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      points.push(p.clone().applyMatrix4(this.front.matrixWorld));
      points.push(p.multiplyScalar(revealScale).applyQuaternion(camera.quaternion).add(this.root.position));
    }
    return points;
  }

  //장면에서 빼고 텍스처를 푼다
  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.materials) {
      m.map?.dispose();
      m.dispose();
    }
    this.front.geometry.dispose();
  }
}
