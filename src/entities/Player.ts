import Phaser from 'phaser';
import { COLLISION, PLAYER, SHOP_UPGRADES } from '../config/balance';
import type { CharacterDef } from '../config/characters';
import { BASE_STATS, PASSIVES, type PlayerStats } from '../config/passives';
import type { InputManager } from '../systems/InputManager';
import { saveManager } from '../systems/SaveManager';

/**
 * The player. Stats = base × passives × character mods (spec §4/§6), rebuilt
 * from scratch on every change. Scene events: 'hud-hp', 'player-died'.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  maxHP = 0;
  hp = 0;
  stats: PlayerStats = { ...BASE_STATS };
  readonly character: CharacterDef;
  /** Last non-zero move direction; whips/knives aim along it. */
  readonly facing = new Phaser.Math.Vector2(1, 0);
  /** Hazard speed multiplier (graveyard fog sets this each frame). */
  hazardSlow = 1;
  /** Ultimate effects (UltimateSystem owns these). */
  ultShield = false;
  ultSpeedMult = 1;

  private invulnUntil = 0;
  private dead = false;
  private regenAccumulator = 0;
  private readonly inputManager: InputManager;

  /** Display scale for the 16×28 atlas frames (~27×48 px on screen). */
  static readonly SCALE = 1.7;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    inputManager: InputManager,
    character: CharacterDef,
  ) {
    super(scene, x, y, 'dungeon', `${character.sprite}_idle_anim_f0`);
    this.inputManager = inputManager;
    this.character = character;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);
    this.setScale(Player.SCALE);
    this.anims.play(`${character.sprite}-idle`);
    this.setCollideWorldBounds(true);
    // Body dims are unscaled-texture px (they scale with the sprite) — divide
    // so the world hit circle is exactly COLLISION.playerRadius.
    const r = COLLISION.playerRadius / Player.SCALE;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.recomputeStats(new Map());
    this.hp = this.maxHP;
  }

  get moveSpeed(): number {
    return PLAYER.moveSpeed * this.stats.speedMult * this.hazardSlow * this.ultSpeedMult;
  }

  /** Clamped heal (Warden ult, future sources). */
  heal(amount: number): void {
    if (this.dead || amount <= 0) return;
    this.hp = Math.min(this.maxHP, this.hp + amount);
    this.scene.events.emit('hud-hp', this.hp, this.maxHP);
  }

  /**
   * Rebuild: base + passive levels + permanent shop ranks (additive layer),
   * then character mods (mults ×, flats +).
   */
  recomputeStats(passiveLevels: ReadonlyMap<string, number>): void {
    const oldMaxHP = this.maxHP;
    const next = { ...BASE_STATS };
    for (const def of PASSIVES) {
      const level = passiveLevels.get(def.id) ?? 0;
      if (level > 0) next[def.stat] += def.perLevel * level;
    }
    for (const def of SHOP_UPGRADES) {
      if (!def.stat || def.perRank === undefined) continue;
      const rank = saveManager.upgradeRank(def.id);
      if (rank > 0) next[def.stat] += def.perRank * rank;
    }
    const m = this.character.mods;
    next.hpMult *= m.hpMult ?? 1;
    next.speedMult *= m.speedMult ?? 1;
    next.areaMult *= m.areaMult ?? 1;
    next.damageMult *= m.damageMult ?? 1;
    next.cooldownMult *= m.cooldownMult ?? 1;
    next.xpMult *= m.xpMult ?? 1;
    next.magnetMult *= m.magnetMult ?? 1;
    next.durationMult *= m.durationMult ?? 1;
    next.amountBonus += m.amountBonus ?? 0;
    next.armorFlat += m.armorFlat ?? 0;
    next.critChance += m.critChance ?? 0;

    this.stats = next;
    this.maxHP = Math.round(PLAYER.maxHP * next.hpMult);
    if (oldMaxHP > 0 && this.maxHP > oldMaxHP) this.hp += this.maxHP - oldMaxHP;
    this.hp = Math.min(this.hp, this.maxHP);
    this.scene.events.emit('hud-hp', this.hp, this.maxHP);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.dead) return;
    const v = this.inputManager.moveVector;
    this.setVelocity(v.x * this.moveSpeed, v.y * this.moveSpeed);
    if (v.x !== 0 || v.y !== 0) {
      this.facing.copy(v).normalize();
      if (v.x !== 0) this.setFlipX(v.x < 0);
      this.anims.play(`${this.character.sprite}-run`, true);
    } else {
      this.anims.play(`${this.character.sprite}-idle`, true);
    }

    // Recovery shop upgrade: whole-point regen ticks.
    if (this.stats.regenPerSec > 0 && this.hp < this.maxHP) {
      this.regenAccumulator += (this.stats.regenPerSec * delta) / 1000;
      if (this.regenAccumulator >= 1) {
        const heal = Math.floor(this.regenAccumulator);
        this.regenAccumulator -= heal;
        this.hp = Math.min(this.maxHP, this.hp + heal);
        this.scene.events.emit('hud-hp', this.hp, this.maxHP);
      }
    }
  }

  /** Revival shop upgrade: back up at half HP with a 2s grace window. */
  revive(): void {
    this.dead = false;
    this.hp = Math.max(1, Math.round(this.maxHP * 0.5));
    this.invulnUntil = this.scene.time.now + 2000;
    this.scene.events.emit('hud-hp', this.hp, this.maxHP);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 120,
      yoyo: true,
      repeat: 7,
      onComplete: () => this.setAlpha(1),
    });
  }

  /** Returns true if the hit landed (not dead, not inside i-frames). */
  takeDamage(amount: number): boolean {
    if (this.dead || this.ultShield) return false;
    const now = this.scene.time.now;
    if (now < this.invulnUntil) return false;
    this.invulnUntil = now + PLAYER.iFrameSeconds * 1000;

    const effective = Math.max(1, amount - this.stats.armorFlat);
    this.hp = Math.max(0, this.hp - effective);
    this.scene.events.emit('hud-hp', this.hp, this.maxHP);
    this.scene.events.emit('player-hurt');

    if (this.hp <= 0) {
      this.dead = true;
      this.setVelocity(0, 0);
      this.scene.events.emit('player-died');
      return true;
    }

    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: 60,
      yoyo: true,
      repeat: Math.floor((PLAYER.iFrameSeconds * 1000) / 120) - 1,
      onComplete: () => this.setAlpha(1),
    });
    return true;
  }
}
