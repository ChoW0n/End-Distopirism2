//전 스킬 공간형 효과 한 묶음 (SPEC-005 §15.4). 효과 분리 장을 격자 메시에 얹고 장마다 그림과 곡면을 바꾼다
//평면 비교용은 깊이 0 인 면(월드 위로 선 판)을 쓰고 깊이 시험을 끈다 (게임처럼 늘 위에 그린다)

import * as THREE from 'three';
import { surfaceGrid, trackFrameAt, type SpaceFxConfig, type SpaceFxTrack } from '../render/space-fx.js';

//캔버스 PNG 의 crop 칸만 잘라 텍스처로 만든다. 긴 변은 maxSide 로 줄인다
//올린 그림이 줄어 있을 수 있어(공유본은 절반) 실제 그림 크기 비율로 맞춘다
export function cropTexture(image: HTMLImageElement, track: SpaceFxTrack, maxSide: number): THREE.Texture {
  const r = image.naturalWidth > 0 ? image.naturalWidth / track.canvas[0] : 1;
  const [x0, y0, x1, y1] = track.crop;
  const w = Math.max(1, (x1 - x0) * r);
  const h = Math.max(1, (y1 - y0) * r);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(image, x0 * r, y0 * r, w, h, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class SpaceFxTrackMesh {
  //기준점에 놓이는 뿌리. 그 밑에 좌우만 게임 카메라 쪽으로 돈 틀, 그 밑에 H 배율 메시
  readonly root = new THREE.Group();
  private readonly oriented = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  //곡면 이름 → 격자
  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  //textures 는 장마다 하나 (빈 장은 null). flat 이면 깊이 0 면·깊이 시험 끔
  constructor(
    config: SpaceFxConfig,
    private readonly track: SpaceFxTrack,
    private readonly textures: readonly (THREE.Texture | null)[],
    hPerPx: number,
    pitchDeg: number,
    H: number,
    private readonly flat: boolean,
    //기준점이 발에서 떨어진 정도(H). 결행 베기는 적 몸통 높이
    base: readonly [number, number] = [0, 0],
  ) {
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: !flat,
      side: THREE.DoubleSide,
      fog: false,
    });
    const names = flat ? ['flat'] : [...new Set(track.frames.map((f) => f.surface))];
    for (const name of names) {
      const surface = config.surfaces[name];
      if (!surface) continue;
      const g = surfaceGrid(track, surface, hPerPx, pitchDeg, config.groundLift, config.grid, base);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
      geometry.setIndex(g.indices);
      this.geometries.set(name, geometry);
    }
    this.mesh = new THREE.Mesh(this.geometries.values().next().value ?? new THREE.BufferGeometry(), this.material);
    this.mesh.scale.setScalar(H);
    this.mesh.renderOrder = flat ? 30 : 20;
    this.mesh.frustumCulled = false;
    this.oriented.add(this.mesh);
    this.root.add(this.oriented);
    this.root.visible = false;
  }

  //좌우만 게임 카메라 방향으로 돌린다 (월드 위는 그대로)
  orient(q: THREE.Quaternion): void {
    this.oriented.rotation.set(0, new THREE.Euler().setFromQuaternion(q, 'YXZ').y, 0);
  }

  //스킬 시작 기준 시각(ms)에 보일 장을 고른다. 그림이 없으면 숨긴다
  setTime(tMs: number): void {
    const i = trackFrameAt(this.track, tMs);
    const texture = i >= 0 ? this.textures[i] : null;
    if (!texture) {
      this.root.visible = false;
      return;
    }
    const frame = this.track.frames[i];
    const geometry = this.geometries.get(this.flat ? 'flat' : (frame?.surface ?? '')) ?? null;
    if (!geometry) {
      this.root.visible = false;
      return;
    }
    this.mesh.geometry = geometry;
    if (this.material.map !== texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }
    this.root.visible = true;
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    this.material.dispose();
  }
}
