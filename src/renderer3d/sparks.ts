//금속끼리 부딪힌 스파크 (SPEC-005 §8.6). 짧은 섬광 하나 + 노란 불똥 줄기
//불똥은 공격 방향 부채꼴로 튀고 일부는 되튄다. 속도 방향으로 늘이고 중력으로 떨어진다
//게임 시간으로 흘러 역경직 동안 같이 멈춘다

import * as THREE from 'three';
import type { SparkConfig } from './config.js';

const DEG = Math.PI / 180;

interface Spark {
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  life: number;
  width: number;
}

interface Flash {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  size: number;
}

//불똥 한 줄 텍스처. 오른쪽이 뜨거운 머리, 왼쪽으로 꼬리가 식는다
function sparkTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d');
  if (g) {
    const lg = g.createLinearGradient(0, 0, 128, 0);
    lg.addColorStop(0, 'rgba(255,110,20,0)');
    lg.addColorStop(0.55, 'rgba(255,170,40,0.75)');
    lg.addColorStop(0.9, 'rgba(255,230,120,1)');
    lg.addColorStop(1, 'rgba(255,252,220,1)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(110, 3);
    g.quadraticCurveTo(128, 8, 110, 13);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

//가운데 섬광 텍스처
function coreTexture(): THREE.Texture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,235,1)');
    r.addColorStop(0.25, 'rgba(255,220,110,0.9)');
    r.addColorStop(0.6, 'rgba(255,140,30,0.25)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, n, n);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SparkField {
  private readonly streak = sparkTexture();
  private readonly core = coreTexture();
  private sparks: Spark[] = [];
  private flashes: Flash[] = [];
  //보기마다 같은 모양이 나오게 씨앗을 고정한다
  private seed = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly config: SparkConfig,
  ) {}

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  //충돌 자리에서 터뜨린다. dir 은 공격 방향(월드 x 부호)
  burst(pos: THREE.Vector3, dir: number, clash: boolean, order: number): void {
    const c = this.config;
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.core, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
    );
    const size = c.coreSize * (clash ? 1.25 : 1);
    flash.position.copy(pos);
    flash.scale.setScalar(size);
    flash.renderOrder = order + 2;
    this.scene.add(flash);
    this.flashes.push({ sprite: flash, t: 0, life: c.coreLife, size });

    const n = clash ? c.countClash : c.countHit;
    const cone = c.coneDeg * (clash ? 1.4 : 1) * DEG;
    for (let i = 0; i < n; i++) {
      const back = this.rand() < c.backShare;
      const ang = (back ? Math.PI : 0) + (this.rand() - 0.5) * cone + 0.25;
      const sp = c.speedMin + this.rand() * (c.speedMax - c.speedMin);
      const vel = new THREE.Vector3(Math.cos(ang) * dir * sp, Math.sin(ang) * sp * 0.9 + 1.5, (this.rand() - 0.5) * sp * 0.6);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.streak, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
      );
      sprite.renderOrder = order + 2;
      sprite.position.copy(pos);
      this.scene.add(sprite);
      this.sparks.push({
        sprite,
        pos: pos.clone(),
        vel,
        t: 0,
        life: c.lifeMin + this.rand() * (c.lifeMax - c.lifeMin),
        width: c.width * (0.7 + this.rand() * 0.6),
      });
    }
  }

  //게임 시간으로 흘린다. 불똥은 화면에서 본 진행 방향으로 돌린다
  step(dt: number, camera: THREE.Camera, viewW: number, viewH: number): void {
    const c = this.config;
    for (const f of [...this.flashes]) {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this.remove(f.sprite);
        this.flashes.splice(this.flashes.indexOf(f), 1);
        continue;
      }
      f.sprite.scale.setScalar(f.size * (1 + 0.2 * k));
      f.sprite.material.opacity = 1 - k * k;
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const p of [...this.sparks]) {
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.remove(p.sprite);
        this.sparks.splice(this.sparks.indexOf(p), 1);
        continue;
      }
      p.vel.y -= c.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-c.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      const speed = p.vel.length();
      const len = Math.max(p.width * 1.5, speed * c.length);
      a.copy(p.pos).project(camera);
      b.copy(p.pos).addScaledVector(p.vel, 0.01).project(camera);
      p.sprite.material.rotation = Math.atan2((b.y - a.y) * viewH, (b.x - a.x) * viewW);
      p.sprite.position.copy(p.pos).addScaledVector(p.vel, (-0.5 * len) / Math.max(1e-3, speed));
      p.sprite.scale.set(len, p.width * (1 - 0.5 * k), 1);
      p.sprite.material.opacity = 1 - k * k;
    }
  }

  private remove(sprite: THREE.Sprite): void {
    this.scene.remove(sprite);
    sprite.material.dispose();
  }

  clear(): void {
    for (const f of this.flashes) this.remove(f.sprite);
    for (const p of this.sparks) this.remove(p.sprite);
    this.flashes = [];
    this.sparks = [];
  }
}
