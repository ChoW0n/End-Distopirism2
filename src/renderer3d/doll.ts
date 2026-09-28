//무대에 선 종이 인형 한 명 (SPEC-005 §8.3·§8.9·§9.4)
//구조: 루트(자리·바라보는 쪽·카메라 향함) → visual(위치 몸짓) → 장마다 판 하나
//판은 기울지도 찌그러지지도 않는다. 몸짓은 위치 이동과 장 바꾸기로만 한다

import * as THREE from 'three';
import type { FrameData, SpriteCatalog } from '../render/manifest.js';

//인형이 쓰는 장 이름. 매니페스트 프레임에 매핑한다 (§9.4)
export type DollPose = 'idle' | 'dash' | 'guard' | 'hurt' | 'retreat';

//장 하나. 판과 발 기준 높이
interface Plate {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export class PaperDoll {
  readonly root = new THREE.Group();
  readonly visual = new THREE.Group();
  //장 id → 판
  private readonly plates = new Map<string, Plate>();
  private shown: Plate | null = null;
  private shownId = '';
  //바라보는 쪽. 1 = 화면 오른쪽
  facing: 1 | -1 = 1;
  //대기 자리
  readonly home = new THREE.Vector3();
  //판 투명도. 쓰러지면 흐려진다
  private opacity = 1;
  down = false;

  //장 id 들. 카드 슬롯마다 몇 장인지 매니페스트가 정한다
  constructor(
    readonly combatantId: string,
    readonly catalog: SpriteCatalog,
    textures: Map<string, THREE.Texture>,
    //월드 키 / 픽셀 키
    private readonly worldPerPixel: number,
    order: number,
  ) {
    this.root.add(this.visual);
    for (const frame of catalog.manifest.frames) {
      const texture = textures.get(frame.id);
      if (!texture) continue;
      const plate = this.makePlate(frame, texture, order);
      plate.mesh.visible = false;
      this.visual.add(plate.mesh);
      this.plates.set(frame.id, plate);
    }
    this.showFrame(this.poseFrame('idle'));
  }

  //bbox 로 자른 장을 발 기준점이 원점이 되게 놓는다
  private makePlate(frame: FrameData, texture: THREE.Texture, order: number): Plate {
    const [x0, y0, x1, y1] = frame.bbox;
    const s = this.worldPerPixel;
    const geometry = new THREE.PlaneGeometry((x1 - x0) * s, (y1 - y0) * s);
    geometry.translate(((x0 + x1) / 2 - frame.anchor.x) * s, (frame.anchor.y - (y0 + y1) / 2) * s, 0);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.userData['combatantId'] = this.combatantId;
    return { mesh, material };
  }

  //인형 장 → 매니페스트 프레임 id. 없으면 대기 장
  poseFrame(pose: DollPose): string {
    const suffix = { idle: 'idle', dash: 'advance', guard: 'guard', hurt: 'hit', retreat: 'retreat' }[pose];
    return (this.catalog.frameEndingWith(suffix) ?? this.catalog.frameEndingWith('idle') ?? this.catalog.manifest.frames[0])?.id ?? '';
  }

  //카드 슬롯의 장 목록. 선딜레이·충돌·궤적 순이다
  skillFrames(slot: 'S1' | 'S2' | 'S3' | 'ULT'): string[] {
    const seq = this.catalog.frameSequence(slot === 'ULT' ? 'S3' : slot);
    return seq.length > 0 ? seq : [this.poseFrame('idle')];
  }

  setPose(pose: DollPose): void {
    this.showFrame(this.poseFrame(pose));
  }

  //장 하나를 보인다
  showFrame(frameId: string): void {
    if (frameId === this.shownId) return;
    const plate = this.plates.get(frameId);
    if (!plate) return;
    if (this.shown) this.shown.mesh.visible = false;
    plate.mesh.visible = true;
    plate.material.opacity = this.opacity;
    this.shown = plate;
    this.shownId = frameId;
  }

  setOpacity(value: number): void {
    this.opacity = value;
    if (this.shown) this.shown.material.opacity = value;
  }

  get opacityValue(): number {
    return this.opacity;
  }

  //광선이 맞힐 판. 지금 보이는 장만 친다
  get pickTarget(): THREE.Object3D | null {
    return this.shown?.mesh ?? null;
  }

  //바라보는 쪽을 정한다. 원화는 오른쪽을 보므로 루트 배율 부호가 곧 바라보는 쪽이다
  setFacing(side: 1 | -1): void {
    this.facing = side;
    this.root.scale.x = side;
  }

  //카메라 회전과 똑같이 돌리고, 좌우·판 고정을 매 프레임 지킨다 (§8.9)
  faceCamera(camera: THREE.Camera): void {
    this.root.quaternion.copy(camera.quaternion);
    if (Math.sign(this.root.scale.x) !== this.facing) this.root.scale.x = this.facing;
    this.visual.rotation.set(0, 0, 0);
    this.visual.scale.set(1, 1, 1);
  }

  //월드 x 이동을 visual 로컬 값으로. 루트가 뒤집혀 있으면 반대로 먹는다
  toLocalX(worldDx: number): number {
    return worldDx / this.root.scale.x;
  }

  //몸 가운데·머리 위의 월드 좌표
  chest(height: number): THREE.Vector3 {
    return new THREE.Vector3(this.root.position.x + this.visual.position.x * this.root.scale.x, height, this.root.position.z);
  }

  //대기 자세로 되돌린다
  reset(): void {
    this.root.position.copy(this.home);
    this.visual.position.set(0, 0, 0);
    this.down = false;
    this.setOpacity(1);
    this.setPose('idle');
  }
}

//프레임 PNG(공통 캔버스)를 bbox 로 잘라 텍스처로 만든다. 긴 변은 maxSide 로 줄인다
export function frameTexture(image: HTMLImageElement, frame: FrameData, maxSide: number): THREE.Texture {
  const [x0, y0, x1, y1] = frame.bbox;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(image, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
