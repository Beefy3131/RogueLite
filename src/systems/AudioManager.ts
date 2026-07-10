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
  | 'defeat'
  | 'ult-ready'
  | 'ult-fire';

/** Per-key minimum ms between plays — enemy deaths must not machine-gun (spec §14). */
const THROTTLE_MS: Partial<Record<SfxKey, number>> = {
  'enemy-death': 70,
  gem: 60,
  'player-hurt': 150,
};

/**
 * Real audio samples (Kenney CC0, public/assets/audio/sfx). Keys listed here
 * play a random variant instead of their synth body once decoded; everything
 * else keeps the synth. Missing/undecoded files silently fall back to synth.
 */
const SFX_SAMPLES: Partial<Record<SfxKey, { files: string[]; gain: number; pitchJitter: number }>> = {
  click: { files: ['sfx-click'], gain: 0.35, pitchJitter: 0.05 },
  'enemy-death': { files: ['sfx-squish0', 'sfx-squish1', 'sfx-squish2'], gain: 0.5, pitchJitter: 0.25 },
  'player-hurt': { files: ['sfx-punch'], gain: 0.65, pitchJitter: 0.1 },
  purchase: { files: ['sfx-coins'], gain: 0.6, pitchJitter: 0.08 },
  'boss-spawn': { files: ['sfx-bell'], gain: 0.75, pitchJitter: 0 },
};

/** All fetchable audio: sample name → URL (relative to the site root). */
const AUDIO_FILES: Record<string, string> = {
  'sfx-click': 'assets/audio/sfx/sfx-click.ogg',
  'sfx-squish0': 'assets/audio/sfx/sfx-squish0.ogg',
  'sfx-squish1': 'assets/audio/sfx/sfx-squish1.ogg',
  'sfx-squish2': 'assets/audio/sfx/sfx-squish2.ogg',
  'sfx-punch': 'assets/audio/sfx/sfx-punch.ogg',
  'sfx-coins': 'assets/audio/sfx/sfx-coins.ogg',
  'sfx-bell': 'assets/audio/sfx/sfx-bell.ogg',
  'music-menu': 'assets/audio/music-menu.mp3',
  'music-forest': 'assets/audio/music-forest.mp3',
  'music-graveyard': 'assets/audio/music-graveyard.ogg',
  'music-inferno': 'assets/audio/music-inferno.mp3',
  'music-astral': 'assets/audio/music-astral.ogg',
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
  private readonly buffers = new Map<string, AudioBuffer>();
  private loadKicked = false;
  private musicSource: AudioBufferSourceNode | null = null;
  private currentMusicId: string | null = null;
  muted = false;

  /**
   * Fetch + decode all real audio in the background (idempotent). Called from
   * PreloadScene; anything still undecoded when needed falls back to synth,
   * and the music upgrades itself mid-track once its file lands.
   */
  preloadFiles(): void {
    if (this.loadKicked || !this.ensureCtx()) return;
    this.loadKicked = true;
    for (const [name, url] of Object.entries(AUDIO_FILES)) {
      fetch(url)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then(data => this.ctx!.decodeAudioData(data))
        .then(buffer => {
          this.buffers.set(name, buffer);
          // If this track is what the synth drone is currently standing in
          // for, swap to the real thing.
          if (name === `music-${this.currentMusicId}` && this.musicNodes.length > 0) {
            const id = this.currentMusicId!;
            this.currentMusicId = null; // force restart
            this.playMusic(id);
          }
        })
        .catch(err => console.warn(`[audio] failed to load ${name}:`, err));
    }
  }

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

    // Real sample when decoded — synth body below otherwise.
    const sample = SFX_SAMPLES[key];
    if (sample) {
      const name = sample.files[(Math.random() * sample.files.length) | 0];
      const buffer = this.buffers.get(name);
      if (buffer) {
        const src = this.ctx!.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = 1 + (Math.random() * 2 - 1) * sample.pitchJitter;
        const g = this.ctx!.createGain();
        g.gain.value = sample.gain;
        src.connect(g);
        g.connect(this.sfxGain);
        src.start();
        return;
      }
    }

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
      case 'ult-ready':
        this.tone(660, 90, 'sine', { to: 1320, gain: 0.09 });
        this.tone(1320, 150, 'sine', { delayMs: 90, gain: 0.07 });
        break;
      case 'ult-fire':
        this.tone(150, 320, 'sawtooth', { to: 55, gain: 0.2 });
        this.tone(500, 140, 'square', { to: 950, gain: 0.07 });
        break;
    }
  }

  /**
   * Per-map music (spec §14): real looped tracks (OpenGameArt, see CREDITS)
   * once decoded; the synth drone stands in before that and swaps over
   * automatically when the file lands.
   */
  playMusic(mapId: string): void {
    if (!this.ensureCtx()) return;
    if (this.currentMusicId === mapId && this.musicPlaying) return; // already on
    this.stopMusic();
    this.currentMusicId = mapId;

    const buffer = this.buffers.get(`music-${mapId}`);
    if (buffer) {
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this.musicSource = src;
      return;
    }
    this.startSynthDrone(mapId);
  }

  /** WebAudio drone fallback — plays until (or unless) the real track decodes. */
  private startSynthDrone(mapId: string): void {
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
    if (this.musicSource) {
      try {
        this.musicSource.stop();
        this.musicSource.disconnect();
      } catch {
        /* already stopped */
      }
      this.musicSource = null;
    }
    for (const node of this.musicNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        node.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.musicNodes = [];
    this.currentMusicId = null;
  }

  get musicPlaying(): boolean {
    return this.musicNodes.length > 0 || this.musicSource !== null;
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
