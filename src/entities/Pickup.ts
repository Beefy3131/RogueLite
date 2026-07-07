import Phaser from 'phaser';
import { PICKUPS } from '../config/balance';
import type { Player } from './Player';

export type PickupKind = 'heal' | 'magnet' | 'gold' | 'chest';

const TEXTURES: Record<PickupKind, string> = {
  heal: 'pickup-heal',
  magnet: 'pickup-magnet',
  gold: 'pickup-gold',
  chest: 'pickup-chest',
};

/**
 * Pooled pickup dropped by elites/bosses (spec §7): heal (+HP), magnet-all
 * (every gem on the map flies in), or a gold cache. Collected on touch.
 * Emits 'pickup-collected' (pickup, kind).
 */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  kind: PickupKind = 'heal';
  /** Gold caches carry their value. */
  value = 0;
  private target: Player | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'pickup-heal');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(4);
    this.disableBody(true, true);
  }

  spawn(x: number, y: number, kind: PickupKind, target: Player, value = 0): this {
    this.enableBody(true, x, y, true, true);
    this.kind = kind;
    this.value = value;
    this.setTexture(TEXTURES[kind]);
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
    if (dx * dx + dy * dy <= PICKUPS.collectDistance * PICKUPS.collectDistance) {
      this.scene.events.emit('pickup-collected', this, this.kind);
    }
  }
}
