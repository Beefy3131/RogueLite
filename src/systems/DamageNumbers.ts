import Phaser from 'phaser';
import { POOLS } from '../config/balance';

interface Entry {
  txt: Phaser.GameObjects.Text;
  lifeMs: number;
  active: boolean;
}

/**
 * Pooled floating damage numbers (spec §2 item 6): a fixed pool of 40 text
 * objects reused round-robin — overflow overwrites the oldest, which IS the
 * cap behavior. Zero allocation per hit.
 */
export class DamageNumbers {
  private readonly entries: Entry[] = [];
  private next = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < POOLS.damageNumbers; i++) {
      const txt = scene.add
        .text(0, 0, '', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(40)
        .setVisible(false);
      this.entries.push({ txt, lifeMs: 0, active: false });
    }
  }

  show(x: number, y: number, amount: number): void {
    const e = this.entries[this.next];
    this.next = (this.next + 1) % this.entries.length;
    e.txt
      .setText(String(Math.max(1, Math.round(amount))))
      .setPosition(x + (Math.random() - 0.5) * 12, y - 8)
      .setAlpha(1)
      .setVisible(true);
    e.lifeMs = 600;
    e.active = true;
  }

  update(deltaMs: number): void {
    const dy = (45 * deltaMs) / 1000;
    for (const e of this.entries) {
      if (!e.active) continue;
      e.lifeMs -= deltaMs;
      if (e.lifeMs <= 0) {
        e.active = false;
        e.txt.setVisible(false);
        continue;
      }
      e.txt.y -= dy;
      e.txt.setAlpha(Math.min(1, e.lifeMs / 350));
    }
  }
}
