import Phaser from 'phaser';
import { CULLING, ENEMY_BASE, TIME_SCALING, type EnemyKind } from '../config/balance';
import { ENEMY_LOOKS } from '../config/enemies';

/**
 * Pooled enemy, all 10 types + minis + boss (spec §7). One class, behavior
 * switched by kind. Scene events:
 *   'enemy-killed' (enemy)          — HP exhausted
 *   'enemy-shoot' (enemy, damage)   — shooter wants to fire
 *   'hud-boss' (hp, max)            — boss HP changed
 *
 * Off-screen culling (spec §2): outside camera + margin → invisible (skips
 * render) and re-aims only every 250ms.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  kind: EnemyKind = 'swarmer';
  hp = 1;
  maxHP = 1;
  contactDamage = 0;
  moveSpeed = 0;
  xpValue = 1;
  bodyRadius = 8;
  /** Orbit-shard re-hit gate (shared across shards). */
  orbitImmuneUntil = 0;
  /** Map props to push out of (set once by the pool factory). Ghosts ignore them. */
  obstacles: ReadonlyArray<{ x: number; y: number; r: number }> | null = null;

  private target: Phaser.GameObjects.Sprite | null = null;
  private retargetMs = 0;
  private flashUntil = 0;
  private wavePhase = 0;
  private shootTimerMs = 0;
  // Boss charge cycle.
  private bossPhase: 'roam' | 'telegraph' | 'charge' = 'roam';
  private bossPhaseMs = 0;
  private chargeDirX = 0;
  private chargeDirY = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, 'enemy-swarmer');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);
    this.disableBody(true, true); // pooled: starts inactive
  }

  /** Stats derive from ENEMY_BASE × run-minute scaling (spec §10). */
  spawn(x: number, y: number, kind: EnemyKind, minute: number, target: Phaser.GameObjects.Sprite, hpOverride?: number): this {
    const base = ENEMY_BASE[kind];
    const looks = ENEMY_LOOKS[kind];

    this.enableBody(true, x, y, true, true);
    this.kind = kind;
    this.setTexture(looks.texture);
    this.setAlpha(looks.alpha ?? 1);
    this.setRotation(0);
    this.bodyRadius = base.radius;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(base.radius);
    // Recenter the circle inside whatever frame size this texture has.
    body.setOffset(this.width / 2 - base.radius, this.height / 2 - base.radius);

    this.maxHP = hpOverride ?? TIME_SCALING.enemyHP(base.hp, minute);
    this.hp = this.maxHP;
    this.contactDamage = TIME_SCALING.enemyDamage(base.damage, minute);
    this.moveSpeed = base.speed;
    this.xpValue = base.xp;
    this.target = target;
    this.retargetMs = 0;
    this.flashUntil = 0;
    this.orbitImmuneUntil = 0;
    this.wavePhase = Math.random() * Math.PI * 2;
    this.shootTimerMs = 1000 + Math.random() * 1500; // stagger shooter volleys
    this.bossPhase = 'roam';
    this.bossPhaseMs = 0;
    this.setDepth(kind === 'boss' ? 6 : 5);
    this.clearTint();
    return this;
  }

  despawn(): void {
    this.disableBody(true, true);
    this.target = null;
  }

  /**
   * Apply weapon damage. Shielded enemies resist 70% from the front — pass
   * the damage source position so the facing check can run (spec §7).
   */
  takeDamage(amount: number, sourceX?: number, sourceY?: number): void {
    if (!this.active || this.hp <= 0) return;

    if (this.kind === 'shielded' && sourceX !== undefined && sourceY !== undefined) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 1) {
        const toSource = Math.atan2(sourceY! - this.y, sourceX! - this.x);
        const facing = Math.atan2(body.velocity.y, body.velocity.x);
        if (Math.abs(Phaser.Math.Angle.Wrap(toSource - facing)) < Math.PI / 2) {
          amount *= 1 - ENEMY_BASE.shielded.frontResist;
        }
      }
    }

    this.hp -= amount;
    if (this.visible) this.scene.events.emit('damage-dealt', this.x, this.y - this.bodyRadius, amount);
    if (this.kind === 'boss') this.scene.events.emit('hud-boss', Math.max(0, this.hp), this.maxHP);
    if (this.hp <= 0) {
      this.scene.events.emit('enemy-killed', this);
      return;
    }
    this.setTintFill(0xffffff);
    this.flashUntil = this.scene.time.now + 60;
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.active || !this.target) return;

    if (this.flashUntil > 0 && time >= this.flashUntil) {
      this.clearTint();
      this.flashUntil = 0;
    }

    const view = this.scene.cameras.main.worldView;
    const m = CULLING.margin;
    const onScreen =
      this.x > view.x - m && this.x < view.right + m && this.y > view.y - m && this.y < view.bottom + m;
    if (onScreen !== this.visible) this.setVisible(onScreen);

    if (!onScreen) {
      // Cheap mode: keep last velocity, re-aim sparsely.
      this.retargetMs -= delta;
      if (this.retargetMs <= 0) {
        this.chase(1);
        this.retargetMs = CULLING.offscreenRetargetMs;
      }
      return;
    }

    switch (this.kind) {
      case 'bat':
        this.moveErratic(time);
        break;
      case 'shooter':
        this.moveKeepDistance(delta);
        break;
      case 'boss':
        this.moveBoss(delta);
        break;
      default:
        this.chase(1);
        break;
    }

    if (ENEMY_LOOKS[this.kind].faceVelocity) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (Math.hypot(body.velocity.x, body.velocity.y) > 1) {
        this.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
      }
    }

    // Soft obstacles: push out of props. Ghosts phase through (spec §7).
    if (this.obstacles && this.kind !== 'ghost' && this.kind !== 'boss') {
      for (const o of this.obstacles) {
        const dx = this.x - o.x;
        const dy = this.y - o.y;
        const rr = o.r + this.bodyRadius;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          this.setPosition(o.x + (dx / d) * rr, o.y + (dy / d) * rr);
        }
      }
    }
  }

  private chase(speedMult: number): void {
    const t = this.target!;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      this.setVelocity((dx / len) * this.moveSpeed * speedMult, (dy / len) * this.moveSpeed * speedMult);
    } else {
      this.setVelocity(0, 0);
    }
  }

  /** Bat: chase direction + perpendicular sine weave. */
  private moveErratic(time: number): void {
    const t = this.target!;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const weave = Math.sin(time * 0.008 + this.wavePhase) * 0.9;
    let vx = nx + -ny * weave;
    let vy = ny + nx * weave;
    const vlen = Math.hypot(vx, vy) || 1;
    this.setVelocity((vx / vlen) * this.moveSpeed, (vy / vlen) * this.moveSpeed);
  }

  /** Shooter: hold ~keepDistance from the player, fire on a timer. */
  private moveKeepDistance(delta: number): void {
    const base = ENEMY_BASE.shooter;
    const t = this.target!;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > base.keepDistance + 30) {
      this.chase(1);
    } else if (dist < base.keepDistance - 30) {
      this.setVelocity((-dx / dist) * this.moveSpeed, (-dy / dist) * this.moveSpeed); // back away
    } else {
      this.setVelocity((-dy / dist) * this.moveSpeed * 0.4, (dx / dist) * this.moveSpeed * 0.4); // strafe
    }
    this.shootTimerMs -= delta;
    if (this.shootTimerMs <= 0) {
      this.shootTimerMs = base.fireIntervalSeconds * 1000;
      this.scene.events.emit('enemy-shoot', this, this.contactDamage);
    }
  }

  /** Boss: roam → telegraph (flash, stop) → charge at 3× speed (spec §7). */
  private moveBoss(delta: number): void {
    const base = ENEMY_BASE.boss;
    this.bossPhaseMs += delta;
    switch (this.bossPhase) {
      case 'roam':
        this.chase(1);
        if (this.bossPhaseMs >= base.chargeIntervalSeconds * 1000) {
          this.bossPhase = 'telegraph';
          this.bossPhaseMs = 0;
        }
        break;
      case 'telegraph': {
        this.setVelocity(0, 0);
        // Blink red while winding up.
        if (Math.floor(this.bossPhaseMs / 120) % 2 === 0) this.setTint(0xff5252);
        else this.clearTint();
        if (this.bossPhaseMs >= base.telegraphSeconds * 1000) {
          const t = this.target!;
          const dx = t.x - this.x;
          const dy = t.y - this.y;
          const len = Math.hypot(dx, dy) || 1;
          this.chargeDirX = dx / len;
          this.chargeDirY = dy / len;
          this.clearTint();
          this.bossPhase = 'charge';
          this.bossPhaseMs = 0;
        }
        break;
      }
      case 'charge':
        this.setVelocity(
          this.chargeDirX * this.moveSpeed * base.chargeSpeedMult,
          this.chargeDirY * this.moveSpeed * base.chargeSpeedMult,
        );
        if (this.bossPhaseMs >= base.chargeDurationSeconds * 1000) {
          this.bossPhase = 'roam';
          this.bossPhaseMs = 0;
        }
        break;
    }
  }
}
