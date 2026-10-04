//상시 환경 입자 (SPEC-005 §17.3). 맵 원화 위에 늘 움직이는 것을 절차로 그린다
//떠다니는 먼지 · 위에서 떨어지는 물방울과 바닥 고리 · 바닥 위를 흐르는 낮은 안개
//그림 파일을 새로 쓰지 않는다. 부드러운 점·안개 무늬는 캔버스로 한 번 만든다

import * as THREE from 'three';
import type { AmbientConfig } from './config.js';

//결정적 난수. 매번 같은 배치가 나와야 캡처 비교가 된다
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

//가운데가 밝고 가장자리가 투명한 점 무늬
function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,248,232,1)');
    grad.addColorStop(0.35, 'rgba(255,240,215,0.55)');
    grad.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

//좌우로 이어지는 안개 무늬. 위아래 끝은 투명하다
function fogTexture(rand: () => number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    for (let i = 0; i < 46; i++) {
      const x = rand() * 512;
      const y = 50 + rand() * 50;
      const r = 30 + rand() * 70;
      //좌우 끝에서 이어지게 양쪽에 한 번 더 그린다
      for (const dx of [-512, 0, 512]) {
        const grad = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        grad.addColorStop(0, 'rgba(205,200,190,0.20)');
        grad.addColorStop(1, 'rgba(205,200,190,0)');
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    const fade = g.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.35, 'rgba(0,0,0,0)');
    fade.addColorStop(0.9, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(0, 0, 512, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

//물방울 하나. 위에서 떨어져 바닥에 고리를 남기고 다시 위로
interface Drip {
  x: number;
  z: number;
  y: number;
  ring: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export class AmbientField {
  readonly root = new THREE.Group();
  private readonly dust: THREE.Points;
  private readonly dustBase: Float32Array;
  private readonly dustPhase: Float32Array;
  private readonly drips: Drip[] = [];
  private readonly dripLines: THREE.LineSegments;
  private readonly fogs: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; speed: number }[] = [];
  private readonly textures: THREE.Texture[] = [];
  private time = 0;
  //흔들림 줄이기면 먼지·안개 속도를 1/3 로 (§17.3)
  slow = false;

  //config 의 길이는 월드 단위다. floorY 는 바닥 높이
  constructor(scene: THREE.Scene, private readonly config: AmbientConfig, private readonly floorY = 0) {
    const rand = seeded(17);
    const dot = softDot();
    const fog = fogTexture(rand);
    this.textures.push(dot, fog);

    //먼지: 무대 앞뒤 공간에 고루 흩는다
    const d = config.dust;
    this.dustBase = new Float32Array(d.count * 3);
    this.dustPhase = new Float32Array(d.count);
    for (let i = 0; i < d.count; i++) {
      this.dustBase[i * 3] = (rand() - 0.5) * d.width;
      this.dustBase[i * 3 + 1] = floorY + rand() * d.height;
      this.dustBase[i * 3 + 2] = d.far + rand() * (d.near - d.far);
      this.dustPhase[i] = rand() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.dustBase), 3));
    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ map: dot, size: d.size, sizeAttenuation: true, transparent: true, opacity: d.opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 40;
    this.root.add(this.dust);

    //물방울: 줄 하나 + 바닥 고리 하나씩
    const r = config.drips;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(r.count * 6), 3));
    this.dripLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xcfd9e0, transparent: true, opacity: r.opacity, depthWrite: false, fog: false }));
    this.dripLines.frustumCulled = false;
    this.root.add(this.dripLines);
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < r.count; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xd8e2ea, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(ringGeo, material);
      const x = (rand() - 0.5) * r.width;
      const z = r.depthMin + rand() * (r.depthMax - r.depthMin);
      mesh.position.set(x, floorY + 0.01, z);
      this.root.add(mesh);
      this.drips.push({ x, z, y: floorY + rand() * (r.top - floorY), ring: -1, mesh, material });
    }

    //낮은 안개: 깊이마다 판 하나. 무늬를 좌우로 흘린다
    const f = config.fog;
    for (let i = 0; i < f.layers; i++) {
      const map = fog.clone();
      map.needsUpdate = true;
      map.repeat.set(1.5, 1);
      this.textures.push(map);
      const material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: f.opacity, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.height), material);
      const t = f.layers > 1 ? i / (f.layers - 1) : 0.5;
      mesh.position.set(0, floorY + f.height * 0.35, f.depthMin + t * (f.depthMax - f.depthMin));
      mesh.renderOrder = 5;
      this.root.add(mesh);
      this.fogs.push({ mesh, material, speed: f.speed * (0.6 + 0.4 * (i + 1)) * (i % 2 === 0 ? 1 : -1) });
    }
    scene.add(this.root);
  }

  //실제 시간으로 흐른다. 판·안개는 카메라 좌우 방향만 따라 정면을 본다
  update(realDt: number, camera: THREE.Camera): void {
    if (!this.root.visible) return;
    const dt = Math.min(0.05, realDt);
    const k = this.slow ? 1 / 3 : 1;
    this.time += dt * k;
    const d = this.config.dust;
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < d.count; i++) {
      const p = this.dustPhase[i] ?? 0;
      const bx = this.dustBase[i * 3] ?? 0;
      const by = this.dustBase[i * 3 + 1] ?? 0;
      const bz = this.dustBase[i * 3 + 2] ?? 0;
      //천천히 떠오르다 위에서 다시 바닥 쪽으로 감는다
      const y = this.floorY + ((by - this.floorY + this.time * d.rise * (0.6 + 0.4 * Math.sin(p))) % d.height);
      const x = bx + Math.sin(this.time * 0.3 + p) * d.drift * 2 + this.time * d.drift * 0.3;
      const wrapped = ((x + d.width / 2) % d.width + d.width) % d.width - d.width / 2;
      pos.setXYZ(i, wrapped, y, bz);
    }
    pos.needsUpdate = true;

    //물방울: 떨어지는 줄과 바닥 고리
    const r = this.config.drips;
    const lines = this.dripLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.drips.forEach((drip, i) => {
      if (drip.ring >= 0) {
        drip.ring += dt;
        const t = drip.ring / r.ringTime;
        drip.mesh.scale.setScalar(0.2 + t * r.ringSize);
        drip.material.opacity = r.opacity * Math.max(0, 1 - t);
        if (t >= 1) {
          drip.ring = -1;
          drip.y = r.top;
          drip.material.opacity = 0;
        }
        lines.setXYZ(i * 2, drip.x, -100, drip.z);
        lines.setXYZ(i * 2 + 1, drip.x, -100, drip.z);
        return;
      }
      drip.y -= r.speed * dt;
      if (drip.y <= this.floorY) {
        drip.ring = 0;
        return;
      }
      lines.setXYZ(i * 2, drip.x, drip.y, drip.z);
      lines.setXYZ(i * 2 + 1, drip.x, drip.y + r.length, drip.z);
    });
    lines.needsUpdate = true;

    const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y;
    for (const f of this.fogs) {
      f.mesh.rotation.set(0, yaw, 0);
      if (f.material.map) f.material.map.offset.x += f.speed * dt * k * 0.05;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    this.dripLines.geometry.dispose();
    (this.dripLines.material as THREE.Material).dispose();
    for (const d of this.drips) d.material.dispose();
    for (const f of this.fogs) {
      f.mesh.geometry.dispose();
      f.material.dispose();
    }
    for (const t of this.textures) t.dispose();
  }
}
