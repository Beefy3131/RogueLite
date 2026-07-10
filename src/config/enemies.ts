// Enemy presentation/behavior descriptors (spec §7). Stats live in balance.ts
// ENEMY_BASE; this maps each kind to its dungeon-atlas animation, movement
// style, and looks. Anim keys reference animations registered in PreloadScene
// from the 0x72 DungeonTileset II atlas (CC0).

import type { EnemyKind } from './balance';

export type EnemyMovement =
  | 'chase' // straight at the player
  | 'erratic' // bat weave
  | 'keepDistance' // shooter
  | 'boss'; // roam + telegraphed charge

export interface EnemyDescriptor {
  /** Looping walk animation key (see PreloadScene.registerAnimations). */
  anim: string;
  /** Display scale on top of the atlas frame size (bodies come from balance radii). */
  scale: number;
  movement: EnemyMovement;
  /** Death-burst particle tint (matches the sprite hue). */
  color: number;
  /** Baked-in alpha (ghost is translucent). */
  alpha?: number;
}

export const ENEMY_LOOKS: Record<EnemyKind, EnemyDescriptor> = {
  swarmer: { anim: 'tiny_zombie_run', scale: 1.5, movement: 'chase', color: 0x7cb342 },
  runner: { anim: 'goblin_run', scale: 1.3, movement: 'chase', color: 0x8bc34a },
  brute: { anim: 'orc_warrior_run', scale: 1.7, movement: 'chase', color: 0x8e6d24 },
  bat: { anim: 'imp_run', scale: 1.25, movement: 'erratic', color: 0xef5350 },
  shooter: { anim: 'necromancer_idle', scale: 1.4, movement: 'keepDistance', color: 0x26c6da },
  splitter: { anim: 'muddy_idle', scale: 1.55, movement: 'chase', color: 0x8d6e63 },
  mini: { anim: 'tiny_slug_idle', scale: 1.35, movement: 'chase', color: 0xa1887f },
  exploder: { anim: 'chort_run', scale: 1.15, movement: 'chase', color: 0xff7043 },
  ghost: { anim: 'skelet_run', scale: 1.4, movement: 'chase', color: 0xb3e5fc, alpha: 0.62 },
  shielded: { anim: 'masked_orc_run', scale: 1.5, movement: 'chase', color: 0x78909c },
  elite: { anim: 'ogre_run', scale: 1.35, movement: 'chase', color: 0xffd54f },
  boss: { anim: 'big_demon_run', scale: 2.0, movement: 'boss', color: 0xd81b60 },
};
