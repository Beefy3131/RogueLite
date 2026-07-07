import { saveManager } from './SaveManager';

export type SfxKey =
  | 'click'
  | 'gem'
  | 'pickup'
  | 'enemy-death'
  | 'player-hurt'
  | 'level-up'
  | 'boss-spawn'
  | 'purchase'
  | 'revive'
  | 'victory'
  | 'defeat';

/** Per-key minimum ms between plays — enemy deaths must not machine-gun (spec §14). */
const THROTTLE_MS: Partial<Record<SfxKey, number>> = {
  'enemy-death': 70,
  gem: 60,
  'player-hurt': 150,
};

/**
 * Master/SFX/music mixer with persisted volumes (spec §14). All sounds are
 * WebAudio-synthesized placeholders — zero asset payload, fully offline —
 * behind named hooks (`play('enemy-death')`), so real audio files can replace
 * the synth bodies later without touching call sites.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private readonly lastPlayed = new Map<SfxKey, number>();
  private musicNodes: AudioNode[] = [];
  muted = false;

  /** Browsers gate AudioContext behind a user gesture — resume on first input. */
  attachUnlock(): void {
    const unlock = () => {
      this.ensureCtx();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensureCtx(): boolean {
    if (this.ctx) return true;
    try {
      this.ctx = new AudioContext();
    } catch {
      return false; // no audio support — game plays silent
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.applyVolumes();
    return true;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const s = saveManager.data.settings;
    this.masterGain.gain.value = this.muted ? 0 : s.masterVolume;
    this.sfxGain.gain.value = s.sfxVolume;
    this.musicGain.gain.value = s.musicVolume * 0.4; // music sits under the SFX
  }

  setVolume(kind: 'masterVolume' | 'sfxVolume' | 'musicVolume', value: number): void {
    saveManager.data.settings[kind] = Math.min(1, Math.max(0, Math.round(value * 10) / 10));
    saveManager.save();
    this.applyVolumes();
  }

  getVolume(kind: 'masterVolume' | 'sfxVolume' | 'musicVolume'): number {
    return saveManager.data.settings[kind];
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  play(key: SfxKey): void {
    if (!this.ensureCtx() || this.ctx!.state !== 'running') return;
    const now = performance.now();
    const throttle = THROTTLE_MS[key] ?? 0;
    if (throttle && now - (this.lastPlayed.get(key) ?? -1e9) < throttle) return;
    this.lastPlayed.set(key, now);

    const rnd = Math.random();
    switch (key) {
      case 'click':
        this.tone(700, 45, 'square', { gain: 0.05 });
        break;
      case 'gem':
        // Randomized pitch so streams of pickups shimmer instead of beeping.
        this.tone(650 + rnd * 250, 70, 'sine', { to: 1100 + rnd * 200, gain: 0.06 });
        break;
      case 'pickup':
        this.tone(420, 90, 'triangle', { to: 840 });
        this.tone(840, 130, 'triangle', { delayMs: 70, gain: 0.1 });
        break;
      case 'enemy-death':
        // Randomized pitch (spec §14): ±35% so 200 deaths/sec reads as texture.
        this.tone(200 * (0.75 + rnd * 0.6), 90, 'square', { to: 55, gain: 0.06 });
        break;
      case 'player-hurt':
        this.tone(220, 170, 'sawtooth', { to: 70, gain: 0.16 });
        break;
      case 'level-up':
        this.tone(523, 110, 'triangle');
        this.tone(659, 110, 'triangle', { delayMs: 70 });
        this.tone(784, 160, 'triangle', { delayMs: 140 });
        break;
      case 'boss-spawn':
        this.tone(55, 750, 'sawtooth', { to: 38, gain: 0.24 });
        this.tone(110, 520, 'square', { delayMs: 120, to: 70, gain: 0.1 });
        break;
      case 'purchase':
        this.tone(880, 80, 'sine');
        this.tone(1175, 130, 'sine', { delayMs: 80 });
        break;
      case 'revive':
        this.tone(392, 110, 'triangle');
        this.tone(523, 110, 'triangle', { delayMs: 80 });
        this.tone(659, 180, 'triangle', { delayMs: 160 });
        break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 160, 'triangle', { delayMs: i * 130 }));
        break;
      case 'defeat':
        this.tone(300, 420, 'sawtooth', { to: 150, gain: 0.14 });
        this.tone(200, 500, 'sawtooth', { delayMs: 150, to: 90, gain: 0.12 });
        break;
    }
  }

  /** Per-map ambient drone (spec §14: BGM per map, looped). */
  playMusic(mapId: string): void {
    if (!this.ensureCtx()) return;
    this.stopMusic();
    const ctx = this.ctx!;
    const root = mapId === 'graveyard' ? 87.31 : 110; // F2 (dark) vs A2 (warm)

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(this.musicGain);

    // Slow LFO breathes the filter so the drone doesn't feel static.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const voices: Array<[number, OscillatorType, number]> = [
      [root, 'triangle', 0.07],
      [root * 1.5, 'sine', 0.045], // fifth
      [root * 2.02, 'sine', 0.03], // slightly detuned octave
    ];
    for (const [freq, type, gain] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      this.musicNodes.push(osc, g);
    }
    this.musicNodes.push(filter, lfo, lfoGain);
  }

  stopMusic(): void {
    for (const node of this.musicNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        node.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.musicNodes = [];
  }

  get musicPlaying(): boolean {
    return this.musicNodes.length > 0;
  }

  private tone(
    freq: number,
    durMs: number,
    type: OscillatorType,
    opts: { to?: number; gain?: number; delayMs?: number } = {},
  ): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    const dur = durMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.11, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const audio = new AudioManager();
