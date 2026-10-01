//바닥에 붙는 먼지 고리 (SPEC-005 §15 D05, 연출 실험 모드)
//화면을 보는 원이 아니라 바닥 원근에 눕힌 평면이다. 셀화풍에 맞춰 2단 명암의 평평한 그림으로 그린다
//시간은 게임 시간이다. 역경직에 같이 멈춘다

import * as THREE from 'three';

//먼지 한 덩이
interface Puff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  t: number;
  life: number;
  from: number;
  to: number;
  velocity: THREE.Vector3;
}

//먼지 그림 한 장. 바깥은 밝은 회갈색, 안쪽은 한 단 어두운 면. 가장자리만 살짝 흐린다
function puffTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const c = size / 2;
    g.fillStyle = 'rgba(214, 204, 186, 0.95)';
    g.beginPath();
    g.arc(c, c, c * 0.92, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(168, 156, 138, 0.95)';
    g.beginPath();
    g.arc(c + c * 0.12, c + c * 0.1, c * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class DustField {
  private readonly puffs: Puff[] = [];
  private readonly texture = puffTexture();
  private seed = 7;

  constructor(
    private readonly scene: THREE.Scene,
    //캐릭터 키(월드). 크기·퍼짐은 이 키 대비 비율이다
    private readonly characterHeight: number,
  ) {}

  //결정적인 난수. 같은 장면은 같은 먼지가 난다
  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  //발 자리 둘레에 먼지를 일으킨다. dir 은 밀려난 쪽(x 부호). 그쪽으로 더 퍼진다
  burst(foot: THREE.Vector3, dir: number, count: number, life: number, size: number, spread: number): void {
    const h = this.characterHeight;
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      //바닥에 눕히되 카메라 쪽으로 조금 세운다. 낮은 카메라에서 완전히 누우면 실처럼 납작해진다
      mesh.rotation.x = -Math.PI / 2 + 0.55;
      mesh.renderOrder = 8;
      const side = (this.rand() - 0.5) * 2;
      mesh.position.set(foot.x + side * spread * h * 0.3, 0.01 + i * 0.001, foot.z + (this.rand() - 0.5) * spread * h * 0.4);
      const from = size * h * (0.35 + this.rand() * 0.25);
      mesh.scale.setScalar(from);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3((dir * 0.6 + side * 0.4) * spread * h, 0, (this.rand() - 0.5) * spread * h * 0.5);
      this.puffs.push({ mesh, material, t: 0, life: life * (0.75 + this.rand() * 0.5), from, to: size * h * (0.9 + this.rand() * 0.4), velocity });
    }
  }

  //커지며 퍼지고 흐려진다
  step(dt: number): void {
    for (const p of [...this.puffs]) {
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      const out = 1 - (1 - k) * (1 - k);
      p.mesh.scale.setScalar(p.from + (p.to - p.from) * out);
      p.mesh.position.addScaledVector(p.velocity, dt * (1 - k));
      p.material.opacity = 0.85 * (1 - k);
      if (k >= 1) this.remove(p);
    }
  }

  private remove(p: Puff): void {
    p.mesh.removeFromParent();
    p.mesh.geometry.dispose();
    p.material.dispose();
    this.puffs.splice(this.puffs.indexOf(p), 1);
  }

  //전부 뺀다 (재시작)
  clear(): void {
    for (const p of [...this.puffs]) this.remove(p);
  }
}
