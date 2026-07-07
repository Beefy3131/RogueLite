import Phaser from 'phaser';
import { COLLISION, PLAYER, PROJECTILE, SLOTS, WEAPON_BASE } from '../config/balance';
import { WEAPONS, type WeaponDef, type WeaponId, type WeaponLevelStats } from '../config/weapons';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import type { CollisionGrid } from './CollisionGrid';
import { FlashPool } from './FlashPool';
import type { ObjectPool } from './ObjectPool';

interface EquippedWeapon {
  def: WeaponDef;
  level: number; // 1-based
  cooldownMs: number;
}

interface Lob {
  active: boolean;
  img: Phaser.GameObjects.Image;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  damage: number;
  radius: number;
  patch: boolean;
}

interface FirePatch {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  untilMs: number;
  nextTickMs: number;
  radius: number;
  tickDamage: number;
}

/**
 * Auto-fire weapons on individual cooldowns (spec §5), all 8 behaviors.
 * Damage × damageMult, cooldowns × cooldownMult, sizes × areaMult, counts +
 * amountBonus, lifetimes × durationMult. All visuals are reused objects.
 */
export class WeaponSystem {
  private readonly equipped: EquippedWeapon[] = [];
  private readonly queryBuffer: Enemy[] = [];
  private auraSprite: Phaser.GameObjects.Image | null = null;
  private readonly whipArcs: Phaser.GameObjects.Image[] = [];
  private readonly orbitShards: Phaser.GameObjects.Image[] = [];
  private orbitAngle = 0;
  private readonly lobs: Lob[] = [];
  private readonly patches: FirePatch[] = [];
  private readonly explosions: FlashPool;
  private readonly bolts: FlashPool;
  private elapsedMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly enemyPool: ObjectPool<Enemy>,
    private readonly grid: CollisionGrid<Enemy>,
    private readonly projectilePool: ObjectPool<Projectile>,
  ) {
    this.explosions = new FlashPool(scene, 'explosion', 9, 3);
    this.bolts = new FlashPool(scene, 'lightning-bolt', 9, 3.5);
  }

  get weapons(): ReadonlyArray<{ id: WeaponId; name: string; level: number }> {
    return this.equipped.map(w => ({ id: w.def.id, name: w.def.name, level: w.level }));
  }

  has(id: WeaponId): boolean {
    return this.equipped.some(w => w.def.id === id);
  }

  levelOf(id: WeaponId): number {
    return this.equipped.find(w => w.def.id === id)?.level ?? 0;
  }

  get slotsFull(): boolean {
    return this.equipped.length >= SLOTS.weapons;
  }

  addWeapon(id: WeaponId): void {
    if (this.has(id) || this.slotsFull) return;
    this.equipped.push({ def: WEAPONS[id], level: 1, cooldownMs: 0 });
    if (id === 'aura') this.ensureAuraSprite();
    this.scene.events.emit('hud-loadout', this.weapons);
  }

  upgradeWeapon(id: WeaponId): void {
    const w = this.equipped.find(e => e.def.id === id);
    if (!w || w.level >= w.def.maxLevel) return;
    w.level++;
    this.scene.events.emit('hud-loadout', this.weapons);
  }

  /** Count-based weapons get the Amount passive on top of level count. */
  private countFor(stats: WeaponLevelStats): number {
    return (stats.count ?? 1) + this.player.stats.amountBonus;
  }

  /** damage × damageMult, with a crit roll (Dasher perk, spec §10 crit rules). */
  private rollDamage(base: number): number {
    let d = base * this.player.stats.damageMult;
    if (this.player.stats.critChance > 0 && Math.random() < this.player.stats.critChance) {
      d *= PLAYER.critMultiplier;
    }
    return d;
  }

  update(deltaMs: number): void {
    this.elapsedMs += deltaMs;

    for (const w of this.equipped) {
      if (w.def.behavior === 'orbit') continue; // continuous, handled below
      w.cooldownMs -= deltaMs;
      if (w.cooldownMs > 0) continue;
      const stats = w.def.levels[w.level - 1];
      const cd = this.player.stats.cooldownMult;
      switch (w.def.behavior) {
        case 'nearestTarget':
          if (!this.fireMagicBolt(stats)) {
            w.cooldownMs = 0;
            continue;
          }
          w.cooldownMs += WEAPON_BASE.magicBolt.cooldown * 1000 * cd;
          break;
        case 'sweep':
          this.fireWhip(stats);
          w.cooldownMs += WEAPON_BASE.whip.cooldown * 1000 * cd;
          break;
        case 'aura':
          this.tickAura(stats);
          w.cooldownMs += WEAPON_BASE.aura.tickSeconds * 1000; // ticks aren't cooldown-reduced
          break;
        case 'movementDirection':
          this.fireKnife(stats);
          w.cooldownMs += WEAPON_BASE.knife.cooldown * 1000 * cd;
          break;
        case 'lob':
          this.fireBombs(stats);
          w.cooldownMs += WEAPON_BASE.fireBomb.cooldown * 1000 * cd;
          break;
        case 'randomStrike':
          if (!this.fireLightning(stats)) {
            w.cooldownMs = 0;
            continue;
          }
          w.cooldownMs += WEAPON_BASE.lightning.cooldown * 1000 * cd;
          break;
        case 'boomerang':
          this.fireBoomerangs(stats);
          w.cooldownMs += WEAPON_BASE.boomerang.cooldown * 1000 * cd;
          break;
      }
    }

    this.updateOrbit(deltaMs);
    this.updateLobs(deltaMs);
    this.updatePatches(deltaMs);
    this.updateVisuals(deltaMs);
    this.explosions.update(deltaMs);
    this.bolts.update(deltaMs);
  }

  // --- Magic Bolt: one projectile per k-nearest enemy ---

  private fireMagicBolt(stats: WeaponLevelStats): boolean {
    const count = this.countFor(stats);
    let fired = 0;
    let lastDist = -1;
    for (let k = 0; k < count; k++) {
      let best: Enemy | null = null;
      let bestDist = Infinity;
      for (const e of this.enemyPool.active) {
        if (!e.active) continue;
        const d = Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y);
        if (d > lastDist && d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      if (!best) break;
      lastDist = bestDist;
      const angle = Math.atan2(best.y - this.player.y, best.x - this.player.x);
      this.projectilePool.acquire().fire({
        x: this.player.x,
        y: this.player.y,
        angle,
        speed: WEAPON_BASE.magicBolt.projectileSpeed,
        damage: this.rollDamage(stats.damage),
        pierce: stats.pierce ?? 0,
        lifetimeMs: PROJECTILE.lifetimeMs * this.player.stats.durationMult,
        grid: this.grid,
      });
      fired++;
    }
    return fired > 0;
  }

  // --- Whip: instant arc in facing direction (and behind at L3+) ---

  private fireWhip(stats: WeaponLevelStats): void {
    const range = WEAPON_BASE.whip.range * (stats.areaScale ?? 1) * this.player.stats.areaMult;
    const whips = stats.count ?? 1; // Amount doesn't add whips
    const halfArc = Phaser.Math.DegToRad(WEAPON_BASE.whip.arcDegrees / 2);
    const facing = this.player.facing;

    for (let i = 0; i < whips; i++) {
      const dirX = i === 0 ? facing.x : -facing.x;
      const dirY = i === 0 ? facing.y : -facing.y;
      const angleDir = Math.atan2(dirY, dirX);
      const candidates = this.grid.queryArea(this.player.x, this.player.y, range + 16, this.queryBuffer);
      for (const enemy of candidates) {
        if (!enemy.active) continue;
        const dx = enemy.x - this.player.x;
        const dy = enemy.y - this.player.y;
        if (Math.hypot(dx, dy) > range + enemy.bodyRadius) continue;
        if (Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angleDir)) > halfArc) continue;
        enemy.takeDamage(this.rollDamage(stats.damage), this.player.x, this.player.y);
      }
      this.showWhipArc(i, angleDir, range);
    }
  }

  private showWhipArc(index: number, angle: number, range: number): void {
    while (this.whipArcs.length <= index) {
      this.whipArcs.push(this.scene.add.image(0, 0, 'whip-arc').setDepth(9).setVisible(false));
    }
    this.whipArcs[index]
      .setPosition(this.player.x, this.player.y)
      .setRotation(angle)
      .setScale(range / WEAPON_BASE.whip.range)
      .setAlpha(0.9)
      .setVisible(true);
  }

  // --- Aura ---

  private tickAura(stats: WeaponLevelStats): void {
    const radius = WEAPON_BASE.aura.radius * (stats.areaScale ?? 1) * this.player.stats.areaMult;
    const candidates = this.grid.queryArea(this.player.x, this.player.y, radius + 16, this.queryBuffer);
    for (const enemy of candidates) {
      if (!enemy.active) continue;
      const r = radius + enemy.bodyRadius;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      if (dx * dx + dy * dy <= r * r) {
        enemy.takeDamage(this.rollDamage(stats.damage), this.player.x, this.player.y);
      }
    }
    this.auraSprite?.setAlpha(1);
  }

  private ensureAuraSprite(): void {
    if (!this.auraSprite) {
      this.auraSprite = this.scene.add.image(this.player.x, this.player.y, 'aura').setDepth(2).setAlpha(0.6);
    }
  }

  // --- Throwing Knife: volley in movement direction ---

  private fireKnife(stats: WeaponLevelStats): void {
    const count = this.countFor(stats);
    const speed = WEAPON_BASE.knife.projectileSpeed * (stats.speedScale ?? 1);
    const baseAngle = Math.atan2(this.player.facing.y, this.player.facing.x);
    for (let i = 0; i < count; i++) {
      // Fan extra knives ±8° around the movement direction.
      const offset = (i - (count - 1) / 2) * Phaser.Math.DegToRad(8);
      this.projectilePool.acquire().fire({
        x: this.player.x,
        y: this.player.y,
        angle: baseAngle + offset,
        speed,
        damage: this.rollDamage(stats.damage),
        pierce: stats.pierce ?? 1,
        texture: 'projectile-knife',
        lifetimeMs: PROJECTILE.lifetimeMs * this.player.stats.durationMult,
        grid: this.grid,
      });
    }
  }

  // --- Orbit Shards: continuous rotation, contact damage with re-hit gate ---

  private updateOrbit(deltaMs: number): void {
    const w = this.equipped.find(e => e.def.behavior === 'orbit');
    if (!w) return;
    const stats = w.def.levels[w.level - 1];
    const base = WEAPON_BASE.orbit;
    const shards = this.countFor(stats);
    const radius = base.orbitRadius * (stats.areaScale ?? 1) * this.player.stats.areaMult;

    this.orbitAngle += Phaser.Math.DegToRad(base.rotationDegPerSec * (stats.speedScale ?? 1)) * (deltaMs / 1000);

    while (this.orbitShards.length < shards) {
      this.orbitShards.push(this.scene.add.image(0, 0, 'shard').setDepth(8));
    }
    while (this.orbitShards.length > shards) {
      this.orbitShards.pop()!.destroy();
    }

    const now = this.scene.time.now;
    for (let i = 0; i < shards; i++) {
      const a = this.orbitAngle + (i / shards) * Math.PI * 2;
      const sx = this.player.x + Math.cos(a) * radius;
      const sy = this.player.y + Math.sin(a) * radius;
      const shard = this.orbitShards[i];
      shard.setPosition(sx, sy).setRotation(a);

      const candidates = this.grid.queryArea(sx, sy, 20, this.queryBuffer);
      for (const enemy of candidates) {
        if (!enemy.active || now < enemy.orbitImmuneUntil) continue;
        const reach = 8 + enemy.bodyRadius;
        const dx = enemy.x - sx;
        const dy = enemy.y - sy;
        if (dx * dx + dy * dy > reach * reach) continue;
        enemy.orbitImmuneUntil = now + base.hitCooldownMs;
        enemy.takeDamage(this.rollDamage(stats.damage), sx, sy);
      }
    }
  }

  // --- Fire Bomb: lob to a target point, explode, optional burning patch ---

  private fireBombs(stats: WeaponLevelStats): void {
    const count = this.countFor(stats);
    const base = WEAPON_BASE.fireBomb;
    for (let i = 0; i < count; i++) {
      // Aim at a random enemy in range, else a random direction.
      const inRange: Enemy[] = [];
      for (const e of this.enemyPool.active) {
        if (e.active && Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) <= base.targetRange) {
          inRange.push(e);
        }
      }
      let tx: number;
      let ty: number;
      if (inRange.length) {
        const target = inRange[Math.floor(Math.random() * inRange.length)];
        tx = target.x;
        ty = target.y;
      } else {
        const a = Math.random() * Math.PI * 2;
        tx = this.player.x + Math.cos(a) * base.targetRange * 0.6;
        ty = this.player.y + Math.sin(a) * base.targetRange * 0.6;
      }

      let lob = this.lobs.find(l => !l.active);
      if (!lob) {
        lob = { active: false, img: this.scene.add.image(0, 0, 'bomb').setDepth(9).setVisible(false), sx: 0, sy: 0, tx: 0, ty: 0, t: 0, damage: 0, radius: 0, patch: false };
        this.lobs.push(lob);
      }
      lob.active = true;
      lob.sx = this.player.x;
      lob.sy = this.player.y;
      lob.tx = tx;
      lob.ty = ty;
      lob.t = 0;
      lob.damage = this.rollDamage(stats.damage);
      lob.radius = base.blastRadius * (stats.areaScale ?? 1) * this.player.stats.areaMult;
      lob.patch = stats.patch ?? false;
      lob.img.setVisible(true).setAlpha(1);
    }
  }

  private updateLobs(deltaMs: number): void {
    const base = WEAPON_BASE.fireBomb;
    for (const lob of this.lobs) {
      if (!lob.active) continue;
      lob.t += deltaMs / base.lobDurationMs;
      if (lob.t >= 1) {
        lob.active = false;
        lob.img.setVisible(false);
        this.explodeAt(lob.tx, lob.ty, lob.radius, lob.damage);
        if (lob.patch) this.startPatch(lob.tx, lob.ty, lob.radius, lob.damage);
        continue;
      }
      const x = Phaser.Math.Linear(lob.sx, lob.tx, lob.t);
      const y = Phaser.Math.Linear(lob.sy, lob.ty, lob.t);
      const arc = 1 + Math.sin(lob.t * Math.PI) * 0.9; // fake height via scale
      lob.img.setPosition(x, y - Math.sin(lob.t * Math.PI) * 30).setScale(arc);
    }
  }

  private explodeAt(x: number, y: number, radius: number, damage: number): void {
    this.explosions.show(x, y, radius / 40);
    const candidates = this.grid.queryArea(x, y, radius + 16, this.queryBuffer);
    for (const enemy of candidates) {
      if (!enemy.active) continue;
      const r = radius + enemy.bodyRadius;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      if (dx * dx + dy * dy <= r * r) enemy.takeDamage(damage, x, y);
    }
  }

  private startPatch(x: number, y: number, radius: number, bombDamage: number): void {
    const base = WEAPON_BASE.fireBomb;
    let patch = this.patches.find(p => !p.active);
    if (!patch) {
      patch = { active: false, img: this.scene.add.image(0, 0, 'fire-patch').setDepth(1).setVisible(false), x: 0, y: 0, untilMs: 0, nextTickMs: 0, radius: 0, tickDamage: 0 };
      this.patches.push(patch);
    }
    patch.active = true;
    patch.x = x;
    patch.y = y;
    patch.untilMs = this.elapsedMs + base.patchDurationMs * this.player.stats.durationMult;
    patch.nextTickMs = this.elapsedMs;
    patch.radius = radius * 0.8;
    patch.tickDamage = bombDamage * base.patchDamageFraction;
    patch.img.setPosition(x, y).setScale(patch.radius / 40).setVisible(true).setAlpha(1);
  }

  private updatePatches(deltaMs: number): void {
    const base = WEAPON_BASE.fireBomb;
    for (const patch of this.patches) {
      if (!patch.active) continue;
      if (this.elapsedMs >= patch.untilMs) {
        patch.active = false;
        patch.img.setVisible(false);
        continue;
      }
      if (this.elapsedMs >= patch.nextTickMs) {
        patch.nextTickMs = this.elapsedMs + base.patchTickMs;
        const candidates = this.grid.queryArea(patch.x, patch.y, patch.radius + 16, this.queryBuffer);
        for (const enemy of candidates) {
          if (!enemy.active) continue;
          const r = patch.radius + enemy.bodyRadius;
          const dx = enemy.x - patch.x;
          const dy = enemy.y - patch.y;
          if (dx * dx + dy * dy <= r * r) enemy.takeDamage(patch.tickDamage, patch.x, patch.y);
        }
      }
    }
  }

  // --- Lightning: random on-screen strikes, optional chain ---

  private fireLightning(stats: WeaponLevelStats): boolean {
    const base = WEAPON_BASE.lightning;
    const strikes = this.countFor(stats);

    const onScreen: Enemy[] = [];
    for (const e of this.enemyPool.active) if (e.active && e.visible) onScreen.push(e);
    if (onScreen.length === 0) return false;

    for (let s = 0; s < strikes && onScreen.length > 0; s++) {
      const idx = Math.floor(Math.random() * onScreen.length);
      const target = onScreen[idx];
      onScreen.splice(idx, 1); // distinct targets per volley
      this.bolts.show(target.x, target.y - 20, 1);
      const damage = this.rollDamage(stats.damage);
      target.takeDamage(damage); // top-down: no directional source → no shield resist
      // Chain to the nearest other enemy (L5+).
      for (let c = 0; c < (stats.chain ?? 0); c++) {
        let nearest: Enemy | null = null;
        let nearestDist = base.chainRadius * base.chainRadius;
        for (const e of this.enemyPool.active) {
          if (!e.active || e === target) continue;
          const d = Phaser.Math.Distance.Squared(e.x, e.y, target.x, target.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = e;
          }
        }
        if (!nearest) break;
        this.bolts.show(nearest.x, nearest.y - 20, 0.8, 0.8);
        nearest.takeDamage(damage * base.chainDamageFraction);
      }
    }
    return true;
  }

  // --- Boomerang: out along facing, back through everything ---

  private fireBoomerangs(stats: WeaponLevelStats): void {
    const base = WEAPON_BASE.boomerang;
    const count = this.countFor(stats);
    const range = base.range * (stats.areaScale ?? 1) * this.player.stats.areaMult;
    const baseAngle = Math.atan2(this.player.facing.y, this.player.facing.x);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * Phaser.Math.DegToRad(20);
      this.projectilePool.acquire().fire({
        x: this.player.x,
        y: this.player.y,
        angle: baseAngle + offset,
        speed: base.speed,
        damage: this.rollDamage(stats.damage),
        pierce: Infinity,
        texture: 'projectile-boomerang',
        lifetimeMs: 6000, // safety net; normally despawns on return
        mode: 'boomerang',
        grid: this.grid,
        player: this.player,
        range,
      });
    }
  }

  // --- Shared visuals ---

  private updateVisuals(deltaMs: number): void {
    if (this.auraSprite) {
      const w = this.equipped.find(e => e.def.id === 'aura');
      if (w) {
        const stats = w.def.levels[w.level - 1];
        const radius = WEAPON_BASE.aura.radius * (stats.areaScale ?? 1) * this.player.stats.areaMult;
        this.auraSprite.setPosition(this.player.x, this.player.y).setScale(radius / WEAPON_BASE.aura.radius);
        if (this.auraSprite.alpha > 0.6) {
          this.auraSprite.setAlpha(Math.max(0.6, this.auraSprite.alpha - deltaMs / 250));
        }
      }
    }
    for (const arc of this.whipArcs) {
      if (!arc.visible) continue;
      arc.setAlpha(arc.alpha - deltaMs / 180);
      if (arc.alpha <= 0) arc.setVisible(false);
    }
  }
}
