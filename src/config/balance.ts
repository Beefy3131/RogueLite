// ============================================================================
// balance.ts — SINGLE SOURCE OF TRUTH for every tuning number in the game.
// Spec §10 numbers live here verbatim. Tune the game from this file only;
// nothing gameplay-numeric should be hardcoded anywhere else.
// ============================================================================

/** Design resolution (16:9). Phaser Scale.FIT letterboxes this onto any screen. */
export const GAME = {
  width: 960,
  height: 540,
} as const;

/** World (run arena) size. Large scrolling area (spec §9). */
export const WORLD = {
  width: 4000,
  height: 4000,
} as const;

/** Camera behavior. */
export const CAMERA = {
  followLerp: 0.12,
  /** <1 zooms out (0.8 shows 25% more world per axis) — more reaction time. */
  zoom: 0.8,
} as const;

/** Floating virtual joystick (spec §12). */
export const JOYSTICK = {
  radius: 60, // px drag range mapping to full speed
  baseAlpha: 0.35,
  thumbAlpha: 0.55,
  /** Touches above this screen Y belong to the HUD (bars/timer/pause), not the stick. */
  excludeTopPx: 64,
} as const;

/** Run rules. */
export const RUN = {
  /** Run ends in victory at this time (20:00). */
  durationSeconds: 20 * 60,
} as const;

/** Player base stats (before character mods, passives, and shop upgrades). */
export const PLAYER = {
  maxHP: 100,
  moveSpeed: 200, // px/s
  pickupRadius: 80, // px, gem magnet
  hpRegen: 0, // HP/s — bought via shop
  critChance: 0, // 0..1
  critMultiplier: 1.5,
  iFrameSeconds: 0.5, // invulnerability after taking a hit
} as const;

/** XP curve: level N requires 5 + N*10 XP (linear, gentle). */
export const XP = {
  xpForLevel: (level: number): number => 5 + level * 10,
  gemValueMin: 1, // swarmers
  gemValueMax: 5, // elites
} as const;

/** Weapon L1 baselines (spec §10). Level scaling tables come in Phase 4/5. */
export const WEAPON_BASE = {
  magicBolt: { damage: 10, cooldown: 1.0, projectileSpeed: 400 },
  whip: { damage: 12, cooldown: 1.3, arcDegrees: 120, range: 90 },
  knife: { damage: 8, cooldown: 0.7, pierce: 1, projectileSpeed: 450 },
  aura: { damagePerTick: 5, tickSeconds: 0.5, radius: 70 },
  orbit: { damage: 8, shards: 2, orbitRadius: 90, rotationDegPerSec: 180, hitCooldownMs: 400 },
  fireBomb: {
    damage: 20,
    cooldown: 2.0,
    blastRadius: 80,
    targetRange: 350,
    lobDurationMs: 700,
    patchDurationMs: 2000,
    patchTickMs: 400,
    patchDamageFraction: 0.25, // patch tick = fraction of bomb damage
  },
  lightning: { damage: 18, cooldown: 2.5, strikes: 1, chainRadius: 120, chainDamageFraction: 0.5 },
  boomerang: { damage: 12, cooldown: 1.5, pierce: Infinity, speed: 380, range: 300 },
  fireball: {
    damage: 14,
    cooldown: 1.6,
    projectileSpeed: 320,
    burnTickFraction: 0.3, // burn tick = fraction of (multiplied) hit damage
    burnDurationMs: 3000,
  },
  venom: {
    damage: 6,
    cooldown: 0.9,
    projectileSpeed: 480,
    poisonTickFraction: 0.6,
    poisonDurationMs: 4000,
    maxStacks: 3, // poison tick damage caps at 3 stacked hits
  },
} as const;

/** Damage-over-time effects (burn/poison) tick on this shared clock. */
export const DOT = {
  tickMs: 500,
} as const;

/** Enemy spawn-time base stats, before time-scaling (spec §10). */
export const ENEMY_BASE = {
  // "Horde tuning": individual enemies are ~20% squishier and hit ~15%
  // softer than the original numbers, but the spawn curve runs ~25% faster —
  // difficulty comes from volume, and every weapon feels like a scythe.
  // Small-enemy radii bumped (8/7/6/5 → 10/9/8/7): with the zoomed-out camera
  // the old bodies were so small that projectiles whiffed through visual hits.
  swarmer: { hp: 8, damage: 5, speed: 90, xp: 1, radius: 10 },
  runner: { hp: 6, damage: 4, speed: 160, xp: 1, radius: 9 },
  brute: { hp: 45, damage: 12, speed: 55, xp: 2, radius: 14 },
  bat: { hp: 5, damage: 3, speed: 130, xp: 1, radius: 8 }, // erratic weave
  shooter: {
    hp: 14,
    damage: 7, // projectile damage
    speed: 70,
    xp: 2,
    radius: 9,
    keepDistance: 250,
    fireIntervalSeconds: 2.5,
    projectileSpeed: 180,
  },
  splitter: { hp: 16, damage: 5, speed: 80, xp: 2, radius: 10, minisPerSplit: 2 },
  mini: { hp: 5, damage: 3, speed: 110, xp: 1, radius: 7 }, // splitter offspring
  exploder: { hp: 12, damage: 17, speed: 110, xp: 1, radius: 9, blastRadius: 70 }, // damage = blast
  ghost: { hp: 11, damage: 6, speed: 100, xp: 2, radius: 8 }, // ignores props
  shielded: { hp: 36, damage: 8, speed: 65, xp: 3, radius: 10, frontResist: 0.7 },
  elite: { hp: 330, damage: 15, speed: 70, xp: 5, radius: 18 },
  boss: {
    hp: 2600,
    damage: 21,
    speed: 60,
    xp: 5, // per gem in the death shower
    radius: 28,
    hpScalePerBoss: 1.8, // +80% HP per subsequent boss
    chargeIntervalSeconds: 6,
    telegraphSeconds: 0.8,
    chargeDurationSeconds: 1.1,
    chargeSpeedMult: 3,
  },
} as const;

export type EnemyKind = keyof typeof ENEMY_BASE;

/**
 * Spawn Director curve (spec §8), one row per run minute (row 19 holds after
 * 19:00). Interval ramps 0.8s → 0.14s; the pool unlocks tougher types over
 * time: Swarmers → Runners/Bats → Brutes/Shooters → Splitters/Exploders/
 * Ghosts → Shielded + heavy mixes. Weights are relative within a row.
 */
export const SPAWN_CURVE: ReadonlyArray<{
  intervalSeconds: number;
  weights: Partial<Record<EnemyKind, number>>;
}> = [
  // Horde tuning: every row runs ~25% faster than the original curve (which
  // was already tuned against the L1 kill rate) because individual enemies
  // are weaker now — the screen fills up, the DPS math stays fair.
  /*  0 */ { intervalSeconds: 0.8, weights: { swarmer: 10 } },
  /*  1 */ { intervalSeconds: 0.66, weights: { swarmer: 10, runner: 3 } },
  /*  2 */ { intervalSeconds: 0.5, weights: { swarmer: 10, runner: 5, bat: 4 } },
  /*  3 */ { intervalSeconds: 0.45, weights: { swarmer: 9, runner: 6, bat: 5, brute: 2 } },
  /*  4 */ { intervalSeconds: 0.4, weights: { swarmer: 8, runner: 6, bat: 5, brute: 3, shooter: 2 } },
  /*  5 */ { intervalSeconds: 0.36, weights: { swarmer: 7, runner: 6, bat: 5, brute: 4, shooter: 3 } },
  /*  6 */ { intervalSeconds: 0.31, weights: { swarmer: 6, runner: 6, bat: 5, brute: 4, shooter: 3, splitter: 3 } },
  /*  7 */ { intervalSeconds: 0.28, weights: { swarmer: 5, runner: 6, bat: 5, brute: 4, shooter: 3, splitter: 4, exploder: 3 } },
  /*  8 */ { intervalSeconds: 0.25, weights: { swarmer: 4, runner: 6, bat: 5, brute: 5, shooter: 4, splitter: 4, exploder: 3, ghost: 3 } },
  /*  9 */ { intervalSeconds: 0.23, weights: { swarmer: 4, runner: 5, bat: 5, brute: 5, shooter: 4, splitter: 4, exploder: 4, ghost: 4 } },
  /* 10 */ { intervalSeconds: 0.21, weights: { swarmer: 3, runner: 5, bat: 4, brute: 5, shooter: 4, splitter: 5, exploder: 4, ghost: 4, shielded: 3 } },
  /* 11 */ { intervalSeconds: 0.19, weights: { swarmer: 3, runner: 5, bat: 4, brute: 5, shooter: 4, splitter: 5, exploder: 4, ghost: 5, shielded: 4 } },
  /* 12 */ { intervalSeconds: 0.18, weights: { swarmer: 2, runner: 4, bat: 4, brute: 6, shooter: 5, splitter: 5, exploder: 5, ghost: 5, shielded: 4 } },
  /* 13 */ { intervalSeconds: 0.16, weights: { swarmer: 2, runner: 4, bat: 3, brute: 6, shooter: 5, splitter: 5, exploder: 5, ghost: 5, shielded: 5 } },
  /* 14 */ { intervalSeconds: 0.15, weights: { swarmer: 1, runner: 4, bat: 3, brute: 6, shooter: 5, splitter: 5, exploder: 5, ghost: 6, shielded: 5 } },
  /* 15 */ { intervalSeconds: 0.14, weights: { runner: 4, bat: 2, brute: 7, shooter: 5, splitter: 6, exploder: 6, ghost: 6, shielded: 6 } },
  /* 16 */ { intervalSeconds: 0.13, weights: { runner: 4, brute: 7, shooter: 6, splitter: 6, exploder: 6, ghost: 6, shielded: 7 } },
  /* 17 */ { intervalSeconds: 0.12, weights: { runner: 5, brute: 8, shooter: 6, splitter: 6, exploder: 7, ghost: 7, shielded: 7 } },
  /* 18 */ { intervalSeconds: 0.115, weights: { runner: 5, brute: 8, shooter: 6, splitter: 7, exploder: 7, ghost: 7, shielded: 8 } },
  /* 19 */ { intervalSeconds: 0.11, weights: { runner: 6, brute: 9, shooter: 7, splitter: 7, exploder: 8, ghost: 8, shielded: 9 } },
];

/** Pickup drops from elites/bosses (spec §7). Nuke + gold cache join in Phase 7 with currency. */
export const PICKUPS = {
  healAmount: 20,
  collectDistance: 26,
} as const;

/** Map props (soft obstacles, spec §9). */
export const PROPS = {
  radius: 16, // collision circle
  minDistanceFromSpawn: 260, // keep the player start clear
} as const;

/** Graveyard fog hazard (spec §9): creeping zones that briefly slow the player. */
export const HAZARDS = {
  fogIntervalSeconds: 16, // new fog wave cadence
  fogPerWave: 2,
  fogDurationMs: 9000,
  fogRadius: 130,
  fogSlowFactor: 0.55, // player speed multiplier while inside
  fogDriftSpeed: 25, // px/s creep

  // Inferno: lava pools bubble up near the player and burn anyone standing in them.
  lavaIntervalSeconds: 14,
  lavaPerWave: 2,
  lavaDurationMs: 8000,
  lavaRadius: 85,
  lavaDamagePerSecond: 8, // pre-armor, ticks every 0.5s
  lavaTelegraphMs: 900, // glow-in before it hurts

  // Astral Rift: slow-drifting gravity wells that pull the player toward them.
  voidIntervalSeconds: 15,
  voidPerWave: 2,
  voidDurationMs: 10000,
  voidRadius: 170, // pull field
  voidPullSpeed: 95, // px/s toward the center at the rim, stronger at the core
  voidDriftSpeed: 18,
} as const;

/** Ambient drifting particles per map (dark-fantasy mood layer). */
export const AMBIENT = {
  count: 22, // concurrent motes inside the camera view
  minSpeed: 6,
  maxSpeed: 22,
} as const;

/** Late-game bite without a cliff: HP ×(1 + 0.12·min), contact dmg ×(1 + 0.06·min). */
export const TIME_SCALING = {
  hpPerMinute: 0.12,
  damagePerMinute: 0.06,
  enemyHP: (baseHP: number, minute: number): number =>
    baseHP * (1 + TIME_SCALING.hpPerMinute * minute),
  enemyDamage: (baseDamage: number, minute: number): number =>
    baseDamage * (1 + TIME_SCALING.damagePerMinute * minute),
} as const;

/** Projectile shared tuning. */
export const PROJECTILE = {
  radius: 6, // generous hit circle — small fast enemies were slipping through at 4
  lifetimeMs: 1500, // despawn if nothing was hit
} as const;

/** XP gem behavior (spec §3). */
export const GEMS = {
  collectDistance: 18, // px — gem is absorbed
  magnetSpeed: 450, // px/s toward player once inside pickup radius
} as const;

/** Hard caps that protect the frame rate (spec §2). */
export const LIMITS = {
  maxEnemies: 450, // recycle oldest off-screen enemy beyond this (horde tuning)
  maxDamageNumbers: 40,
  maxParticles: 220,
} as const;

/** Pool pre-warm sizes on run start (spec §2). */
export const POOLS = {
  enemies: 500,
  projectiles: 300,
  gems: 500,
  damageNumbers: 40,
  pickups: 30,
} as const;

/**
 * Spawn Director timing (spec §8). The full minute-by-minute curve
 * (rates + enemy pool unlocks) lands here as a data table in Phase 5.
 */
export const SPAWN = {
  baseIntervalSeconds: 0.8, // ~1 enemy / 0.8s at 0:00, ramps to continuous streams
  eliteWaveIntervalSeconds: 90,
  bossMinutes: [5, 10, 15, 20],
  /** Enemies spawn in a ring just outside the camera, spread around all sides. */
  spawnRingPadding: 64, // px beyond camera bounds
} as const;

/** Loot chests: spawn near the player on a jittered timer, opened on touch. */
export const CHESTS = {
  firstAtSeconds: 45,
  intervalSeconds: 75,
  jitterSeconds: 20, // ± on each interval
  minGold: 20,
  maxGold: 80,
  upgradeChance: 0.65, // chance the chest also grants a random weapon/passive level
  spawnDistanceMin: 350, // px from the player
  spawnDistanceMax: 650,
} as const;

/** Gold economy (spec §11). All earning is scaled by the Greed multiplier. */
export const GOLD = {
  perKillChance: 0.05,
  perKillAmount: 1,
  elitePickup: 25, // gold cache value from elites
  bossPickup: 50,
  completionPerMinute: 10, // run-end bonus: 10 gold per minute survived
  victoryBonus: 150,
} as const;

/** Permanent Power-Up Shop (spec §11). Next rank costs baseCost × (rank+1). */
export interface ShopUpgradeDef {
  id: string;
  name: string;
  ranks: number;
  baseCost: number;
  text: string;
  /** Stat-type upgrades fold into the player stat recompute. */
  stat?: keyof import('./passives').PlayerStats;
  perRank?: number;
}

export const SHOP_UPGRADES: ShopUpgradeDef[] = [
  { id: 'vitality', name: 'Vitality', ranks: 5, baseCost: 100, stat: 'hpMult', perRank: 0.1, text: '+10% max HP' },
  { id: 'might', name: 'Might', ranks: 5, baseCost: 120, stat: 'damageMult', perRank: 0.05, text: '+5% damage' },
  { id: 'swiftness', name: 'Swiftness', ranks: 5, baseCost: 100, stat: 'speedMult', perRank: 0.05, text: '+5% move speed' },
  { id: 'armor', name: 'Armor', ranks: 3, baseCost: 200, stat: 'armorFlat', perRank: 1, text: '-1 damage taken' },
  { id: 'recovery', name: 'Recovery', ranks: 5, baseCost: 120, stat: 'regenPerSec', perRank: 0.2, text: '+0.2 HP/s regen' },
  { id: 'haste', name: 'Haste', ranks: 5, baseCost: 120, stat: 'cooldownMult', perRank: -0.04, text: '-4% cooldown' },
  { id: 'expansion', name: 'Expansion', ranks: 5, baseCost: 110, stat: 'areaMult', perRank: 0.05, text: '+5% area' },
  { id: 'greed', name: 'Greed', ranks: 5, baseCost: 100, stat: 'goldMult', perRank: 0.1, text: '+10% gold gain' },
  { id: 'growth', name: 'Growth', ranks: 5, baseCost: 100, stat: 'xpMult', perRank: 0.05, text: '+5% XP gain' },
  { id: 'magnet', name: 'Magnet', ranks: 3, baseCost: 100, stat: 'magnetMult', perRank: 0.15, text: '+15% pickup radius' },
  { id: 'revival', name: 'Revival', ranks: 2, baseCost: 500, text: '+1 auto-revive per run' },
  { id: 'reroll', name: 'Reroll', ranks: 3, baseCost: 200, text: '+1 level-up reroll per run' },
  { id: 'skip', name: 'Skip', ranks: 1, baseCost: 300, text: 'Unlock Skip on level-ups' },
  { id: 'banish', name: 'Banish', ranks: 1, baseCost: 300, text: 'Unlock Banish on level-ups' },
];

/** Banish charges per run once unlocked (rank is 1-max, so a flat count). */
export const BANISH_CHARGES_PER_RUN = 2;

/** Equip slots (spec §5). */
export const SLOTS = {
  weapons: 6,
  passives: 6,
} as const;

/** Collision spatial hash (spec §2). */
export const COLLISION = {
  cellSize: 64, // px
  playerRadius: 12,
  enemyRadius: 10, // query-slop baseline; per-enemy bodyRadius decides actual hits
} as const;

/** Off-screen culling (spec §2 item 5). */
export const CULLING = {
  margin: 128, // px beyond camera bounds before an enemy is culled
  offscreenRetargetMs: 250, // culled enemies re-aim this often instead of every frame
} as const;

/**
 * Character ultimates: charged by kills, fired with SPACE (desktop) or the
 * bottom-right HUD button (mobile). Effects scale with the run level L.
 */
export const ULTIMATE = {
  killsToCharge: 40,
  buttonSize: 76, // HUD tap target diameter (≥ minTapTargetPx)
  buttonMargin: 18, // from the bottom-right screen corner
  /** Touches this close to the bottom-right corner belong to the ult button, not the joystick. */
  joystickExcludePx: 130,
} as const;

export const ULT_DEFS = {
  ranger: {
    name: 'Arrow Storm',
    desc: 'Volley of arrows for 5s',
    durationMs: 5000,
    volleyIntervalMs: 180,
    arrowsPerVolley: 3,
    damage: 12,
    damagePerLevel: 1.5,
    projectileSpeed: 520,
  },
  brute: {
    name: 'Unbreakable',
    desc: 'Invincible for a few seconds',
    durationMs: 4000,
    durationPerLevelMs: 150,
    maxDurationMs: 9000,
  },
  dasher: {
    name: 'Overdrive',
    desc: '+60% move speed for 10s',
    durationMs: 10000,
    speedMult: 1.6,
    speedMultPerLevel: 0.01,
  },
  warden: {
    name: 'Soul Harvest',
    desc: 'Kills heal you for 8s',
    durationMs: 8000,
    healPerKill: 2,
    healPerLevel: 0.4,
  },
  conjurer: {
    name: 'Summon Wisp',
    desc: 'A wisp fights beside you for 10s',
    durationMs: 10000,
    fireIntervalMs: 400,
    damage: 12,
    damagePerLevel: 1.5,
    range: 340,
    projectileSpeed: 460,
  },
  bomber: {
    name: 'Nova',
    desc: 'Explosion bursts out from you',
    radius: 200,
    radiusPerLevel: 4,
    damage: 55,
    damagePerLevel: 6,
  },
} as const;

/** UI conventions (spec §13). */
export const UI = {
  minTapTargetPx: 44,
  // Level-up overlay ignores taps for this long so a thumb still on the
  // joystick can lift off without accidentally picking a card (mobile).
  levelUpArmDelayMs: 2000,
  colors: {
    background: 0x1a1a2e,
    backgroundCss: '#1a1a2e',
    accent: 0x00e676, // player-bright green (also the XP gem / icon color)
    accentCss: '#00e676',
    danger: 0xff5252,
    text: 0xffffff,
    textCss: '#ffffff',
    dim: 0x8888aa,
    dimCss: '#8888aa',
    scrim: 0x000000, // dark scrim behind text over chaos
    scrimAlpha: 0.55,
  },
} as const;
