//머리 위 카드 한 장 (SPEC-005 §11). 세로축으로 돌다가 나온 면으로 멈춘다
//UI 묶음 U15 판이 있으면 앞면 = 앞 판 + 그림 창 안 문양·앞 위력, 뒷면 = 뒤 판 + 가운데 뒤 위력 (SPEC-004 §13.5)
//판이 없으면 임시 도형: 앞면은 밝은 바탕 + 마름모 문양 + 앞 위력, 뒷면은 같은 모양을 회색으로

import * as THREE from 'three';
import type { CardFace } from '../domain/types.js';

//카드에 적을 것
export interface CardFaceInfo {
  name: string;
  slot: string;
  frontPower: number;
  backPower: number;
  //진영 색. 테두리와 문양에 쓴다
  tint: string;
}

//U15 판 그림. 앞·뒤 한 장씩
export interface CardPlates {
  front: HTMLImageElement;
  back: HTMLImageElement;
}

//U15 앞면 그림 창 [22,53,212,222] (assets/ui/kit/manifest.json)
const ART = { x: 22, y: 53, w: 212, h: 222 } as const;

//판 위에 한 면을 그린다. 앞면은 그림 창 안에 문양·앞 위력, 아래 줄에 이름. 뒷면은 뒤 판 가운데에 뒤 위력
function drawPlated(info: CardFaceInfo, plates: CardPlates, back: boolean): HTMLCanvasElement {
  const w = 256;
  const h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const bone = '#e8e1cf';
  if (back) {
    ctx.drawImage(plates.back, 0, 0, w, h);
    //뒤 위력은 가운데 마름모 위에 어두운 원을 깔고 크게
    ctx.fillStyle = 'rgba(11, 13, 14, 0.9)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7c817d';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = bone;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.fillText(String(info.backPower), w / 2, h / 2 + 4);
    return canvas;
  }
  //그림 창은 판보다 먼저 칠한다 (창 안은 투명)
  ctx.fillStyle = '#191c1d';
  ctx.fillRect(ART.x, ART.y, ART.w, ART.h);
  ctx.save();
  ctx.translate(ART.x + ART.w / 2, ART.y + ART.h * 0.36);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = info.tint;
  ctx.fillRect(-38, -38, 76, 76);
  ctx.strokeStyle = bone;
  ctx.lineWidth = 4;
  ctx.strokeRect(-38, -38, 76, 76);
  ctx.restore();
  ctx.fillStyle = bone;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.fillText(String(info.frontPower), w / 2, ART.y + ART.h * 0.78);
  ctx.drawImage(plates.front, 0, 0, w, h);
  //위 띠에 슬롯, 아래 줄 사이에 이름
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(info.slot, 26, 27);
  ctx.textAlign = 'right';
  ctx.fillText('앞', w - 26, 27);
  ctx.textAlign = 'center';
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillText(info.name, w / 2, 312, w - 48);
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
