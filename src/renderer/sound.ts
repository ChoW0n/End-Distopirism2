//합성 소리 (SPEC-005 §7.5)
//
//녹음 소리가 없어서 웹 오디오로 즉석 합성하는 자리표시다. 원작 소리는 쓰지 않는다.
//렌더러는 이름(SoundCue)만 부른다. 녹음 소리가 들어오면 이 파일만 바꾼다

import { SOUND_CUES, type SoundCue, type SoundData } from '../ui/data.js';

//렌더러가 쓰는 쪽. 테스트나 소리 없는 환경에서는 아무것도 안 하는 것으로 갈아 끼운다
export interface SoundPlayer {
  play(cue: SoundCue): void;
  //녹음 소리 한 번. 없거나 아직 못 풀었으면 false (SPEC-005 §14)
  //delay 초 뒤에 튼다(앞당겨 예약하는 쪽이 계산한다). pan 은 -1(왼쪽)~1(오른쪽)
  playSample?(id: string, gain?: number, options?: SampleOptions): boolean;
}

//녹음 소리 재생 선택지
export interface SampleOptions {
  delay?: number;
  pan?: number;
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
  //녹음 소리. 열리기 전에 받은 것은 열릴 때 푼다
  private readonly pending = new Map<string, ArrayBuffer>();
  private readonly samples = new Map<string, AudioBuffer>();

  //세기는 데이터에서 받는다. 소리 모양은 아래 조리법이 정한다
  constructor(private readonly data: SoundData) {
    this.recipes = {
      dash: (a, o, t) => this.whoosh(a, o, t, 700, 2600, 0.24),
      //카드가 머리 위에서 돈다
      flip: (a, o, t) => {
        this.ping(a, o, t, 2500, 0.07, 0.5);
        this.ping(a, o, t + 0.02, 3700, 0.05, 0.3);
      },
      clash: (a, o, t) => this.metal(a, o, t, 1, 0.55),
      clashTie: (a, o, t) => this.metal(a, o, t, 0.8, 0.35),
      //카드 면이 드러나는 '띵!'. 맑은 종소리 두 겹
      reveal: (a, o, t) => {
        this.ping(a, o, t, 1760, 0.45, 0.9);
        this.ping(a, o, t, 3520, 0.3, 0.35);
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
    //아이폰은 무음 스위치가 켜져 있으면 웹 소리를 끈다. 게임 소리는 재생 소리로 분류해 스위치와 상관없이 낸다
    const session = (globalThis.navigator as { audioSession?: { type: string } } | undefined)?.audioSession;
    if (session) session.type = 'playback';
    if (this.audio.state !== 'running') {
      void this.audio.resume().catch(() => undefined);
      //사용자 입력 안에서 빈 소리를 한 번 내야 풀리는 브라우저가 있다 (아이폰 사파리)
      const silent = this.audio.createBufferSource();
      silent.buffer = this.audio.createBuffer(1, 1, 22050);
      silent.connect(this.audio.destination);
      silent.start(0);
    }
    this.decodePending();
  }

  //소리가 실제로 나는 상태인지. 잠겨 있으면 화면에 눌러 켜라고 알린다
  get running(): boolean {
    return this.audio?.state === 'running';
  }

  //녹음 소리를 받아 둔다 (WAV 바이트). 소리가 열려 있으면 바로 푼다
  addSample(id: string, data: ArrayBuffer): void {
    this.pending.set(id, data);
    this.decodePending();
  }

  private decodePending(): void {
    const audio = this.audio;
    if (!audio) return;
    for (const [id, data] of this.pending) {
      this.pending.delete(id);
      audio.decodeAudioData(data).then(
        (buffer) => this.samples.set(id, buffer),
        () => undefined,
      );
    }
  }

  //녹음 소리 한 번. 못 내면 false 라 부른 쪽이 합성 소리로 대신한다
  playSample(id: string, gain = 1, options: SampleOptions = {}): boolean {
    const audio = this.audio;
    const buffer = this.samples.get(id);
    if (!audio || !this.master || !buffer) return false;
    if (this.muted || audio.state !== 'running') return true;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const out = audio.createGain();
    out.gain.value = gain;
    source.connect(out);
    //좌우 자리 (SPEC-005 §15 H08). 패너가 없는 브라우저는 가운데
    const pan = Math.max(-1, Math.min(1, options.pan ?? 0));
    if (pan !== 0 && typeof audio.createStereoPanner === 'function') {
      const panner = audio.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      panner.connect(this.master);
    } else {
      out.connect(this.master);
    }
    source.start(audio.currentTime + 0.005 + Math.max(0, options.delay ?? 0));
    return true;
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
