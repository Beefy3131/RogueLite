import Phaser from 'phaser';
import {
  BANISH_CHARGES_PER_RUN,
  CAMERA,
  CHESTS,
  COLLISION,
  ENEMY_BASE,
  GAME,
  GOLD,
  HAZARDS,
  PICKUPS,
  POOLS,
  PROPS,
  RUN,
  UI,
  WORLD,
  XP,
} from '../config/balance';
import { getCharacter, type CharacterDef } from '../config/characters';
import { ENEMY_LOOKS } from '../config/enemies';
import { getMap, type MapDef } from '../config/maps';
import { PASSIVES } from '../config/passives';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { Enemy } from '../entities/Enemy';
import { Pickup, type PickupKind } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { XPGem } from '../entities/XPGem';
import { audio } from '../systems/AudioManager';
import { CollisionGrid } from '../systems/CollisionGrid';
import { DamageNumbers } from '../systems/DamageNumbers';
import { FlashPool } from '../systems/FlashPool';
import { InputManager } from '../systems/InputManager';
import { ObjectPool } from '../systems/ObjectPool';
import { ParticlePool } from '../systems/ParticlePool';
import { saveManager } from '../systems/SaveManager';
import { SpawnDirector } from '../systems/SpawnDirector';
import { UltimateSystem } from '../systems/UltimateSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import type { UpgradeChoice } from './LevelUpScene';

/**
 * The run itself. Phase 4 adds the full combat loop: weapons auto-fire,
 * enemies die and drop XP gems, gems magnet in, the level bar fills, and
 * level-ups pause the run for a 3-card pick.
 */
export class GameScene extends Phaser.Scene {
  player!: Player;
  inputManager!: InputManager;
  enemyPool!: ObjectPool<Enemy>;
  spawnDirector!: SpawnDirector;
  weaponSystem!: WeaponSystem;
  ultimate!: UltimateSystem;

  level = 1;
  xp = 0;
  xpForNext: number = XP.xpForLevel(1);
  kills = 0;
  runGold = 0;
  rerollsLeft = 0;
  banishesLeft = 0;
  skipUnlocked = false;
  private revivesLeft = 0;
  private readonly banishedIds = new Set<string>();

  private projectilePool!: ObjectPool<Projectile>;
  private gemPool!: ObjectPool<XPGem>;
  private pickupPool!: ObjectPool<Pickup>;
  private explosionFx!: FlashPool;
  private damageNumbers!: DamageNumbers;
  private particles!: ParticlePool;
  private grid!: CollisionGrid<Enemy>;
  private readonly queryBuffer: Enemy[] = [];
  private readonly passiveLevels = new Map<string, number>();
  private ground!: Phaser.GameObjects.TileSprite;
  private chestTimerMs = 0;
  private elapsedMs = 0;
  private ended = false;
  private levelingUp = false;
  private debugText!: Phaser.GameObjects.Text;
  private character!: CharacterDef;
  private map!: MapDef;
  private propObstacles: Array<{ x: number; y: number; r: number }> = [];
  private fogZones: Array<{
    img: Phaser.GameObjects.Image;
    active: boolean;
    vx: number;
    vy: number;
    untilMs: number;
  }> = [];
  private fogTimerMs = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.elapsedMs = 0;
    this.ended = false;
    this.levelingUp = false;
    this.level = 1;
    this.xp = 0;
    this.xpForNext = XP.xpForLevel(1);
    this.kills = 0;
    this.passiveLevels.clear();
    this.runGold = 0;
    this.banishedIds.clear();
    // Per-run charges from permanent shop ranks (spec §11).
    this.revivesLeft = saveManager.upgradeRank('revival');
    this.rerollsLeft = saveManager.upgradeRank('reroll');
    this.skipUnlocked = saveManager.upgradeRank('skip') > 0;
    this.banishesLeft = saveManager.upgradeRank('banish') > 0 ? BANISH_CHARGES_PER_RUN : 0;

    // Selections made in CharacterSelect / MapSelect (registry-backed).
    this.character = getCharacter(this.registry.get('selected-character') ?? 'ranger');
    this.map = getMap(this.registry.get('selected-map') ?? 'forest');
    this.fogZones = [];
    this.fogTimerMs = HAZARDS.fogIntervalSeconds * 1000;
    this.chestTimerMs = CHESTS.firstAtSeconds * 1000;

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);

    // World-sized (not screen-space): screen-space objects get scaled by the
    // camera zoom, which would leave uncovered borders when zoomed out.
    this.ground = this.add
      .tileSprite(0, 0, WORLD.width, WORLD.height, this.map.groundTexture)
      .setOrigin(0)
      .setDepth(-1);

    this.inputManager = new InputManager(this);
    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2, this.inputManager, this.character);
    this.createProps();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.setZoom(CAMERA.zoom);
    cam.startFollow(this.player, true, CAMERA.followLerp, CAMERA.followLerp);

    // Perf foundation (Phase 3): pre-warmed pools + spatial hash.
    this.enemyPool = new ObjectPool<Enemy>(() => {
      const enemy = new Enemy(this);
      enemy.obstacles = this.propObstacles;
      return enemy;
    }, POOLS.enemies);
    this.projectilePool = new ObjectPool<Projectile>(() => new Projectile(this), POOLS.projectiles);
    this.gemPool = new ObjectPool<XPGem>(() => new XPGem(this), POOLS.gems);
    this.pickupPool = new ObjectPool<Pickup>(() => new Pickup(this), POOLS.pickups);
    this.explosionFx = new FlashPool(this, 'explosion', 9, 3);
    this.damageNumbers = new DamageNumbers(this);
    this.particles = new ParticlePool(this);
    this.grid = new CollisionGrid<Enemy>();
    this.spawnDirector = new SpawnDirector(this, this.enemyPool, this.player, this.map);
    this.weaponSystem = new WeaponSystem(this, this.player, this.enemyPool, this.grid, this.projectilePool);
    this.ultimate = new UltimateSystem(
      this,
      this.player,
      this.character,
      this.enemyPool,
      this.grid,
      this.projectilePool,
      this.particles,
      this.explosionFx,
    );

    this.weaponSystem.addWeapon(this.character.startWeapon);

    // Scene restarts do NOT clear scene.events listeners — drop stale ones
    // from the previous run or every Retry doubles kill/gem/pickup handling.
    // (Safe blanket-off: HUD attaches its listeners after this, in its own create.)
    for (const ev of [
      'enemy-killed',
      'projectile-done',
      'gem-collected',
      'enemy-shoot',
      'pickup-collected',
      'player-died',
      'player-hurt',
      'damage-dealt',
      'boss-spawned',
      'ult-pressed',
    ]) {
      this.events.off(ev);
    }

    // Juice + audio hooks (spec §14, Phase 8).
    audio.playMusic(this.map.id);
    this.events.on('damage-dealt', (x: number, y: number, amount: number) =>
      this.damageNumbers.show(x, y, amount),
    );
    this.events.on('player-hurt', () => {
      this.cameras.main.shake(110, 0.004);
      audio.play('player-hurt');
    });
    this.events.on('boss-spawned', () => {
      this.cameras.main.shake(500, 0.008);
      audio.play('boss-spawn');
    });

    this.events.on('enemy-killed', (enemy: Enemy) => this.onEnemyKilled(enemy));
    this.events.on('projectile-done', (p: Projectile) => {
      p.despawn();
      this.projectilePool.release(p);
    });
    this.events.on('gem-collected', (gem: XPGem, value: number) => this.onGemCollected(gem, value));
    this.events.on('enemy-shoot', (enemy: Enemy, damage: number) => this.onEnemyShoot(enemy, damage));
    this.events.on('pickup-collected', (pickup: Pickup, kind: PickupKind) => this.onPickupCollected(pickup, kind));
    // Ultimate: HUD button emits 'ult-pressed'; the emitter isn't paused with
    // the scene, so guard against firing mid-level-up / after the run ends.
    this.events.on('ult-pressed', () => {
      if (this.ended || this.levelingUp || this.scene.isPaused()) return;
      this.ultimate.tryActivate(this.level);
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.events.emit('ult-pressed'));

    this.events.on('player-died', () => {
      if (this.revivesLeft > 0) {
        this.revivesLeft--;
        this.reviveWithBreathingRoom();
      } else {
        this.endRun(false);
      }
    });

    this.scene.launch('HUD');

    // --- Debug / stress-test mode (Phase 3 perf gate) ---
    // Screen-space objects are scaled by the camera zoom around the screen
    // center — inverse-transform so the overlay lands where it always did.
    const dz = 1 / CAMERA.zoom;
    this.debugText = this.add
      .text(GAME.width / 2 + (GAME.width - 12 - GAME.width / 2) * dz, GAME.height / 2 + (48 - GAME.height / 2) * dz, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#00e676',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setScale(dz)
      .setDepth(3000)
      .setVisible(false);

    if (new URLSearchParams(location.search).has('stress')) {
      this.debugText.setVisible(true);
      this.spawnDirector.stressSpawn(300);
    }
    this.input.keyboard?.on('keydown-BACKTICK', () => this.debugText.setVisible(!this.debugText.visible));
    this.input.keyboard?.on('keydown-T', () => this.spawnDirector.stressSpawn(300));
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.refreshDebugOverlay() });

    // Pause (spec §12: Esc or P).
    const openPause = () => {
      if (this.ended || this.levelingUp) return;
      this.inputManager.reset(); // held touch never gets a pointerup while paused
      this.scene.pause();
      this.scene.launch('Pause');
    };
    this.input.keyboard?.on('keydown-ESC', openPause);
    this.input.keyboard?.on('keydown-P', openPause);
  }

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    this.elapsedMs += delta;

    // Survival cap reached → victory (spec §3).
    if (this.elapsedMs >= RUN.durationSeconds * 1000) {
      this.endRun(true);
      return;
    }

    this.explosionFx.update(delta);
    this.damageNumbers.update(delta);
    this.particles.update(delta);
    this.updateFog(delta);
    this.updateChests(delta);

    this.spawnDirector.update(delta, this.elapsedMs / 1000);

    // Rebuild the spatial hash; weapons and projectiles query it.
    this.grid.clear();
    for (const enemy of this.enemyPool.active) {
      if (enemy.active) this.grid.insert(enemy);
    }

    this.weaponSystem.update(delta);
    this.ultimate.update(delta);
    this.resolvePlayerContact();
    this.resolvePlayerProps();

    this.events.emit('hud-time', this.elapsedMs / 1000);
  }

  // --- Combat loop plumbing ---

  /** All gold earning routes through here so Greed applies everywhere. */
  private awardGold(amount: number): void {
    this.runGold += Math.round(amount * this.player.stats.goldMult);
    this.events.emit('hud-gold', this.runGold);
  }

  private reviveWithBreathingRoom(): void {
    // Clear a bubble so the revive isn't an instant re-death.
    for (const enemy of [...this.enemyPool.active]) {
      if (!enemy.active || enemy.kind === 'boss') continue;
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (d < 260) {
        enemy.despawn();
        this.enemyPool.release(enemy);
      }
    }
    this.player.revive();
    this.cameras.main.flash(300, 240, 240, 240);
    audio.play('revive');
  }

  private onEnemyKilled(enemy: Enemy): void {
    this.kills++;
    this.events.emit('hud-kills', this.kills);
    this.ultimate.onKill();
    const { kind, x, y } = enemy;
    const minute = this.elapsedMs / 60000;

    this.gemPool.acquire().spawn(x, y, enemy.xpValue, this.player);
    if (enemy.visible) this.particles.burst(x, y, ENEMY_LOOKS[kind].color, kind === 'boss' ? 26 : 6);
    audio.play('enemy-death');
    enemy.despawn();
    this.enemyPool.release(enemy);

    // Chance-per-kill gold (spec §11).
    if (Math.random() < GOLD.perKillChance) this.awardGold(GOLD.perKillAmount);

    switch (kind) {
      case 'splitter': // splits into minis (spec §7)
        for (let i = 0; i < ENEMY_BASE.splitter.minisPerSplit; i++) {
          this.spawnDirector.spawnKindAt('mini', x + (i === 0 ? -14 : 14), y, minute);
        }
        break;
      case 'exploder': // AoE blast on death — hurts the player too
        this.explodeExploder(x, y, enemy.contactDamage);
        break;
      case 'elite': {
        // Guaranteed drop (spec §7): heal, magnet, or a gold cache.
        const roll = Math.random();
        const dropKind = roll < 0.4 ? 'heal' : roll < 0.7 ? 'magnet' : 'gold';
        this.pickupPool.acquire().spawn(x, y, dropKind, this.player, GOLD.elitePickup);
        break;
      }
      case 'boss': {
        this.events.emit('hud-boss-off');
        this.spawnDirector.bossAlive = false;
        // Big reward: gem shower + heal + magnet + gold cache.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          this.gemPool.acquire().spawn(x + Math.cos(a) * 30, y + Math.sin(a) * 30, ENEMY_BASE.boss.xp, this.player);
        }
        this.pickupPool.acquire().spawn(x - 30, y, 'heal', this.player);
        this.pickupPool.acquire().spawn(x + 30, y, 'magnet', this.player);
        this.pickupPool.acquire().spawn(x, y + 30, 'gold', this.player, GOLD.bossPickup);
        break;
      }
    }
  }

  private explodeExploder(x: number, y: number, blastDamage: number): void {
    const radius = ENEMY_BASE.exploder.blastRadius;
    this.explosionFx.show(x, y, radius / 40);
    const dx = this.player.x - x;
    const dy = this.player.y - y;
    const reach = radius + COLLISION.playerRadius;
    if (dx * dx + dy * dy <= reach * reach) this.player.takeDamage(blastDamage);
  }

  private onEnemyShoot(enemy: Enemy, damage: number): void {
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    this.projectilePool.acquire().fire({
      x: enemy.x,
      y: enemy.y,
      angle,
      speed: ENEMY_BASE.shooter.projectileSpeed,
      damage,
      pierce: 0,
      texture: 'projectile-enemy',
      lifetimeMs: 4000,
      mode: 'hostile',
      player: this.player,
    });
  }

  private onPickupCollected(pickup: Pickup, kind: PickupKind): void {
    const value = pickup.value;
    const { x, y } = pickup;
    pickup.despawn();
    this.pickupPool.release(pickup);
    audio.play('pickup');
    if (kind === 'heal') {
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + PICKUPS.healAmount);
      this.events.emit('hud-hp', this.player.hp, this.player.maxHP);
    } else if (kind === 'gold') {
      this.awardGold(value);
    } else if (kind === 'chest') {
      this.openChest(x, y);
    } else {
      // Magnet-all: every gem on the map flies in.
      for (const gem of this.gemPool.active) {
        if (gem.active) gem.forceMagnet = true;
      }
    }
  }

  // --- Loot chests: timed spawns near the player, random gold + maybe a level ---

  private updateChests(delta: number): void {
    this.chestTimerMs -= delta;
    if (this.chestTimerMs > 0) return;
    const jitter = (Math.random() * 2 - 1) * CHESTS.jitterSeconds;
    this.chestTimerMs += (CHESTS.intervalSeconds + jitter) * 1000;

    const angle = Math.random() * Math.PI * 2;
    const dist = CHESTS.spawnDistanceMin + Math.random() * (CHESTS.spawnDistanceMax - CHESTS.spawnDistanceMin);
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 60, WORLD.width - 60);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 60, WORLD.height - 60);
    this.pickupPool.acquire().spawn(x, y, 'chest', this.player);
  }

  private openChest(x: number, y: number): void {
    audio.play('purchase');
    this.particles.burst(x, y, 0xffd54f, 14);

    const gold = CHESTS.minGold + Math.floor(Math.random() * (CHESTS.maxGold - CHESTS.minGold + 1));
    this.awardGold(gold);
    this.toast(x, y - 14, `+${Math.round(gold * this.player.stats.goldMult)} GOLD`, '#ffd54f');

    if (Math.random() < CHESTS.upgradeChance) {
      const choices = this.buildChoices();
      if (choices.length > 0) {
        const choice = choices[Math.floor(Math.random() * choices.length)];
        this.applyChoiceEffect(choice);
        const label = choice.kind === 'passive' || choice.tag === 'NEW!' ? choice.name : `${choice.name} ↑`;
        this.toast(x, y + 12, label, UI.colors.accentCss);
      }
    }
  }

  /** One-off floating reward text (chests are rare — allocation is fine). */
  private toast(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      duration: 1400,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private onGemCollected(gem: XPGem, value: number): void {
    gem.despawn();
    this.gemPool.release(gem);
    audio.play('gem');
    this.xp += value * this.player.stats.xpMult;
    this.events.emit('hud-xp', this.xp, this.xpForNext, this.level);
    this.tryLevelUp();
  }

  private tryLevelUp(): void {
    if (this.levelingUp || this.ended || this.xp < this.xpForNext) return;

    this.xp -= this.xpForNext;
    this.level++;
    this.xpForNext = XP.xpForLevel(this.level);
    this.events.emit('hud-xp', this.xp, this.xpForNext, this.level);

    const choices = this.buildChoices();
    if (choices.length === 0) return; // everything maxed — nothing to offer

    this.levelingUp = true;
    audio.play('level-up');
    this.inputManager.reset(); // held touch never gets a pointerup while paused
    this.scene.pause();
    this.scene.launch('LevelUp', { choices });
  }

  /** Called by LevelUpScene after it stops itself and resumes this scene. */
  applyUpgrade(choice: UpgradeChoice): void {
    this.levelingUp = false;
    this.applyChoiceEffect(choice);
    // Banked XP can cover several levels — chain into the next pick.
    this.tryLevelUp();
  }

  /** Grant a weapon/passive choice — level-up picks and chest drops share this. */
  private applyChoiceEffect(choice: UpgradeChoice): void {
    if (choice.kind === 'weapon-new') {
      this.weaponSystem.addWeapon(choice.id as WeaponId);
    } else if (choice.kind === 'weapon-upgrade') {
      this.weaponSystem.upgradeWeapon(choice.id as WeaponId);
    } else {
      const current = this.passiveLevels.get(choice.id) ?? 0;
      this.passiveLevels.set(choice.id, current + 1);
      this.player.recomputeStats(this.passiveLevels);
      this.events.emit('hud-passives', [...this.passiveLevels.entries()]);
    }
  }

  /** Skip button on the level-up overlay (shop unlock). */
  applySkip(): void {
    this.levelingUp = false;
    this.tryLevelUp();
  }

  /** Reroll button: consumes a charge, deals three fresh cards. */
  rerollChoices(): UpgradeChoice[] {
    this.rerollsLeft = Math.max(0, this.rerollsLeft - 1);
    return this.buildChoices();
  }

  /** Banish: remove this item from the pool for the rest of the run, redeal. */
  banishChoice(id: string): UpgradeChoice[] {
    this.banishesLeft = Math.max(0, this.banishesLeft - 1);
    this.banishedIds.add(id);
    return this.buildChoices();
  }

  buildChoices(): UpgradeChoice[] {
    const all: UpgradeChoice[] = [];

    for (const def of Object.values(WEAPONS)) {
      if (this.banishedIds.has(def.id)) continue;
      const level = this.weaponSystem.levelOf(def.id);
      if (level === 0 && !this.weaponSystem.slotsFull) {
        all.push({ kind: 'weapon-new', id: def.id, name: def.name, tag: 'NEW!', desc: def.levels[0].text });
      } else if (level > 0 && level < def.maxLevel) {
        all.push({
          kind: 'weapon-upgrade',
          id: def.id,
          name: def.name,
          tag: `Lv ${level} → ${level + 1}`,
          desc: def.levels[level].text,
        });
      }
    }

    for (const def of PASSIVES) {
      if (this.banishedIds.has(def.id)) continue;
      const level = this.passiveLevels.get(def.id) ?? 0;
      if (level >= def.maxLevel) continue;
      if (level === 0 && this.passiveLevels.size >= 6) continue; // passive slot cap
      all.push({
        kind: 'passive',
        id: def.id,
        name: def.name,
        tag: level === 0 ? 'NEW!' : `Lv ${level} → ${level + 1}`,
        desc: def.text,
      });
    }

    Phaser.Utils.Array.Shuffle(all);
    return all.slice(0, 3);
  }

  private resolvePlayerContact(): void {
    const maxRadius = COLLISION.playerRadius + 28; // boss is the widest body
    const candidates = this.grid.queryArea(this.player.x, this.player.y, maxRadius, this.queryBuffer);
    for (const enemy of candidates) {
      if (!enemy.active) continue;
      const contactDist = COLLISION.playerRadius + enemy.bodyRadius;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      if (dx * dx + dy * dy > contactDist * contactDist) continue;

      if (enemy.kind === 'exploder') {
        // Detonates on contact: the death handler applies the blast.
        enemy.takeDamage(enemy.hp + 1);
        continue;
      }
      const landed = this.player.takeDamage(enemy.contactDamage);
      // Brute signature (spec §4): attackers take damage back — but only per
      // landed hit, not per overlap frame (that would be 300 DPS of thorns).
      if (landed && this.character.thorns) {
        enemy.takeDamage(this.character.thorns * this.player.stats.damageMult, this.player.x, this.player.y);
      }
      break; // i-frames absorb the rest of the swarm this frame
    }
  }

  /** Scatter soft obstacles; player + enemies push out, ghosts phase through. */
  private createProps(): void {
    this.propObstacles.length = 0;
    for (let i = 0; i < this.map.propCount; i++) {
      let x = 0;
      let y = 0;
      do {
        x = 60 + Math.random() * (WORLD.width - 120);
        y = 60 + Math.random() * (WORLD.height - 120);
      } while (Math.hypot(x - WORLD.width / 2, y - WORLD.height / 2) < PROPS.minDistanceFromSpawn);
      const texture = this.map.propTextures[i % this.map.propTextures.length];
      this.add.image(x, y, texture).setDepth(4);
      this.propObstacles.push({ x, y, r: PROPS.radius });
    }
  }

  /** Same circle push-out the enemies use — deterministic, no tunneling. */
  private resolvePlayerProps(): void {
    for (const o of this.propObstacles) {
      const dx = this.player.x - o.x;
      const dy = this.player.y - o.y;
      const rr = o.r + COLLISION.playerRadius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        this.player.setPosition(o.x + (dx / d) * rr, o.y + (dy / d) * rr);
      }
    }
  }

  /** Graveyard hazard (spec §9): creeping fog that briefly slows the player. */
  private updateFog(delta: number): void {
    if (this.map.hazard !== 'slowFog') return;

    this.fogTimerMs -= delta;
    if (this.fogTimerMs <= 0) {
      this.fogTimerMs += HAZARDS.fogIntervalSeconds * 1000;
      for (let i = 0; i < HAZARDS.fogPerWave; i++) this.spawnFogZone();
    }

    let slowed = false;
    const dt = delta / 1000;
    for (const zone of this.fogZones) {
      if (!zone.active) continue;
      if (this.elapsedMs >= zone.untilMs) {
        zone.img.setAlpha(zone.img.alpha - dt * 1.5);
        if (zone.img.alpha <= 0) {
          zone.active = false;
          zone.img.setVisible(false);
        }
      }
      zone.img.x += zone.vx * dt;
      zone.img.y += zone.vy * dt;
      const dx = this.player.x - zone.img.x;
      const dy = this.player.y - zone.img.y;
      if (dx * dx + dy * dy <= HAZARDS.fogRadius * HAZARDS.fogRadius) slowed = true;
    }
    this.player.hazardSlow = slowed ? HAZARDS.fogSlowFactor : 1;
  }

  private spawnFogZone(): void {
    let zone = this.fogZones.find(z => !z.active);
    if (!zone) {
      zone = { img: this.add.image(0, 0, 'fog').setDepth(20), active: false, vx: 0, vy: 0, untilMs: 0 };
      this.fogZones.push(zone);
    }
    // Creep in from one side of the view, drifting across the player's area.
    const view = this.cameras.main.worldView;
    const angle = Math.random() * Math.PI * 2;
    const x = this.player.x + Math.cos(angle) * (view.width / 2);
    const y = this.player.y + Math.sin(angle) * (view.height / 2);
    const drift = Math.atan2(this.player.y - y, this.player.x - x);
    zone.active = true;
    zone.vx = Math.cos(drift) * HAZARDS.fogDriftSpeed;
    zone.vy = Math.sin(drift) * HAZARDS.fogDriftSpeed;
    zone.untilMs = this.elapsedMs + HAZARDS.fogDurationMs;
    zone.img.setPosition(x, y).setAlpha(1).setVisible(true);
  }

  private refreshDebugOverlay(): void {
    if (!this.debugText.visible || this.ended) return;
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const heapLine = heap ? `heap ${(heap.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'heap n/a';
    let visible = 0;
    for (const e of this.enemyPool.active) if (e.visible) visible++;
    this.debugText.setText(
      [
        `FPS ${this.game.loop.actualFps.toFixed(1)}`,
        `enemies ${this.enemyPool.activeCount} (vis ${visible}, free ${this.enemyPool.freeCount})`,
        `proj ${this.projectilePool.activeCount}  gems ${this.gemPool.activeCount}`,
        heapLine,
        '[`] overlay  [T] +300',
      ].join('\n'),
    );
  }

  private endRun(victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    const survivedSeconds = this.elapsedMs / 1000;
    // Completion bonus (spec §11), Greed-scaled like everything else.
    const bonus = Math.round(
      ((survivedSeconds / 60) * GOLD.completionPerMinute + (victory ? GOLD.victoryBonus : 0)) *
        this.player.stats.goldMult,
    );
    this.physics.pause();
    audio.stopMusic();
    audio.play(victory ? 'victory' : 'defeat');
    if (victory) this.cameras.main.flash(600, 240, 240, 200);
    else this.cameras.main.flash(400, 180, 30, 30);
    this.time.delayedCall(700, () => {
      this.scene.stop('HUD');
      this.scene.start('GameOver', {
        survivedSeconds,
        kills: this.kills,
        level: this.level,
        victory,
        mapId: this.map.id,
        runGold: this.runGold,
        bonusGold: bonus,
      });
    });
  }
}
