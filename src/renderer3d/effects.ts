//무대 위에 한 번 터지는 연속 장 이펙트 (SPEC-005 §10.2). 궁극기 베기선·물보라·밤물
//판 하나에 장을 갈아 끼운다. 피벗이 놓을 자리에 오고, 인형처럼 카메라 회전을 그대로 따른다 (§8.9)
//시간은 실제 시간이다. 역경직에 멈추지 않는다

import * as THREE from 'three';
import type { EffectData } from '../render/manifest.js';

//이펙트 한 번 재생
interface Playing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  textures: THREE.Texture[];
  effect: EffectData;
  start: number;
  //마지막 장에서 멈춰 있는다 (밤물처럼 한 장짜리를 붙잡을 때)
  hold: boolean;
  //화면에서 기울기(라디안). 카메라를 본 채로 돈다
  roll: number;
  fade: { from: number; to: number; start: number; seconds: number } | null;
}

export class EffectLayer {
  private readonly playing = new Set<Playing>();

  constructor(
    private readonly scene: THREE.Scene,
    //캐릭터 키(월드). 이펙트 크기는 이 키 대비 비율이다 (SPEC-002 §5.5)
    private readonly characterHeight: number,
  ) {}

  //장을 세운다. at 은 피벗이 올 월드 자리, facing 이 -1 이면 좌우를 뒤집는다
  spawn(effect: EffectData, textures: THREE.Texture[], at: THREE.Vector3, facing: 1 | -1, now: number, options: { hold?: boolean; order?: number; roll?: number } = {}): Playing | null {
    if (textures.length === 0) return null;
    const { width, height } = effect.size;
    const perPixel = (this.characterHeight * effect.scale) / Math.max(width, height);
    const geometry = new THREE.PlaneGeometry(width * perPixel, height * perPixel);
    //피벗이 원점에 오게 판을 민다. 그림 y 는 아래로 늘어난다
    geometry.translate((width / 2 - effect.pivot.x) * perPixel, (effect.pivot.y - height / 2) * perPixel, 0);
    const material = new THREE.MeshBasicMaterial({
      map: textures[0] ?? null,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: false,
      blending: effect.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = options.order ?? 45;
    mesh.position.copy(at);
    mesh.scale.x = facing;
    this.scene.add(mesh);
    const p: Playing = { mesh, material, textures, effect, start: now, hold: options.hold ?? false, roll: options.roll ?? 0, fade: null };
    this.playing.add(p);
    return p;
  }

  //천천히 나타나거나 사라지게 한다. 0 이 되면 뺀다
  fade(p: Playing | null, to: number, seconds: number, now: number): void {
    if (!p) return;
    p.fade = { from: p.material.opacity, to, start: now, seconds: Math.max(1e-3, seconds) };
  }

  //장 넘기기와 카메라 향함. 다 돈 이펙트는 뺀다
  update(now: number, camera: THREE.Camera): void {
    for (const p of this.playing) {
      const frames = p.effect.frames;
      let t = (now - p.start) * 1000;
      let index = 0;
      while (index < frames.length - 1 && t >= (frames[index]?.ms ?? 0)) {
        t -= frames[index]?.ms ?? 0;
        index += 1;
      }
      const total = frames.reduce((sum, f) => sum + f.ms, 0);
      const done = !p.hold && !p.effect.loop && (now - p.start) * 1000 >= total;
      const texture = p.textures[Math.min(index, p.textures.length - 1)] ?? null;
      if (p.material.map !== texture) {
        p.material.map = texture;
        p.material.needsUpdate = true;
      }
      if (p.fade) {
        const k = Math.min(1, (now - p.fade.start) / p.fade.seconds);
        p.material.opacity = p.fade.from + (p.fade.to - p.fade.from) * k;
        if (k >= 1 && p.fade.to <= 0) {
          this.remove(p);
          continue;
        }
      }
      if (done) {
        this.remove(p);
        continue;
      }
      //판 회전은 카메라와 같게, 좌우 부호는 지킨다
      const sx = p.mesh.scale.x;
      p.mesh.quaternion.copy(camera.quaternion);
      if (p.roll !== 0) p.mesh.rotateZ(p.roll);
      p.mesh.scale.set(sx, 1, 1);
    }
  }

  private remove(p: Playing): void {
    p.mesh.removeFromParent();
    p.mesh.geometry.dispose();
    p.material.dispose();
    this.playing.delete(p);
  }

  //전부 뺀다 (재시작)
  clear(): void {
    for (const p of [...this.playing]) this.remove(p);
  }
}

//이펙트 장 그림을 텍스처로 만든다. 캔버스 전체를 그대로 쓴다 (피벗이 원본 캔버스 좌표라 자르지 않는다)
export function effectTextures(images: readonly (HTMLImageElement | null)[]): THREE.Texture[] {
  return images
    .filter((image): image is HTMLImageElement => image !== null)
    .map((image) => {
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
}
