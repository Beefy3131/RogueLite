// Enemy presentation/behavior descriptors (spec §7). Stats live in balance.ts
// ENEMY_BASE; this maps each kind to its texture, movement style, and looks.

import type { EnemyKind } from './balance';

export type EnemyMovement =
  | 'chase' // straight at the player
  | 'erratic' // bat weave
  | 'keepDistance' // shooter
  | 'boss'; // roam + telegraphed charge

export interface EnemyDescriptor {
  texture: string;
  movement: EnemyMovement;
  /** Death-burst particle tint (matches the sprite hue). */
  color: number;
  /** Baked-in alpha (ghost is translucent). */
  alpha?: number;
  /** Rotate the sprite to face its velocity (shielded shows its shield edge). */
  faceVelocity?: boolean;
}

export const ENEMY_LOOKS: Record<EnemyKind, EnemyDescriptor> = {
  swarmer: { texture: 'enemy-swarmer', movement: 'chase', color: 0xef5350 },
  runner: { texture: 'enemy-runner', movement: 'chase', color: 0xffa726 },
  brute: { texture: 'enemy-brute', movement: 'chase', color: 0x8e2424 },
  bat: { texture: 'enemy-bat', movement: 'erratic', color: 0xab47bc },
  shooter: { texture: 'enemy-shooter', movement: 'keepDistance', color: 0x26c6da },
  splitter: { texture: 'enemy-splitter', movement: 'chase', color: 0xf06292 },
  mini: { texture: 'enemy-mini', movement: 'chase', color: 0xf48fb1 },
  exploder: { texture: 'enemy-exploder', movement: 'chase', color: 0xff7043 },
  ghost: { texture: 'enemy-ghost', movement: 'chase', color: 0xb3e5fc, alpha: 0.6 },
  shielded: { texture: 'enemy-shielded', movement: 'chase', color: 0x78909c, faceVelocity: true },
  elite: { texture: 'enemy-elite', movement: 'chase', color: 0xffd54f },
  boss: { texture: 'enemy-boss', movement: 'boss', color: 0xd81b60 },
};
