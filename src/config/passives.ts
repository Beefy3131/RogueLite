// Passive definitions (spec §6): global stat modifiers offered as level-up
// cards. All ten ship as of Phase 5.

/**
 * The player's derived stat block. Recomputed from scratch whenever a passive
 * changes: base values, then each owned passive adds `perLevel × level`.
 */
export interface PlayerStats {
  damageMult: number;
  cooldownMult: number;
  areaMult: number;
  speedMult: number;
  hpMult: number;
  xpMult: number;
  magnetMult: number;
  armorFlat: number;
  /** Extra projectiles on all count-based weapons (Amount passive, flat). */
  amountBonus: number;
  /** Effect duration multiplier: projectile lifetime, fire patches, etc. */
  durationMult: number;
  /** Chance (0..1) for weapon hits to crit at PLAYER.critMultiplier. */
  critChance: number;
  /** HP per second (Recovery shop upgrade). */
  regenPerSec: number;
  /** Gold gain multiplier (Greed shop upgrade). */
  goldMult: number;
}

export const BASE_STATS: PlayerStats = {
  damageMult: 1,
  cooldownMult: 1,
  areaMult: 1,
  speedMult: 1,
  hpMult: 1,
  xpMult: 1,
  magnetMult: 1,
  armorFlat: 0,
  amountBonus: 0,
  durationMult: 1,
  critChance: 0,
  regenPerSec: 0,
  goldMult: 1,
};

export interface PassiveDef {
  id: string;
  name: string;
  maxLevel: number;
  stat: keyof PlayerStats;
  perLevel: number;
  text: string; // per-level effect, shown on cards
}

export const PASSIVES: PassiveDef[] = [
  { id: 'might', name: 'Might', maxLevel: 5, stat: 'damageMult', perLevel: 0.1, text: '+10% weapon damage' },
  { id: 'wings', name: 'Wings', maxLevel: 5, stat: 'speedMult', perLevel: 0.08, text: '+8% move speed' },
  { id: 'armor', name: 'Armor', maxLevel: 5, stat: 'armorFlat', perLevel: 1, text: '-1 damage taken (min 1)' },
  { id: 'hollowHeart', name: 'Hollow Heart', maxLevel: 5, stat: 'hpMult', perLevel: 0.15, text: '+15% max HP' },
  { id: 'cooldown', name: 'Cooldown', maxLevel: 5, stat: 'cooldownMult', perLevel: -0.06, text: '-6% weapon cooldown' },
  { id: 'area', name: 'Area', maxLevel: 5, stat: 'areaMult', perLevel: 0.1, text: '+10% weapon area' },
  { id: 'magnet', name: 'Magnet', maxLevel: 5, stat: 'magnetMult', perLevel: 0.25, text: '+25% pickup radius' },
  { id: 'growth', name: 'Growth', maxLevel: 5, stat: 'xpMult', perLevel: 0.08, text: '+8% XP gained' },
  // Strong, so only 2 levels (spec §6: L1 & L5 of the old scheme = 2 ranks).
  { id: 'amount', name: 'Amount', maxLevel: 2, stat: 'amountBonus', perLevel: 1, text: '+1 projectile' },
  { id: 'duration', name: 'Duration', maxLevel: 5, stat: 'durationMult', perLevel: 0.12, text: '+12% effect duration' },
];
