import Phaser from 'phaser';
import { GEMS, PLAYER } from '../config/balance';
import type { Player } from './Player';

/**
 * Pooled XP gem: sits where the enemy died, flies to the player once inside
 * the (magnet-modified) pickup radius. Emits 'gem-collected' (gem, value).
 */
export class XPGem extends Phaser.Physics.Arcade.Sprite {
  value = 1;
  /** Set by the magnet-all pickup: fly to the player regardless of radius. */
  forceMagnet = false;
  private target: Player | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'gem');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.disableBody(true, true);
  }

  spawn(x: number, y: number, value: number, target: Player): this {
    this.enableBody(true, x, y, true, true);
    this.value = value;
    this.forceMagnet = false;
    this.target = target;
    return this;
  }

  despawn(): void {
    this.disableBody(true, true);
    this.target = null;
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.active || !this.target) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= GEMS.collectDistance) {
      this.scene.events.emit('gem-collected', this, this.value);
      return;
    }
    const magnetRadius = PLAYER.pickupRadius * this.target.stats.magnetMult;
    if (this.forceMagnet || dist <= magnetRadius) {
      this.setVelocity((dx / dist) * GEMS.magnetSpeed, (dy / dist) * GEMS.magnetSpeed);
    } else {
      this.setVelocity(0, 0);
    }
  }
}
