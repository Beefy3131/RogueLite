// Weapon definitions (spec §5): behavior + 8-level scaling tables.
// L1 baselines (damage/cooldown/speed/radius) live in balance.ts WEAPON_BASE;
// these tables describe how each level changes things. All 8 ship as of Phase 5.

export type WeaponId =
  | 'magicBolt'
  | 'whip'
  | 'aura'
  | 'knife'
  | 'orbit'
  | 'fireBomb'
  | 'lightning'
  | 'boomerang';

export type WeaponBehavior =
  | 'nearestTarget' // Magic Bolt
  | 'sweep' // Whip
  | 'aura' // Aura
  | 'movementDirection' // Throwing Knife
  | 'orbit' // Orbit Shards
  | 'lob' // Fire Bomb
  | 'randomStrike' // Lightning
  | 'boomerang'; // Boomerang

/** Absolute stats at a given level (not deltas). Index 0 = level 1. */
export interface WeaponLevelStats {
  damage: number;
  /** Projectiles/whips/shards/strikes per activation. Amount passive adds to this. */
  count?: number;
  /** Enemies a projectile can pass through. */
  pierce?: number;
  /** Multiplier on the weapon's base radius/range/arc. */
  areaScale?: number;
  /** Multiplier on the weapon's base projectile speed. */
  speedScale?: number;
  /** Lightning: extra chained hits per strike (L5+). */
  chain?: number;
  /** Fire Bomb: leaves a burning patch (L6+). */
  patch?: boolean;
  /** Card text shown when this level is offered. */
  text: string;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  behavior: WeaponBehavior;
  maxLevel: number;
  levels: WeaponLevelStats[];
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  magicBolt: {
    id: 'magicBolt',
    name: 'Magic Bolt',
    behavior: 'nearestTarget',
    maxLevel: 8,
    levels: [
      // 12, not the spec draft's 10: swarmers time-scale past 10 HP within
      // seconds, and if the starting bolt 2-hits them the minute-one exchange
      // rate loses to the spawn rate no matter how well you play. 12 keeps
      // true one-shots until ~1:40, when the first upgrades arrive.
      { damage: 12, count: 1, pierce: 0, text: 'Fires at the nearest enemy' },
      { damage: 14, count: 1, pierce: 0, text: '+damage' },
      { damage: 13, count: 2, pierce: 0, text: '+1 bolt' },
      { damage: 16, count: 2, pierce: 1, text: '+damage, bolts pierce 1' },
      { damage: 16, count: 3, pierce: 1, text: '+1 bolt' },
      { damage: 20, count: 3, pierce: 1, text: '+damage' },
      { damage: 20, count: 4, pierce: 1, text: '+1 bolt' },
      { damage: 25, count: 4, pierce: 2, text: '+damage, +1 pierce' },
    ],
  },
  whip: {
    id: 'whip',
    name: 'Whip',
    behavior: 'sweep',
    maxLevel: 8,
    levels: [
      { damage: 12, count: 1, areaScale: 1.0, text: 'Sweeps an arc in front of you' },
      { damage: 16, count: 1, areaScale: 1.1, text: '+damage, +area' },
      { damage: 16, count: 2, areaScale: 1.15, text: 'Second whip behind you' },
      { damage: 20, count: 2, areaScale: 1.2, text: '+damage, +area' },
      { damage: 24, count: 2, areaScale: 1.3, text: '+damage, +area' },
      { damage: 28, count: 2, areaScale: 1.4, text: '+damage, +area' },
      { damage: 34, count: 2, areaScale: 1.5, text: '+damage, +area' },
      { damage: 40, count: 2, areaScale: 1.6, text: '+damage, +area' },
    ],
  },
  aura: {
    id: 'aura',
    name: 'Aura',
    behavior: 'aura',
    maxLevel: 8,
    levels: [
      { damage: 5, areaScale: 1.0, text: 'Damaging field around you' },
      { damage: 6, areaScale: 1.14, text: '+damage, +radius' },
      { damage: 7, areaScale: 1.26, text: '+damage, +radius' },
      { damage: 8, areaScale: 1.37, text: '+damage, +radius' },
      { damage: 10, areaScale: 1.5, text: '+damage, +radius' },
      { damage: 11, areaScale: 1.64, text: '+damage, +radius' },
      { damage: 13, areaScale: 1.79, text: '+damage, +radius' },
      { damage: 15, areaScale: 2.0, text: '+damage, +radius' },
    ],
  },
  knife: {
    id: 'knife',
    name: 'Throwing Knife',
    behavior: 'movementDirection',
    maxLevel: 8,
    levels: [
      { damage: 8, count: 1, pierce: 1, speedScale: 1.0, text: 'Fires where you move, pierces 1' },
      { damage: 10, count: 1, pierce: 1, speedScale: 1.0, text: '+damage' },
      { damage: 10, count: 2, pierce: 1, speedScale: 1.05, text: '+1 knife' },
      { damage: 12, count: 2, pierce: 2, speedScale: 1.05, text: '+damage, +1 pierce' },
      { damage: 12, count: 3, pierce: 2, speedScale: 1.1, text: '+1 knife' },
      { damage: 15, count: 3, pierce: 2, speedScale: 1.2, text: '+damage, +speed' },
      { damage: 15, count: 4, pierce: 2, speedScale: 1.2, text: '+1 knife' },
      { damage: 18, count: 4, pierce: 3, speedScale: 1.3, text: '+damage, +1 pierce' },
    ],
  },
  orbit: {
    id: 'orbit',
    name: 'Orbit Shards',
    behavior: 'orbit',
    maxLevel: 8,
    levels: [
      { damage: 8, count: 2, areaScale: 1.0, speedScale: 1.0, text: 'Shards circle around you' },
      { damage: 8, count: 3, areaScale: 1.0, speedScale: 1.0, text: '+1 shard' },
      { damage: 10, count: 3, areaScale: 1.17, speedScale: 1.1, text: '+damage, +radius' },
      { damage: 10, count: 4, areaScale: 1.17, speedScale: 1.1, text: '+1 shard' },
      { damage: 12, count: 4, areaScale: 1.33, speedScale: 1.2, text: '+damage, +radius' },
      { damage: 12, count: 5, areaScale: 1.33, speedScale: 1.2, text: '+1 shard' },
      { damage: 14, count: 5, areaScale: 1.5, speedScale: 1.35, text: '+damage, +radius, +speed' },
      { damage: 16, count: 6, areaScale: 1.5, speedScale: 1.35, text: '+1 shard, +damage' },
    ],
  },
  fireBomb: {
    id: 'fireBomb',
    name: 'Fire Bomb',
    behavior: 'lob',
    maxLevel: 8,
    levels: [
      { damage: 20, count: 1, areaScale: 1.0, text: 'Lobbed bomb, explodes on landing' },
      { damage: 24, count: 1, areaScale: 1.1, text: '+damage, +blast radius' },
      { damage: 24, count: 2, areaScale: 1.1, text: '+1 bomb' },
      { damage: 28, count: 2, areaScale: 1.2, text: '+damage, +blast radius' },
      { damage: 32, count: 2, areaScale: 1.3, text: '+damage, +blast radius' },
      { damage: 32, count: 2, areaScale: 1.3, patch: true, text: 'Leaves a burning patch' },
      { damage: 36, count: 3, areaScale: 1.4, patch: true, text: '+1 bomb, +damage' },
      { damage: 40, count: 3, areaScale: 1.5, patch: true, text: '+damage, +blast radius' },
    ],
  },
  lightning: {
    id: 'lightning',
    name: 'Lightning',
    behavior: 'randomStrike',
    maxLevel: 8,
    levels: [
      { damage: 18, count: 1, text: 'Strikes a random enemy' },
      { damage: 18, count: 2, text: '+1 strike' },
      { damage: 22, count: 2, text: '+damage' },
      { damage: 22, count: 3, text: '+1 strike' },
      { damage: 22, count: 3, chain: 1, text: 'Chains to a nearby enemy' },
      { damage: 26, count: 4, chain: 1, text: '+1 strike, +damage' },
      { damage: 26, count: 5, chain: 1, text: '+1 strike' },
      { damage: 32, count: 6, chain: 2, text: '+damage, +1 strike, +1 chain' },
    ],
  },
  boomerang: {
    id: 'boomerang',
    name: 'Boomerang',
    behavior: 'boomerang',
    maxLevel: 8,
    levels: [
      { damage: 12, count: 1, areaScale: 1.0, text: 'Flies out and returns, pierces all' },
      { damage: 15, count: 1, areaScale: 1.0, text: '+damage' },
      { damage: 15, count: 2, areaScale: 1.0, text: '+1 boomerang' },
      { damage: 18, count: 2, areaScale: 1.27, text: '+damage, +range' },
      { damage: 18, count: 3, areaScale: 1.27, text: '+1 boomerang' },
      { damage: 22, count: 3, areaScale: 1.27, text: '+damage' },
      { damage: 22, count: 4, areaScale: 1.5, text: '+1 boomerang, +range' },
      { damage: 26, count: 4, areaScale: 1.5, text: '+damage' },
    ],
  },
};
