import Phaser from 'phaser';
import { LIMITS } from '../config/balance';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  gravity: number;
  lifeMs: number;
  maxLifeMs: number;
  scaleStart: number;
  scaleEnd: number;
  active: boolean;
}

/** Textured burst options — everything defaults to the classic pixel burst. */
export interface BurstOpts {
  texture?: string; // Kenney particle key ('p-…') or 'pixel'
  count: number;
  /** Single tint, or a palette to pick from per particle. */
  color?: number;
  colors?: number[];
  speedMin?: number;
  speedMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  scaleStart?: number;
  scaleEnd?: number;
  /** Additive blend — glows, embers, magic. */
  add?: boolean;
  /** px/s² downward (negative = floats up, e.g. embers). */
  gravity?: number;
  alpha?: number;
}

/**
 * Lightweight sprite-based bursts with a hard cap (spec §2 item 7) — no
 * unbounded Phaser particle emitters. Supports tinted pixel squares (legacy)
 * and soft Kenney textures with scale/blend/gravity (Phase-9 juice).
 */
export class ParticlePool {
  private readonly items: Particle[] = [];
  private activeCount = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Classic tinted-square burst (enemy deaths etc.). */
  burst(x: number, y: number, color: number, count: number): void {
    this.burstFx(x, y, { count, color, texture: 'pixel', scaleStart: 3.2, scaleEnd: 1.2 });
  }

  burstFx(x: number, y: number, opts: BurstOpts): void {
    const {
      texture = 'pixel',
      count,
      speedMin = 60,
      speedMax = 190,
      lifeMin = 320,
      lifeMax = 540,
      scaleStart = 0.1,
      scaleEnd = 0.03,
      add = false,
      gravity = 0,
      alpha = 1,
    } = opts;

    for (let i = 0; i < count; i++) {
      if (this.activeCount >= LIMITS.maxParticles) return; // cap the chaos
      let p = this.items.find(it => !it.active);
      if (!p) {
        if (this.items.length >= LIMITS.maxParticles) return;
        p = {
          img: this.scene.add.image(0, 0, texture).setDepth(7).setVisible(false),
          vx: 0,
          vy: 0,
          gravity: 0,
          lifeMs: 0,
          maxLifeMs: 0,
          scaleStart: 1,
          scaleEnd: 1,
          active: false,
        };
        this.items.push(p);
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = gravity;
      p.maxLifeMs = lifeMin + Math.random() * (lifeMax - lifeMin);
      p.lifeMs = p.maxLifeMs;
      p.scaleStart = scaleStart * (0.8 + Math.random() * 0.4);
      p.scaleEnd = scaleEnd;
      p.active = true;
      this.activeCount++;

      const tint = opts.colors
        ? opts.colors[(Math.random() * opts.colors.length) | 0]
        : (opts.color ?? 0xffffff);
      p.img
        .setTexture(texture)
        .setPosition(x, y)
        .setScale(p.scaleStart)
        .setTint(tint)
        .setAlpha(alpha)
        .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setVisible(true);
    }
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const drag = Math.pow(0.05, dt); // heavy air resistance
    for (const p of this.items) {
      if (!p.active) continue;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) {
        p.active = false;
        this.activeCount--;
        p.img.setVisible(false);
        continue;
      }
      p.vx *= drag;
      p.vy *= drag;
      p.vy += p.gravity * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      const t = p.lifeMs / p.maxLifeMs; // 1 → 0
      p.img.setAlpha(t);
      p.img.setScale(p.scaleEnd + (p.scaleStart - p.scaleEnd) * t);
    }
  }

  get active(): number {
    return this.activeCount;
  }
}
