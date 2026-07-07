import Phaser from 'phaser';
import { ULT_DEFS, ULTIMATE } from '../config/balance';
import type { CharacterDef } from '../config/characters';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { Projectile } from '../entities/Projectile';
import { audio } from './AudioManager';
import type { CollisionGrid } from './CollisionGrid';
import type { FlashPool } from './FlashPool';
import type { ObjectPool } from './ObjectPool';
import type { ParticlePool } from './ParticlePool';

type UltId = keyof typeof ULT_DEFS;

/**
 * Per-character ultimate ability: charged by kills (ULTIMATE.killsToCharge),
 * fired with SPACE or the HUD corner button, scaling with the run level.
 * Emits 'hud-ult' (chargeFraction, ready, activeFraction) for the HUD ring.
 * Durations tick in update() so pauses (level-up) freeze active ults too.
 */
export class UltimateSystem {
  private kills = 0;
  private level = 1;
  private activeMsLeft = 0;
  private activeDurationMs = 1;
  private volleyTimerMs = 0;
  private wispFireTimerMs = 0;
  private wispAngle = 0;
  private trailTimerMs = 0;
  private wisp: Phaser.GameObjects.Image | null = null;
  private readonly queryBuffer: Enemy[] = [];
  private readonly ultId: UltId | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    character: CharacterDef,
    private readonly enemies: ObjectPool<Enemy>,
    private readonly grid: CollisionGrid<Enemy>,
    private readonly projectiles: ObjectPool<Projectile>,
    private readonly particles: ParticlePool,
    private readonly explosionFx: FlashPool,
  ) {
    this.ultId = character.id in ULT_DEFS ? (character.id as UltId) : null;
  }

  get chargeFraction(): number {
    return Math.min(1, this.kills / ULTIMATE.killsToCharge);
  }

  get isActive(): boolean {
    return this.activeMsLeft > 0;
  }

  get ready(): boolean {
    return !this.isActive && this.kills >= ULTIMATE.killsToCharge;
  }

  /** Every kill charges the meter; Warden's active ult also heals per kill. */
  onKill(): void {
    if (!this.ultId) return;
    if (this.isActive && this.ultId === 'warden') {
      const cfg = ULT_DEFS.warden;
      this.player.heal(cfg.healPerKill + cfg.healPerLevel * (this.level - 1));
    }
    if (this.kills < ULTIMATE.killsToCharge) {
      this.kills++;
      if (this.ready) audio.play('ult-ready');
      this.emitHud();
    }
  }

  tryActivate(level: number): boolean {
    if (!this.ultId || !this.ready) return false;
    this.level = level;
    this.kills = 0;
    audio.play('ult-fire');

    switch (this.ultId) {
      case 'bomber':
        this.nova(); // instant — no active window
        break;
      case 'brute': {
        const cfg = ULT_DEFS.brute;
        this.begin(Math.min(cfg.maxDurationMs, cfg.durationMs + cfg.durationPerLevelMs * (level - 1)));
        this.player.ultShield = true;
        this.player.setTint(0xffd54f); // gold while unbreakable
        break;
      }
      case 'dasher': {
        const cfg = ULT_DEFS.dasher;
        this.begin(cfg.durationMs);
        this.player.ultSpeedMult = cfg.speedMult + cfg.speedMultPerLevel * (level - 1);
        break;
      }
      case 'ranger':
        this.begin(ULT_DEFS.ranger.durationMs);
        this.volleyTimerMs = 0;
        break;
      case 'conjurer':
        this.begin(ULT_DEFS.conjurer.durationMs);
        this.wispFireTimerMs = 0;
        this.showWisp();
        break;
      case 'warden':
        this.begin(ULT_DEFS.warden.durationMs);
        this.player.setTint(0x80ffbf); // soul-green while harvesting
        break;
    }
    this.emitHud();
    return true;
  }

  update(delta: number): void {
    if (!this.isActive) return;
    this.activeMsLeft -= delta;

    if (this.ultId === 'ranger') {
      this.volleyTimerMs -= delta;
      while (this.volleyTimerMs <= 0) {
        this.volleyTimerMs += ULT_DEFS.ranger.volleyIntervalMs;
        this.fireVolley();
      }
    } else if (this.ultId === 'conjurer') {
      this.updateWisp(delta);
    } else if (this.ultId === 'dasher') {
      this.trailTimerMs -= delta;
      if (this.trailTimerMs <= 0) {
        this.trailTimerMs = 120;
        this.particles.burst(this.player.x, this.player.y, 0xffee58, 3);
      }
    }

    if (this.activeMsLeft <= 0) this.end();
    this.emitHud();
  }

  private begin(durationMs: number): void {
    this.activeDurationMs = durationMs;
    this.activeMsLeft = durationMs;
  }

  private end(): void {
    this.activeMsLeft = 0;
    this.player.ultShield = false;
    this.player.ultSpeedMult = 1;
    this.player.setTint(this.player.character.tint);
    if (this.wisp) this.wisp.setVisible(false);
  }

  /** Bomber: point-blank explosion out from the player. */
  private nova(): void {
    const cfg = ULT_DEFS.bomber;
    const radius = cfg.radius + cfg.radiusPerLevel * this.level;
    const damage = Math.round(cfg.damage + cfg.damagePerLevel * (this.level - 1));
    const { x, y } = this.player;
    this.explosionFx.show(x, y, radius / 40);
    this.particles.burst(x, y, 0xffa726, 30);
    this.scene.cameras.main.shake(250, 0.008);
    // Snapshot: kills release() from the pool (swap-remove) mid-iteration.
    for (const enemy of [...this.enemies.active]) {
      if (!enemy.active) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const reach = radius + enemy.bodyRadius;
      if (dx * dx + dy * dy <= reach * reach) enemy.takeDamage(damage, x, y);
    }
  }

  /** Ranger: arrows rain toward random on-screen enemies (or the facing dir). */
  private fireVolley(): void {
    const cfg = ULT_DEFS.ranger;
    const damage = Math.round(cfg.damage + cfg.damagePerLevel * (this.level - 1));
    for (let i = 0; i < cfg.arrowsPerVolley; i++) {
      const target = this.randomVisibleEnemy();
      const angle = target
        ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
        : Math.atan2(this.player.facing.y, this.player.facing.x) + (Math.random() - 0.5) * 1.4;
      this.projectiles.acquire().fire({
        x: this.player.x,
        y: this.player.y,
        angle: angle + (Math.random() - 0.5) * 0.12,
        speed: cfg.projectileSpeed,
        damage,
        pierce: 1,
        texture: 'projectile',
        grid: this.grid,
      });
    }
  }

  private randomVisibleEnemy(): Enemy | null {
    const list = this.enemies.active;
    if (list.length === 0) return null;
    for (let tries = 0; tries < 6; tries++) {
      const enemy = list[(Math.random() * list.length) | 0];
      if (enemy?.active && enemy.visible) return enemy;
    }
    return null;
  }

  /** Conjurer: an orbiting wisp that shoots the nearest enemy in range. */
  private showWisp(): void {
    if (!this.wisp) {
      this.wisp = this.scene.add.image(this.player.x, this.player.y, 'player').setScale(0.55).setTint(0xce93d8).setDepth(11);
    }
    this.wisp.setVisible(true);
  }

  private updateWisp(delta: number): void {
    const cfg = ULT_DEFS.conjurer;
    const wisp = this.wisp!;
    this.wispAngle += delta * 0.003;
    wisp.setPosition(this.player.x + Math.cos(this.wispAngle) * 46, this.player.y + Math.sin(this.wispAngle) * 46);

    this.wispFireTimerMs -= delta;
    if (this.wispFireTimerMs > 0) return;
    this.wispFireTimerMs += cfg.fireIntervalMs;

    let nearest: Enemy | null = null;
    let nearestD2 = cfg.range * cfg.range;
    for (const enemy of this.grid.queryArea(wisp.x, wisp.y, cfg.range, this.queryBuffer)) {
      if (!enemy.active) continue;
      const dx = enemy.x - wisp.x;
      const dy = enemy.y - wisp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearest = enemy;
      }
    }
    if (!nearest) return;
    this.projectiles.acquire().fire({
      x: wisp.x,
      y: wisp.y,
      angle: Math.atan2(nearest.y - wisp.y, nearest.x - wisp.x),
      speed: cfg.projectileSpeed,
      damage: Math.round(cfg.damage + cfg.damagePerLevel * (this.level - 1)),
      pierce: 0,
      texture: 'projectile',
      grid: this.grid,
    });
  }

  private emitHud(): void {
    this.scene.events.emit(
      'hud-ult',
      this.chargeFraction,
      this.ready,
      this.isActive ? this.activeMsLeft / this.activeDurationMs : 0,
    );
  }
}
