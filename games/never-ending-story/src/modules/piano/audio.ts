/** Web Audio piano-ish synth. No samples: two oscillators and an envelope per voice. */
import { midiFreq } from './notes.ts';

type Voice = { gain: GainNode; oscs: OscillatorNode[]; started: number };

const MAX_VOICES = 24;

export class PianoAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, Voice>();
  muted = false;

  /** Create the context on first use (needs a user gesture on most browsers). */
  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    const comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Start a note. `id` identifies the finger or key so `release(id)` stops the same voice. */
  noteOn(id: string, midi: number): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.release(id, 0.03);
    if (this.voices.size >= MAX_VOICES) {
      const oldest = [...this.voices.entries()].sort((a, b) => a[1].started - b[1].started)[0];
      if (oldest) this.release(oldest[0], 0.03);
    }
    const now = ctx.currentTime;
    const freq = midiFreq(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = freq;
    const bright = ctx.createOscillator();
    bright.type = 'sine';
    bright.frequency.value = freq * 2;
    const brightGain = ctx.createGain();
    brightGain.gain.setValueAtTime(0.45, now);
    brightGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    bright.connect(brightGain);
    brightGain.connect(gain);
    tone.connect(gain);
    gain.connect(this.master);
    tone.start(now);
    bright.start(now);
    tone.stop(now + 2.3);
    bright.stop(now + 2.3);
    this.voices.set(id, { gain, oscs: [tone, bright], started: now });
    tone.onended = () => {
      if (this.voices.get(id)?.gain === gain) this.voices.delete(id);
      gain.disconnect();
    };
  }

  /** Let go of a key: a short release, never a click. */
  release(id: string, seconds = 0.22): void {
    const voice = this.voices.get(id);
    const ctx = this.ctx;
    if (!voice || !ctx) return;
    this.voices.delete(id);
    const now = ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      voice.oscs.forEach((osc) => osc.stop(now + seconds + 0.02));
    } catch {
      // The voice already ended.
    }
  }

  releaseAll(): void {
    for (const id of [...this.voices.keys()]) this.release(id, 0.08);
  }

  setMuted(next: boolean): void {
    this.muted = next;
    if (next) this.releaseAll();
  }

  dispose(): void {
    this.releaseAll();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
