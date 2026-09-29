//머리 위 카드 한 장 (SPEC-005 §11). 세로축으로 돌다가 나온 면으로 멈춘다
//지금은 임시 도형이다: 앞면은 밝은 바탕 + 마름모 문양 + 앞 위력, 뒷면은 같은 모양을 회색으로 (회색 필터 자리)
//나중에 카드 디자인이 오면 앞면 = 스킬 그림, 뒷면 = 같은 그림에 회색 필터로 바꾼다

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

  //카드 크기(월드 높이)와 그릴 정보를 받는다
  constructor(info: CardFaceInfo, height: number) {
    const width = height * (256 / 360);
    const geometry = new THREE.PlaneGeometry(width, height);
    const frontMaterial = faceMaterial(drawFace(info, false));
    const backMaterial = faceMaterial(drawFace(info, true));
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
