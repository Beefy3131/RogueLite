// Character definitions (spec §4): base stat modifiers + starting weapon +
// one signature perk. Multiplier mods multiply the derived stats; flat mods add.

import type { PlayerStats } from './passives';
import type { WeaponId } from './weapons';

export type UnlockCondition =
  | { type: 'default' }
  | { type: 'gold'; cost: number } // purchasable once the Phase 7 shop exists
  | { type: 'bestTime'; seconds: number }
  | { type: 'totalKills'; kills: number };

export interface CharacterDef {
  id: string;
  name: string;
  /** Tint applied to the white player base sprite. */
  tint: number;
  startWeapon: WeaponId;
  perkText: string;
  /** Compact stat arrows for the select screen, e.g. "HP↑ Spd↓". */
  statLine: string;
  unlock: UnlockCondition;
  /** Multiplier keys multiply, flat keys add (amountBonus/armorFlat/critChance). */
  mods: Partial<PlayerStats>;
  /** Brute signature: contact attackers take this much damage back. */
  thorns?: number;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'ranger',
    name: 'Ranger',
    tint: 0x00e676,
    startWeapon: 'magicBolt',
    perkText: 'Balanced. +5% XP gain',
    statLine: 'Balanced',
    unlock: { type: 'default' },
    mods: { xpMult: 1.05 },
  },
  {
    id: 'brute',
    name: 'Brute',
    tint: 0xef5350,
    startWeapon: 'whip',
    perkText: '+30% max HP. Enemies that touch you take damage. -10% move speed',
    statLine: 'HP↑ Spd↓',
    unlock: { type: 'gold', cost: 500 },
    mods: { hpMult: 1.3, speedMult: 0.9 },
    thorns: 5,
  },
  {
    id: 'dasher',
    name: 'Dasher',
    tint: 0xffee58,
    startWeapon: 'knife',
    perkText: '+20% move speed, +10% crit chance. -15% max HP',
    statLine: 'Spd↑ Crit↑ HP↓',
    unlock: { type: 'bestTime', seconds: 600 },
    mods: { speedMult: 1.2, critChance: 0.1, hpMult: 0.85 },
  },
  {
    id: 'warden',
    name: 'Warden',
    tint: 0x42a5f5,
    startWeapon: 'aura',
    perkText: '+25% weapon area, +1.5 armor',
    statLine: 'Area↑ Armor↑',
    unlock: { type: 'gold', cost: 800 },
    mods: { areaMult: 1.25, armorFlat: 1.5 },
  },
  {
    id: 'conjurer',
    name: 'Conjurer',
    tint: 0xab47bc,
    startWeapon: 'orbit',
    perkText: '+1 projectile on all weapons, +20% duration',
    statLine: 'Amount↑ Dur↑',
    unlock: { type: 'totalKills', kills: 5000 },
    mods: { amountBonus: 1, durationMult: 1.2 },
  },
  {
    id: 'bomber',
    name: 'Bomber',
    tint: 0xffa726,
    startWeapon: 'fireBomb',
    perkText: '+25% area, +15% weapon damage. 10% slower cooldowns',
    statLine: 'Area↑ Dmg↑ CD↓',
    unlock: { type: 'gold', cost: 1200 },
    mods: { areaMult: 1.25, damageMult: 1.15, cooldownMult: 1.1 },
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}

export interface UnlockProgress {
  totalKills: number;
  bestTimeSeconds: number;
  /** Debug/testing override (?unlock) and, later, Phase 7 shop purchases. */
  unlockedIds: ReadonlySet<string>;
  unlockAll: boolean;
}

export function isCharacterUnlocked(def: CharacterDef, progress: UnlockProgress): boolean {
  if (progress.unlockAll || progress.unlockedIds.has(def.id)) return true;
  switch (def.unlock.type) {
    case 'default':
      return true;
    case 'bestTime':
      return progress.bestTimeSeconds >= def.unlock.seconds;
    case 'totalKills':
      return progress.totalKills >= def.unlock.kills;
    case 'gold':
      return false; // purchased in the Phase 7 shop
  }
}

export function unlockText(def: CharacterDef): string {
  switch (def.unlock.type) {
    case 'default':
      return '';
    case 'gold':
      return `Unlock: ${def.unlock.cost} gold (shop)`;
    case 'bestTime':
      return `Unlock: reach ${Math.floor(def.unlock.seconds / 60)}:00 in a run`;
    case 'totalKills':
      return `Unlock: ${def.unlock.kills.toLocaleString()} total kills`;
  }
}
