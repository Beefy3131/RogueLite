import Phaser from 'phaser';
import { COLLISION, PLAYER, PROJECTILE, SLOTS, WEAPON_BASE } from '../config/balance';
import { WEAPONS, type WeaponDef, type WeaponId, type WeaponLevelStats } from '../config/weapons';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import type { CollisionGrid } from './CollisionGrid';
import { FlashPool } from './FlashPool';
import type { ObjectPool } from './ObjectPool';
import type { ParticlePool } from './ParticlePool';

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
  /** Two counter-rotating additive swirls layered over the aura ring. */
  private readonly auraSwirls: Phaser.GameObjects.Image[] = [];
  private auraTimeMs = 0;
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
    private readonly particles: ParticlePool,
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
        case 'fireball':
          if (!this.fireFireball(stats)) {
            w.cooldownMs = 0;
            continue;
          }
          w.cooldownMs += WEAPON_BASE.fireball.cooldown * 1000 * cd;
          break;
        case 'venom':
          if (!this.fireVenom(stats)) {
            w.cooldownMs = 0;
            continue;
          }
          w.cooldownMs += WEAPON_BASE.venom.cooldown * 1000 * cd;
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

  // --- Magic Bolt / Fireball / Venom: one projectile per k-nearest enemy ---

  private fireMagicBolt(stats: WeaponLevelStats): boolean {
    return this.fireAtNearest(stats, WEAPON_BASE.magicBolt.projectileSpeed, 'fx-bolt');
  }

  private fireFireball(stats: WeaponLevelStats): boolean {
    const base = WEAPON_BASE.fireball;
    // DoT ticks scale with hit damage (multiplied, no crit roll).
    const tick = stats.damage * this.player.stats.damageMult * base.burnTickFraction;
    return this.fireAtNearest(stats, base.projectileSpeed, 'fx-fireball', enemy => {
      enemy.applyBurn(tick, base.burnDurationMs);
      this.particles.burstFx(enemy.x, enemy.y, {
        texture: 'p-flame_01', count: 4, add: true,
        colors: [0xffab40, 0xff7043], scaleStart: 0.13, scaleEnd: 0.02,
        gravity: -140, speedMin: 30, speedMax: 120, lifeMin: 280, lifeMax: 460,
      });
    });
  }

  private fireVenom(stats: WeaponLevelStats): boolean {
    const base = WEAPON_BASE.venom;
    const tick = stats.damage * this.player.stats.damageMult * base.poisonTickFraction;
    return this.fireAtNearest(stats, base.projectileSpeed, 'fx-venom', enemy => {
      enemy.applyPoison(tick, base.poisonDurationMs, base.maxStacks);
      this.particles.burstFx(enemy.x, enemy.y, {
        texture: 'p-circle_05', count: 4, add: true,
        colors: [0x9ccc65, 0x66bb6a], scaleStart: 0.09, scaleEnd: 0.02,
        gravity: 90, speedMin: 20, speedMax: 100, lifeMin: 300, lifeMax: 520,
      });
    });
  }

  private fireAtNearest(
    stats: WeaponLevelStats,
    speed: number,
    texture?: string,
    onHit?: (enemy: Enemy) => void,
  ): boolean {
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
        speed,
        damage: this.rollDamage(stats.damage),
        pierce: stats.pierce ?? 0,
        texture,
        lifetimeMs: PROJECTILE.lifetimeMs * this.player.stats.durationMult,
        grid: this.grid,
        onHit,
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
      // Soft color swirls: additive, low alpha, counter-rotating — mood, not noise.
      for (const texture of ['p-twirl_01', 'p-twirl_02']) {
        this.auraSwirls.push(
          this.scene.add
            .image(this.player.x, this.player.y, texture)
            .setDepth(2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.2),
        );
      }
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
      this.orbitShards.push(this.scene.add.image(0, 0, 'fx-shard').setDepth(8).setScale(0.7));
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
    this.particles.burstFx(x, y, {
      texture: 'p-flame_01', count: 7, add: true,
      colors: [0xffab40, 0xff7043, 0xffe082],
      scaleStart: 0.16, scaleEnd: 0.03, gravity: -100,
      speedMin: 50, speedMax: 220, lifeMin: 300, lifeMax: 500,
    });
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
      this.particles.burstFx(target.x, target.y, {
        texture: 'p-spark_04', count: 5, add: true,
        colors: [0xfff59d, 0xffffff], scaleStart: 0.1, scaleEnd: 0.02,
        speedMin: 80, speedMax: 260, lifeMin: 200, lifeMax: 380,
      });
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
        texture: 'fx-boomerang',
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
        this.auraTimeMs += deltaMs;
        const stats = w.def.levels[w.level - 1];
        const radius = WEAPON_BASE.aura.radius * (stats.areaScale ?? 1) * this.player.stats.areaMult;
        this.auraSprite.setPosition(this.player.x, this.player.y).setScale(radius / WEAPON_BASE.aura.radius);
        if (this.auraSprite.alpha > 0.6) {
          this.auraSprite.setAlpha(Math.max(0.6, this.auraSprite.alpha - deltaMs / 250));
        }
        // Swirls: slow counter-rotation + a gentle green→teal→violet hue drift.
        const t = this.auraTimeMs;
        const hue = 0.38 + 0.14 * Math.sin(t * 0.0005);
        const tint = Phaser.Display.Color.HSVToRGB(hue, 0.7, 1).color;
        const swirlScale = (radius * 2) / 96;
        this.auraSwirls[0]
          ?.setPosition(this.player.x, this.player.y)
          .setRotation(t * 0.0009)
          .setScale(swirlScale)
          .setTint(tint)
          .setAlpha(0.16 + 0.06 * Math.sin(t * 0.002));
        this.auraSwirls[1]
          ?.setPosition(this.player.x, this.player.y)
          .setRotation(-t * 0.0006)
          .setScale(swirlScale * 0.72)
          .setTint(tint)
          .setAlpha(0.14 + 0.05 * Math.sin(t * 0.0016 + 2));
      }
    }
    for (const arc of this.whipArcs) {
      if (!arc.visible) continue;
      arc.setAlpha(arc.alpha - deltaMs / 180);
      if (arc.alpha <= 0) arc.setVisible(false);
    }
  }
}
