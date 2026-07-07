import Phaser from 'phaser';
import { COLLISION, PROJECTILE } from '../config/balance';
import type { CollisionGrid } from '../systems/CollisionGrid';
import { Enemy } from './Enemy';
import type { Player } from './Player';

export interface ProjectileConfig {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  pierce: number;
  texture?: string;
  lifetimeMs?: number;
  /**
   * linear   — flies straight, hits enemies via the grid (default)
   * boomerang — decelerates out, then homes back to the player; re-hits on return
   * hostile  — enemy shot: ignores enemies, damages the player on contact
   */
  mode?: 'linear' | 'boomerang' | 'hostile';
  grid?: CollisionGrid<Enemy> | null;
  player?: Player | null;
  /** Boomerang: outbound distance. */
  range?: number;
  /** Called for each enemy hit (after damage) — Fireball burn / Venom poison. */
  onHit?: (enemy: Enemy) => void;
}

/**
 * Pooled projectile for players AND enemies. Emits 'projectile-done' when
 * spent so GameScene can release it.
 */
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  private damage = 0;
  private pierceLeft = 0;
  private lifeMs = 0;
  private mode: 'linear' | 'boomerang' | 'hostile' = 'linear';
  private grid: CollisionGrid<Enemy> | null = null;
  private player: Player | null = null;
  private speed = 0;
  private outTimeMs = 0; // boomerang: length of outbound leg
  private flightMs = 0;
  private returning = false;
  private done = false;
  private onHit: ((enemy: Enemy) => void) | null = null;
  private readonly alreadyHit: Enemy[] = [];
  private readonly queryBuffer: Enemy[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'projectile');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(8);
    this.disableBody(true, true);
  }

  fire(cfg: ProjectileConfig): this {
    this.enableBody(true, cfg.x, cfg.y, true, true);
    this.setTexture(cfg.texture ?? 'projectile');
    this.setRotation(cfg.angle);
    this.setVelocity(Math.cos(cfg.angle) * cfg.speed, Math.sin(cfg.angle) * cfg.speed);
    this.damage = cfg.damage;
    this.pierceLeft = cfg.pierce;
    this.lifeMs = cfg.lifetimeMs ?? PROJECTILE.lifetimeMs;
    this.mode = cfg.mode ?? 'linear';
    this.grid = cfg.grid ?? null;
    this.player = cfg.player ?? null;
    this.speed = cfg.speed;
    this.flightMs = 0;
    this.returning = false;
    this.done = false;
    this.onHit = cfg.onHit ?? null;
    this.alreadyHit.length = 0;
    // Outbound leg: average speed is speed/2 while decelerating to zero.
    this.outTimeMs = cfg.range !== undefined ? (cfg.range / (cfg.speed / 2)) * 1000 : 0;
    return this;
  }

  despawn(): void {
    this.disableBody(true, true);
    this.grid = null;
    this.player = null;
    this.onHit = null;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.scene.events.emit('projectile-done', this);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.active || this.done) return;

    this.lifeMs -= delta;
    if (this.lifeMs <= 0) {
      this.finish();
      return;
    }

    if (this.mode === 'hostile') {
      this.updateHostile();
      return;
    }
    if (this.mode === 'boomerang') {
      this.updateBoomerangMotion(delta);
      this.setRotation(this.rotation + delta * 0.02); // spin
    }
    this.hitEnemies();
  }

  private updateHostile(): void {
    const p = this.player;
    if (!p) return;
    const hitDist = COLLISION.playerRadius + 5;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      p.takeDamage(this.damage);
      this.finish();
    }
  }

  private updateBoomerangMotion(delta: number): void {
    this.flightMs += delta;
    if (!this.returning) {
      // Decelerate linearly to zero over the outbound leg.
      const t = Math.min(this.flightMs / this.outTimeMs, 1);
      const factor = 1 - t;
      const body = this.body as Phaser.Physics.Arcade.Body;
      const len = Math.hypot(body.velocity.x, body.velocity.y) || 1;
      this.setVelocity((body.velocity.x / len) * this.speed * factor, (body.velocity.y / len) * this.speed * factor);
      if (t >= 1) {
        this.returning = true;
        this.alreadyHit.length = 0; // both legs hit (spec §5: pierces both ways)
      }
    } else {
      const p = this.player;
      if (!p) {
        this.finish();
        return;
      }
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 26) {
        this.finish();
        return;
      }
      const returnSpeed = this.speed * 1.15;
      this.setVelocity((dx / dist) * returnSpeed, (dy / dist) * returnSpeed);
    }
  }

  private hitEnemies(): void {
    if (!this.grid) return;
    const hitDist = PROJECTILE.radius + COLLISION.enemyRadius;
    const candidates = this.grid.queryArea(this.x, this.y, hitDist + 12, this.queryBuffer);
    for (const enemy of candidates) {
      if (!enemy.active || this.alreadyHit.includes(enemy)) continue;
      const reach = PROJECTILE.radius + enemy.bodyRadius;
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      if (dx * dx + dy * dy > reach * reach) continue;

      this.alreadyHit.push(enemy);
      enemy.takeDamage(this.damage, this.x, this.y);
      if (enemy.active) this.onHit?.(enemy);
      if (this.mode !== 'boomerang') {
        if (this.pierceLeft <= 0) {
          this.finish();
          return;
        }
        this.pierceLeft--;
      }
    }
  }
}
