//3D 무대의 시계. 게임 시간(역경직에 멈춤)과 실제 시간(카메라·대기열)을 나눈다 (SPEC-005 §8.5)
//트윈은 DOTween 의 게임 시간 트윈과 같은 역할이다. 시간 배율을 쓰는 곳은 applyTimeScale 하나다

export type Ease = (t: number) => number;

//감속 곡선 모음
export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  outBack: (t: number) => {
    const s = 1.70158;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  },
  //튕기며 제자리. 진폭·주기는 수치 파일에서 받는다
  outElastic: (amplitude: number, period: number): Ease => (t: number) => {
    if (t <= 0 || t >= 1) return t;
    let a = amplitude;
    let s: number;
    if (a < 1) {
      a = 1;
      s = period / 4;
    } else s = (period / (2 * Math.PI)) * Math.asin(1 / a);
    return a * 2 ** (-10 * t) * Math.sin(((t - s) * 2 * Math.PI) / period) + 1;
  },
};

interface Tween {
  target: Record<string, number>;
  key: string;
  from: number;
  to: number;
  dur: number;
  t: number;
  fn: Ease;
  done: () => void;
}

interface GameWait {
  left: number;
  done: () => void;
}

interface RealWait {
  until: number;
  done: () => void;
}

export class Clock {
  //게임 시간 배율. 역경직 때 거의 0 이 된다
  private timeScale = 1;
  //역경직이 없을 때의 배율. 카드 뒤집기 슬로우가 이 값을 낮춘다 (SPEC-005 §11)
  private baseScale = 1;
  //실제 시간 트윈. 슬로우·역경직에도 제 속도로 흐른다 (카드 회전)
  private realTweens: Tween[] = [];
  //지금까지 흐른 실제 시간
  private real = 0;
  private tweens: Tween[] = [];
  private gameWaits: GameWait[] = [];
  private realWaits: RealWait[] = [];
  private hitStop = { active: false, until: 0, scale: 0.02 };

  get realNow(): number {
    return this.real;
  }

  get scale(): number {
    return this.timeScale;
  }

  //시간 배율을 쓰는 유일한 곳
  private applyTimeScale(value: number): void {
    this.timeScale = value;
  }

  //슬로우를 걸거나 푼다. 역경직 중이면 역경직이 끝난 뒤에 이 배율로 돌아간다
  setSlowMotion(scale: number): void {
    this.baseScale = scale;
    if (!this.hitStop.active) this.applyTimeScale(scale);
  }

  //역경직. 겹치면 끝나는 시각만 늘린다
  startHitStop(seconds: number, scale: number): void {
    if (seconds <= 0) return;
    this.hitStop.until = Math.max(this.hitStop.until, this.real + seconds);
    this.hitStop.active = true;
    this.hitStop.scale = scale;
    this.applyTimeScale(scale);
  }

  //같은 속성에 새 트윈이 오면 앞 트윈을 끊는다 (DOKill)
  kill(target: object, key?: string): void {
    this.tweens = this.tweens.filter((t) => {
      if (t.target === target && (key === undefined || t.key === key)) {
        t.done();
        return false;
      }
      return true;
    });
  }

  //게임 시간 트윈. 끝나면 풀리는 약속을 돌려준다
  tween(target: object, key: string, to: number, dur: number, fn: Ease = ease.outQuad): Promise<void> {
    const record = target as Record<string, number>;
    this.kill(target, key);
    return new Promise((done) =>
      this.tweens.push({ target: record, key, from: record[key] ?? 0, to, dur: Math.max(1e-4, dur), t: 0, fn, done }),
    );
  }

  //실제 시간 트윈. 같은 속성의 앞 트윈을 끊는다
  tweenReal(target: object, key: string, to: number, dur: number, fn: Ease = ease.outQuad): Promise<void> {
    const record = target as Record<string, number>;
    this.realTweens = this.realTweens.filter((t) => {
      if (t.target === record && t.key === key) {
        t.done();
        return false;
      }
      return true;
    });
    return new Promise((done) =>
      this.realTweens.push({ target: record, key, from: record[key] ?? 0, to, dur: Math.max(1e-4, dur), t: 0, fn, done }),
    );
  }

  waitGame(seconds: number): Promise<void> {
    return new Promise((done) => this.gameWaits.push({ left: seconds, done }));
  }

  waitReal(seconds: number): Promise<void> {
    return new Promise((done) => this.realWaits.push({ until: this.real + seconds, done }));
  }

  //한 프레임 흘린다. 실제 경과를 받아 게임 경과를 돌려준다
  step(realDt: number): number {
    this.real += realDt;
    for (const w of [...this.realWaits]) {
      if (this.real >= w.until) {
        this.realWaits.splice(this.realWaits.indexOf(w), 1);
        w.done();
      }
    }
    if (this.hitStop.active && this.real >= this.hitStop.until) {
      this.hitStop.active = false;
      this.applyTimeScale(this.baseScale);
    }
    for (const t of [...this.realTweens]) {
      t.t += realDt;
      const k = Math.min(1, t.t / t.dur);
      t.target[t.key] = t.from + (t.to - t.from) * t.fn(k);
      if (k >= 1) {
        this.realTweens.splice(this.realTweens.indexOf(t), 1);
        t.done();
      }
    }
    const gameDt = realDt * this.timeScale;
    for (const t of [...this.tweens]) {
      t.t += gameDt;
      const k = Math.min(1, t.t / t.dur);
      t.target[t.key] = t.from + (t.to - t.from) * t.fn(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(t), 1);
        t.done();
      }
    }
    for (const w of [...this.gameWaits]) {
      w.left -= gameDt;
      if (w.left <= 0) {
        this.gameWaits.splice(this.gameWaits.indexOf(w), 1);
        w.done();
      }
    }
    return gameDt;
  }

  //전부 끊는다. 재시작할 때 쓴다
  clear(): void {
    for (const t of this.tweens) t.done();
    for (const t of this.realTweens) t.done();
    for (const w of this.gameWaits) w.done();
    for (const w of this.realWaits) w.done();
    this.tweens = [];
    this.realTweens = [];
    this.gameWaits = [];
    this.realWaits = [];
    this.hitStop.active = false;
    this.baseScale = 1;
    this.applyTimeScale(1);
  }
}

//여러 약속을 한꺼번에 기다린다
export const all = (...jobs: (Promise<void> | Promise<void>[] | null)[]): Promise<unknown> =>
  Promise.all(jobs.flat().filter((j): j is Promise<void> => j !== null));
