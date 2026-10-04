//3D 무대 카메라 (SPEC-005 §8.4). 카메라 변환을 쓰는 곳은 write 하나다
//목표만 바꾸고 실제 값은 실제 시간으로 따라간다. 흔들림은 트라우마, 차기·화각 펀치는 감쇠 스프링

import * as THREE from 'three';
import type { CameraConfig, ShakeConfig } from './config.js';
import { containViewPoints, type ScreenRect, type Vec3 } from '../render/framing.js';

//이번 화면에서 보호할 실제 판 모서리. 카메라 자세를 쓴 뒤 요청하므로 기울기·흔들림도 반영한다
export interface FrameBounds {
  points: readonly THREE.Vector3[];
  rect: ScreenRect;
}

const DEG = Math.PI / 180;

//유니티 SmoothDamp 와 같은 식
function smoothDamp(cur: number, target: number, ref: { v: number }, time: number, dt: number): number {
  const t = Math.max(1e-4, time);
  const omega = 2 / t;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (ref.v + omega * change) * dt;
  ref.v = (ref.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  if (target - cur > 0 === out > target) {
    out = target;
    ref.v = 0;
  }
  return out;
}

const SEEDS = [11.3, 47.9, 83.1, 121.7, 163.3, 199.9];
//-1~1 부드러운 잡음. 채널마다 다른 씨앗
function noise(i: number, t: number): number {
  const s = SEEDS[i] ?? 0;
  return 0.55 * Math.sin(t + s) + 0.3 * Math.sin(t * 2.17 + s * 1.7) + 0.15 * Math.sin(t * 4.31 + s * 2.9);
}

export class CameraRig {
  private readonly homePos: THREE.Vector3;
  private readonly homeQuat = new THREE.Quaternion();
  //원화 화각. 교전 집중은 늘 이 화각에서 계산한다
  private readonly baseFov: number;
  //대기 화각. 화면 비·UI 구역에 맞춰 넓어질 수 있다 (SPEC-004 §13.4)
  private homeFov: number;
  //투영 이동량(정규 화면 좌표). 대기·집중 목표와 지금 값
  private readonly homeShift = new THREE.Vector2();
  private readonly focusShift = new THREE.Vector2();
  private readonly shift = new THREE.Vector2();
  private readonly goalPos = new THREE.Vector3();
  private readonly goalQuat = new THREE.Quaternion();
  private goalFov: number;
  private focused = false;
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private fov: number;
  private readonly vel = { x: { v: 0 }, y: { v: 0 }, z: { v: 0 } };
  private trauma = 0;
  private readonly kick = new THREE.Vector3();
  private readonly kickVel = new THREE.Vector3();
  private fovKick = 0;
  private fovKickVel = 0;
  private readonly probe = new THREE.PerspectiveCamera();
  private safetyFov = 0;
  private readonly safetyShift = new THREE.Vector2();
  //환경 이펙트 카메라 요청 (SPEC-005 §16.1). 사건 하나에 한 번, 가장 센 것 하나만 돈다
  private env: { start: number; amplitude: number; duration: number; zoom: number; dir: number } | null = null;
  private readonly envSeen: string[] = [];
  //흔들림 줄이기면 환경 카메라 요청을 버린다
  envMuted = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    home: THREE.Vector3,
    lookAt: THREE.Vector3,
    fov: number,
    private readonly config: CameraConfig,
    private readonly shake: ShakeConfig,
  ) {
    this.homePos = home.clone();
    this.baseFov = fov;
    this.homeFov = fov;
    this.goalFov = fov;
    this.fov = fov;
    this.probe.position.copy(home);
    this.probe.lookAt(lookAt);
    this.homeQuat.copy(this.probe.quaternion);
    this.snapHome();
  }

  //대기 자세로 바로 옮긴다
  snapHome(): void {
    this.focused = false;
    this.pos.copy(this.homePos);
    this.quat.copy(this.homeQuat);
    this.fov = this.homeFov;
    this.shift.copy(this.homeShift);
    this.trauma = 0;
    this.kick.set(0, 0, 0);
    this.kickVel.set(0, 0, 0);
    this.fovKick = 0;
    this.fovKickVel = 0;
    this.safetyFov = 0;
    this.safetyShift.set(0, 0);
    for (const v of Object.values(this.vel)) v.v = 0;
  }

  //대기 화각과 렌즈 이동을 바꾼다. 자리·방향은 그대로다 (SPEC-004 §13.4)
  setHome(fov: number, offsetX: number, offsetY: number): void {
    this.homeFov = fov;
    this.homeShift.set(offsetX, offsetY);
  }

  //교전 집중 때의 렌즈 이동. 집중 화면의 가운데를 UI 가 덮지 않는 구역 가운데로 옮긴다
  setFocusShift(offsetX: number, offsetY: number): void {
    this.focusShift.set(offsetX, offsetY);
  }

  //두 가슴 가운데로 다가가며 공격자 쪽 측면으로 돌고 기운다.
  //거리는 캐릭터 화면 크기가 대기의 focusSizeGain 배를 넘지 않게 정한다
  //두 사람이 멀어지면 둘 다 화면 가로 fitShare 안에 들 만큼만 물러선다 (SPEC-005 §17.1)
  focus(a: THREE.Vector3, b: THREE.Vector3, dir: number): void {
    const c = this.config;
    const middle = a.clone().add(b).multiplyScalar(0.5);
    middle.y += c.focusHeight;
    const zoomFov = this.baseFov - c.fovZoom;
    const sizeDist =
      (this.homePos.distanceTo(middle) * Math.tan((this.baseFov * DEG) / 2)) / Math.tan((zoomFov * DEG) / 2) / c.focusSizeGain;
    //가로 반 화각. 몸 폭(키의 절반쯤)을 양쪽에 더한 폭이 들어가야 한다
    const halfH = Math.tan((zoomFov * DEG) / 2);
    //몸 폭·뻗은 칼까지 양쪽에 캐릭터 키 1.2 배를 더 둔다
    const span = Math.abs(a.x - b.x) + 2.4;
    const fitDist = span / 2 / (halfH * Math.max(0.1, this.camera.aspect) * c.fitShare);
    const dist = Math.max(sizeDist, fitDist);
    const fwd = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.homeQuat)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -dir * c.panYawDeg * DEG)
      .normalize();
    this.goalPos.copy(middle).addScaledVector(fwd, -dist);
    this.probe.position.copy(this.goalPos);
    this.probe.lookAt(middle);
    this.goalQuat
      .copy(this.probe.quaternion)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), dir * c.dutchDeg * DEG));
    this.goalFov = zoomFov;
    this.focused = true;
  }

  release(): void {
    this.focused = false;
  }

  //맞은 순간. 트라우마를 더하고, 맞은 방향으로 차고, 화각을 순간 좁힌다
  impact(power: number, dir: number): void {
    const s = this.shake;
    this.trauma = Math.min(1, this.trauma + s.traumaPerHit + s.traumaPerDamage * power);
    const omega = Math.sqrt(s.kickStiffness);
    this.kickVel.addScaledVector(new THREE.Vector3(dir, -0.35, -0.5).normalize(), s.kickImpulse * (0.5 + power) * omega);
    this.fovKickVel -= s.fovPunch * (0.5 + power) * omega;
  }

  //환경 이펙트 카메라 요청. amplitude 는 화면 높이 비율, duration 은 초. 같은 사건 id 는 한 번만 받는다
  envImpulse(eventId: string, amplitude: number, duration: number, zoom: number, dir: number, realNow: number, cap: number): void {
    if (this.envMuted || duration <= 0 || this.envSeen.includes(eventId)) return;
    this.envSeen.push(eventId);
    if (this.envSeen.length > 64) this.envSeen.shift();
    const amp = Math.min(cap, amplitude);
    //지금 도는 요청이 더 세면 그대로 둔다
    if (this.env) {
      const left = Math.max(0, 1 - (realNow - this.env.start) / this.env.duration);
      if (this.env.amplitude * left * left >= amp) return;
    }
    this.env = { start: realNow, amplitude: amp, duration, zoom, dir: Math.sign(dir) || 1 };
  }

  //카메라를 쓰는 유일한 곳. 실제 시간으로 흐른다
  write(dt: number, realNow: number, bounds?: (camera: THREE.PerspectiveCamera) => FrameBounds | null): void {
    if (dt <= 0) return;
    const c = this.config;
    const s = this.shake;
    const wantPos = this.focused ? this.goalPos : this.homePos;
    const wantQuat = this.focused ? this.goalQuat : this.homeQuat;
    const wantFov = this.focused ? this.goalFov : this.homeFov;
    const follow = this.focused ? c.followTime : c.returnFollowTime;
    this.pos.set(
      smoothDamp(this.pos.x, wantPos.x, this.vel.x, follow, dt),
      smoothDamp(this.pos.y, wantPos.y, this.vel.y, follow, dt),
      smoothDamp(this.pos.z, wantPos.z, this.vel.z, follow, dt),
    );
    const k = 1 - Math.exp(-dt / Math.max(1e-4, follow));
    this.quat.slerp(wantQuat, k);
    this.fov += (wantFov - this.fov) * k;
    this.shift.lerp(this.focused ? this.focusShift : this.homeShift, k);

    this.trauma = Math.max(0, this.trauma - s.traumaDecay * dt);
    const tt = this.trauma * this.trauma;
    const amount = tt * tt * (3 - 2 * tt);
    const t = realNow * s.frequency;
    const off = new THREE.Vector3(noise(0, t) * s.maxOffset[0], noise(1, t) * s.maxOffset[1], noise(2, t) * s.maxOffset[2]).multiplyScalar(amount);
    const ang = new THREE.Euler(noise(3, t) * s.maxAngle[0] * DEG * amount, noise(4, t) * s.maxAngle[1] * DEG * amount, noise(5, t) * s.maxAngle[2] * DEG * amount);

    //차기·화각 펀치 스프링. 큰 dt 는 잘게 나눠 튀지 않게 한다
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = this.kick.clone().multiplyScalar(-s.kickStiffness).addScaledVector(this.kickVel, -s.kickDamping);
      this.kickVel.addScaledVector(accel, h);
      this.kick.addScaledVector(this.kickVel, h);
      this.fovKickVel += (-s.kickStiffness * this.fovKick - s.kickDamping * this.fovKickVel) * h;
      this.fovKick += this.fovKickVel * h;
    }

    //환경 이펙트 요청: 힘 방향으로 한 번 밀린 뒤 (1 - t/길이)² 로 기준 자리에 돌아온다. 앞 프레임에 쌓지 않는다
    let envFov = 1;
    const envOff = new THREE.Vector3();
    if (this.env) {
      const k = (realNow - this.env.start) / this.env.duration;
      if (k >= 1) this.env = null;
      else {
        const env = (1 - k) * (1 - k);
        const height = 2 * Math.max(1, Math.abs(this.pos.z)) * Math.tan((this.fov * DEG) / 2);
        envOff.set(this.env.dir * 0.9, -0.45, 0).normalize().multiplyScalar(this.env.amplitude * height * env).applyQuaternion(this.quat);
        envFov = 1 - this.env.zoom * env;
      }
    }

    this.camera.position.copy(this.pos).add(off.applyQuaternion(this.quat)).add(this.kick).add(envOff);
    this.camera.quaternion.copy(this.quat).multiply(new THREE.Quaternion().setFromEuler(ang));
    this.camera.fov = Math.min(170, Math.max(5, (this.fov + this.fovKick) * envFov));
    //안전 보정은 바깥으로 즉시, 원래 구도로는 천천히 푼다. 내부 목표에 누적하지 않는다
    const decay = Math.exp(-dt / Math.max(1e-4, c.returnFollowTime));
    this.safetyFov *= decay;
    this.safetyShift.multiplyScalar(decay);
    this.camera.updateMatrixWorld();
    const frame = bounds?.(this.camera);
    const baseFov = this.camera.fov;
    const safe = frame ? containViewPoints(
      frame.points.map((p) => p.clone().applyMatrix4(this.camera.matrixWorldInverse).toArray() as Vec3),
      this.camera.aspect,
      { fov: baseFov + this.safetyFov, offsetX: this.shift.x + this.safetyShift.x, offsetY: this.shift.y + this.safetyShift.y },
      frame.rect,
    ) : { fov: baseFov, offsetX: this.shift.x, offsetY: this.shift.y };
    this.safetyFov = safe.fov - baseFov;
    this.safetyShift.set(safe.offsetX - this.shift.x, safe.offsetY - this.shift.y);
    this.camera.fov = safe.fov;
    this.camera.updateProjectionMatrix();
    //렌즈 이동: 투영 행렬의 가운데 칸만 바꾼다. 원근은 그대로라 배경과 인형이 어긋나지 않는다
    const e = this.camera.projectionMatrix.elements;
    e[8] = safe.offsetX;
    e[9] = safe.offsetY;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }
}
