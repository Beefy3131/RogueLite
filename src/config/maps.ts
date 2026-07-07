// Map definitions (spec §9): palette, props, enemy weighting, pacing, hazard.

import type { EnemyKind } from './balance';

export interface MapDef {
  id: string;
  name: string;
  tagline: string;
  groundTexture: string;
  propTextures: string[];
  propCount: number;
  /**
   * Multiplies the spawn-curve weight for a kind. Kinds not yet in the
   * curve row get a small base weight from minute 2 when boosted here —
   * graveyard ghosts show up early.
   */
  enemyWeightMult: Partial<Record<EnemyKind, number>>;
  /** >1 = the run minute counts faster into the spawn curve. */
  escalationMult: number;
  hazard: 'none' | 'slowFog';
  previewColor: number;
  unlock: { type: 'default' } | { type: 'surviveOnMap'; mapId: string; seconds: number };
}

export const MAPS: MapDef[] = [
  {
    id: 'forest',
    name: 'Overgrown Forest',
    tagline: 'Standard mix, standard pacing. Learn the game here.',
    groundTexture: 'ground-forest',
    propTextures: ['prop-tree', 'prop-rock'],
    propCount: 26,
    enemyWeightMult: {},
    escalationMult: 1,
    hazard: 'none',
    previewColor: 0x1d3320,
    unlock: { type: 'default' },
  },
  {
    id: 'graveyard',
    name: 'Ruined Graveyard',
    tagline: 'Ghosts and shooters. Faster escalation. Slowing fog.',
    groundTexture: 'ground-graveyard',
    propTextures: ['prop-tombstone'],
    propCount: 32,
    enemyWeightMult: { ghost: 3, shooter: 2 },
    escalationMult: 1.25,
    hazard: 'slowFog',
    previewColor: 0x232030,
    unlock: { type: 'surviveOnMap', mapId: 'forest', seconds: 600 },
  },
];

export function getMap(id: string): MapDef {
  return MAPS.find(m => m.id === id) ?? MAPS[0];
}

export function isMapUnlocked(
  def: MapDef,
  progress: { bestTimeOnMap: (mapId: string) => number; unlockAll: boolean },
): boolean {
  if (progress.unlockAll) return true;
  if (def.unlock.type === 'default') return true;
  return progress.bestTimeOnMap(def.unlock.mapId) >= def.unlock.seconds;
}

export function mapUnlockText(def: MapDef): string {
  if (def.unlock.type === 'default') return '';
  const m = Math.floor(def.unlock.seconds / 60);
  return `Unlock: survive ${m}:00 on ${getMap(def.unlock.mapId).name}`;
}
