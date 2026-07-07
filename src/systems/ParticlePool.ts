import Phaser from 'phaser';
import { LIMITS } from '../config/balance';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  active: boolean;
}

/**
 * Lightweight sprite-based bursts with a hard cap (spec §2 item 7) — no
 * unbounded Phaser particle emitters. Tinted 1px squares flying outward.
 */
export class ParticlePool {
  private readonly items: Particle[] = [];
  private activeCount = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= LIMITS.maxParticles) return; // cap the chaos
      let p = this.items.find(it => !it.active);
      if (!p) {
        if (this.items.length >= LIMITS.maxParticles) return;
        p = {
          img: this.scene.add.image(0, 0, 'pixel').setDepth(7).setVisible(false),
          vx: 0,
          vy: 0,
          lifeMs: 0,
          maxLifeMs: 0,
          active: false,
        };
        this.items.push(p);
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 130;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLifeMs = 320 + Math.random() * 220;
      p.lifeMs = p.maxLifeMs;
      p.active = true;
      this.activeCount++;
      p.img.setPosition(x, y).setScale(2.5 + Math.random() * 1.5).setTint(color).setAlpha(1).setVisible(true);
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
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.setAlpha(p.lifeMs / p.maxLifeMs);
    }
  }

  get active(): number {
    return this.activeCount;
  }
}
