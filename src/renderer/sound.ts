//합성 소리 (SPEC-005 §7.5)
//
//녹음 소리가 없어서 웹 오디오로 즉석 합성하는 자리표시다. 원작 소리는 쓰지 않는다.
//렌더러는 이름(SoundCue)만 부른다. 녹음 소리가 들어오면 이 파일만 바꾼다

import { SOUND_CUES, type SoundCue, type SoundData } from '../ui/data.js';

//렌더러가 쓰는 쪽. 테스트나 소리 없는 환경에서는 아무것도 안 하는 것으로 갈아 끼운다
export interface SoundPlayer {
  play(cue: SoundCue): void;
}

//아무 소리도 안 낸다
export const SILENT: SoundPlayer = { play: () => undefined };

//소리 하나를 만드는 방법. 시작 시각과 세기를 받아 노드를 엮는다
type Recipe = (audio: AudioContext, out: AudioNode, at: number) => void;

//흰 소음 한 토막. 모든 파열음·바람 소리의 재료다
function noiseBuffer(audio: AudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class SynthSound implements SoundPlayer {
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private readonly recipes: Record<SoundCue, Recipe>;

  //세기는 데이터에서 받는다. 소리 모양은 아래 조리법이 정한다
  constructor(private readonly data: SoundData) {
    this.recipes = {
      dash: (a, o, t) => this.whoosh(a, o, t, 700, 2600, 0.24),
      coin: (a, o, t) => {
        this.ping(a, o, t, 2500, 0.07, 0.5);
        this.ping(a, o, t + 0.02, 3700, 0.05, 0.3);
      },
      clash: (a, o, t) => this.metal(a, o, t, 1, 0.55),
      clashTie: (a, o, t) => this.metal(a, o, t, 0.8, 0.35),
      coinBreak: (a, o, t) => {
        this.burst(a, o, t, 'bandpass', 3200, 0.12, 0.8);
        this.drop(a, o, t, 1800, 500, 0.14, 'triangle', 0.4);
      },
      swing: (a, o, t) => this.whoosh(a, o, t, 400, 1800, 0.2),
      hit: (a, o, t) => {
        this.drop(a, o, t, 150, 45, 0.2, 'sine', 1);
        this.burst(a, o, t, 'lowpass', 1400, 0.08, 0.7);
      },
      hitHeavy: (a, o, t) => {
        this.drop(a, o, t, 120, 32, 0.34, 'sine', 1);
        this.drop(a, o, t, 240, 60, 0.12, 'square', 0.25);
        this.burst(a, o, t, 'lowpass', 2200, 0.16, 0.9);
      },
      guard: (a, o, t) => {
        this.metal(a, o, t, 1.4, 0.18);
        this.drop(a, o, t, 320, 200, 0.12, 'triangle', 0.5);
      },
      down: (a, o, t) => {
        this.drop(a, o, t, 85, 28, 0.7, 'sine', 1);
        this.burst(a, o, t, 'lowpass', 420, 0.55, 0.6);
      },
      ultimate: (a, o, t) => {
        this.whoosh(a, o, t, 200, 4200, 0.7);
        this.drop(a, o, t, 55, 50, 1.1, 'sawtooth', 0.18);
      },
      result: (a, o, t) => {
        this.tone(a, o, t, 196, 1.4, 0.4);
        this.tone(a, o, t + 0.08, 294, 1.3, 0.3);
      },
    };
  }

  //브라우저는 사용자 입력 전에는 소리를 못 낸다. 첫 클릭·키 입력에서 부른다
  unlock(): void {
    if (!this.audio) {
      const Context = globalThis.AudioContext;
      if (!Context) return;
      this.audio = new Context();
      this.master = this.audio.createGain();
      this.master.gain.value = this.data.master;
      this.master.connect(this.audio.destination);
      this.noise = noiseBuffer(this.audio);
    }
    if (this.audio.state === 'suspended') void this.audio.resume();
  }

  //끄고 켠다. 끈 동안의 소리는 그냥 버린다
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  //이름 하나를 지금 낸다. 아직 안 열렸거나 꺼져 있으면 조용히 넘어간다
  play(cue: SoundCue): void {
    const audio = this.audio;
    if (!audio || !this.master || this.muted || audio.state !== 'running') return;
    const gain = this.data.gains[cue];
    if (!(gain > 0) || !SOUND_CUES.includes(cue)) return;
    const out = audio.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    this.recipes[cue](audio, out, audio.currentTime + 0.005);
  }

  //세기 곡선. 빠르게 올라갔다가 지수로 떨어진다
  private envelope(audio: AudioContext, at: number, peak: number, sec: number): GainNode {
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + sec);
    return gain;
  }

  //음높이가 떨어지는 소리. 둔탁한 타격의 몸통이다
  private drop(audio: AudioContext, out: AudioNode, at: number, from: number, to: number, sec: number, wave: OscillatorType, peak: number): void {
    const osc = audio.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + sec);
    const env = this.envelope(audio, at, peak, sec);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + sec + 0.02);
  }

  //짧고 높은 울림. 코인이 뒤집히는 소리다
  private ping(audio: AudioContext, out: AudioNode, at: number, hz: number, sec: number, peak: number): void {
    this.drop(audio, out, at, hz, hz * 0.98, sec, 'sine', peak);
  }

  //길게 끄는 음 하나. 결과 띠의 화음에 쓴다
  private tone(audio: AudioContext, out: AudioNode, at: number, hz: number, sec: number, peak: number): void {
    const osc = audio.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + sec);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + sec + 0.02);
  }

  //걸러 낸 소음 한 번. 파열·먼지 소리다
  private burst(audio: AudioContext, out: AudioNode, at: number, kind: BiquadFilterType, hz: number, sec: number, peak: number): void {
    if (!this.noise) return;
    const source = audio.createBufferSource();
    source.buffer = this.noise;
    const filter = audio.createBiquadFilter();
    filter.type = kind;
    filter.frequency.value = hz;
    const env = this.envelope(audio, at, peak, sec);
    source.connect(filter).connect(env).connect(out);
    source.start(at, Math.random() * 0.5);
    source.stop(at + sec + 0.02);
  }

  //대역이 쓸려 올라가는 소음. 달리기·휘두르기 바람 소리다
  private whoosh(audio: AudioContext, out: AudioNode, at: number, from: number, to: number, sec: number): void {
    if (!this.noise) return;
    const source = audio.createBufferSource();
    source.buffer = this.noise;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + sec * 0.7);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.8, at + sec * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + sec);
    source.connect(filter).connect(gain).connect(out);
    source.start(at, Math.random() * 0.4);
    source.stop(at + sec + 0.02);
  }

  //금속끼리 부딪히는 소리. 어긋난 배음 몇 개가 따로 사그라든다
  private metal(audio: AudioContext, out: AudioNode, at: number, pitch: number, sec: number): void {
    const partials = [520, 1230, 1870, 2750, 3910];
    partials.forEach((hz, i) => {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz * pitch;
      const env = this.envelope(audio, at, 0.35 / (i + 1), sec * (1 - i * 0.12));
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + sec + 0.02);
    });
    this.burst(audio, out, at, 'highpass', 2400, 0.05, 0.9);
  }
}
