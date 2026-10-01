//공용 환경 이펙트 v1 재생 층 (SPEC-005 §16). 먼지·압력·잔해·균열을 무대에 놓는다
//판 하나에 장을 갈아 끼운다. 피벗이 발생 지점에 오고, 바닥에 눕히는 균열 말고는 카메라 회전을 그대로 따른다
//시간은 게임 시간이다. 역경직에 같이 멈춘다

import * as THREE from 'three';
import type { EnvSpawn, EnvVfx } from '../render/envvfx.js';

//재생 중인 이펙트 하나
interface Playing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  frames: THREE.Texture[];
  //장마다 보이는 시간(ms). 마지막 장 뒤에 fade 동안 흐려진다
  durations: number[];
  fade: number;
  t: number;
  floor: boolean;
}

export class EnvFxLayer {
  private readonly playing = new Set<Playing>();
  //스프라이트 id → 아틀라스 한 칸을 가리키는 텍스처 (그림은 아틀라스 하나를 같이 쓴다)
  private readonly textures = new Map<string, THREE.Texture>();

  //images: 아틀라스 파일 → 그림. 받지 못한 아틀라스의 이펙트는 조용히 건너뛴다
  constructor(
    private readonly scene: THREE.Scene,
    private readonly vfx: EnvVfx,
    images: Map<string, HTMLImageElement>,
    //캐릭터 키(월드). scale 은 이 키 대비 비율이다
    private readonly characterHeight: number,
  ) {
    //아틀라스 원래 크기. 공유본처럼 줄여 올린 그림이어도 비율로 자른다
    const size = new Map<string, number>();
    for (const s of vfx.sprites.values()) size.set(s.atlas, Math.max(size.get(s.atlas) ?? 0, s.rect[0] + s.rect[2], s.rect[1] + s.rect[3]));
    const bases = new Map<string, THREE.Texture>();
    for (const [file, image] of images) {
      const t = new THREE.Texture(image);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      bases.set(file, t);
    }
    for (const s of vfx.sprites.values()) {
      const base = bases.get(s.atlas);
      const S = size.get(s.atlas) ?? 2048;
      if (!base) continue;
      const t = base.clone();
      const [x, y, w, h] = s.rect;
      t.repeat.set(w / S, h / S);
      t.offset.set(x / S, 1 - (y + h) / S);
      t.needsUpdate = true;
      this.textures.set(s.id, t);
    }
  }

  //미리 그래픽 카드에 올릴 텍스처들
  get allTextures(): THREE.Texture[] {
    return [...this.textures.values()];
  }

  //이펙트 하나를 낸다. at 은 발생 지점(월드), dir 은 힘이 가는 x 부호, tint 는 곱할 색, crack 은 균열색
  spawn(spawn: EnvSpawn, at: THREE.Vector3, dir: number, tint: string, crack: string): void {
    const anim = this.vfx.animations.get(spawn.play);
    const ids = anim ? anim.frames : [spawn.play];
    const first = this.vfx.sprites.get(ids[0] as string);
    const frames = ids.map((id) => this.textures.get(id)).filter((t): t is THREE.Texture => t !== undefined);
    if (!first || frames.length !== ids.length) return;
    const s = (this.characterHeight * spawn.scale) / first.canvas[1];
    const geometry = new THREE.PlaneGeometry(first.canvas[0] * s, first.canvas[1] * s);
    //피벗이 원점에 오게 판을 민다. 그림 y 는 아래로 늘어난다
    geometry.translate((first.canvas[0] / 2 - first.pivot[0]) * s, (first.pivot[1] - first.canvas[1] / 2) * s, 0);
    const silhouette = first.tint === 'alpha_silhouette';
    const material = new THREE.MeshBasicMaterial({
      map: frames[0] ?? null,
      color: new THREE.Color(silhouette ? crack : tint),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    //균열: 원본 RGB 를 버리고 정한 색에 원본 알파만 쓴다 (납품 README)
    if (silhouette) {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          '#ifdef USE_MAP\n  diffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif',
        );
      };
      material.customProgramCacheKey = () => 'envfx-silhouette';
    }
    const mesh = new THREE.Mesh(geometry, material);
    const floor = spawn.anchor === 'floor';
    const ground = spawn.anchor === 'foot' || floor;
    //바닥 이펙트는 인형 뒤, 허공 이펙트는 인형 앞
    mesh.renderOrder = ground ? 9 : 46;
    const face = spawn.face === 'away' ? -dir : dir;
    const h = this.characterHeight;
    mesh.position.set(at.x + face * spawn.offset[0] * h, at.y + spawn.offset[1] * h, at.z);
    //바닥에 눕힌다. 낮은 카메라에서 완전히 누우면 선처럼 납작해져 23° 만 카메라 쪽으로 세운다 (검수 결과 §16.4)
    if (floor) {
      mesh.position.y = 0.012;
      mesh.rotation.x = -Math.PI / 2 + 0.4;
    }
    mesh.scale.x = face >= 0 ? 1 : -1;
    this.scene.add(mesh);
    const durations = anim ? anim.durations : [spawn.hold];
    this.playing.add({ mesh, material, frames, durations, fade: anim ? anim.fadeLast : spawn.fade, t: 0, floor });
  }

  //장 넘기기·흐려지기·카메라 향함. dt 는 게임 초
  update(dt: number, camera: THREE.Camera): void {
    for (const p of [...this.playing]) {
      p.t += dt * 1000;
      let t = p.t;
      let index = 0;
      while (index < p.durations.length - 1 && t >= (p.durations[index] ?? 0)) {
        t -= p.durations[index] ?? 0;
        index += 1;
      }
      const texture = p.frames[Math.min(index, p.frames.length - 1)] ?? null;
      if (p.material.map !== texture) {
        p.material.map = texture;
        p.material.needsUpdate = true;
      }
      const total = p.durations.reduce((a, b) => a + b, 0);
      //마지막 장을 붙잡은 채 흐려진다
      const over = p.t - total;
      p.material.opacity = over <= 0 ? 1 : Math.max(0, 1 - over / Math.max(1, p.fade));
      if (over >= p.fade) {
        this.remove(p);
        continue;
      }
      if (!p.floor) {
        const sx = p.mesh.scale.x;
        p.mesh.quaternion.copy(camera.quaternion);
        p.mesh.scale.set(sx, 1, 1);
      }
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
