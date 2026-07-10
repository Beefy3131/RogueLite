// Map definitions (spec §9): palette, props, enemy weighting, pacing, hazard.
// Ground/prop art comes from the Dungeon Crawl Stone Soup tile set (CC0),
// loaded in PreloadScene from public/assets/tiles + /props.

import type { EnemyKind } from './balance';

export type MapHazard = 'none' | 'slowFog' | 'lavaPools' | 'voidRifts';

/** Ambient drifting-mote style (AmbientDrift system). */
export type AmbientStyle = 'spores' | 'mist' | 'embers' | 'astral';

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
  hazard: MapHazard;
  hazardText: string;
  ambient: AmbientStyle;
  previewColor: number;
  unlock: { type: 'default' } | { type: 'surviveOnMap'; mapId: string; seconds: number };
}

export const MAPS: MapDef[] = [
  {
    id: 'forest',
    name: 'Emerald Wood',
    tagline: 'Standard mix, standard pacing. Learn the game here.',
    groundTexture: 'ground-forest',
    propTextures: ['prop-tree1', 'prop-tree2', 'prop-tree3', 'prop-flowers'],
    propCount: 30,
    enemyWeightMult: {},
    escalationMult: 1,
    hazard: 'none',
    hazardText: 'Hazard: none',
    ambient: 'spores',
    previewColor: 0x1d3320,
    unlock: { type: 'default' },
  },
  {
    id: 'graveyard',
    name: 'Ruined Graveyard',
    tagline: 'Ghosts and shooters. Faster escalation. Slowing fog.',
    groundTexture: 'ground-graveyard',
    propTextures: ['prop-tree-dead1', 'prop-tree-dead2', 'prop-tree-dead3', 'prop-statue-wraith', 'prop-statue-angel'],
    propCount: 34,
    enemyWeightMult: { ghost: 3, shooter: 2 },
    escalationMult: 1.25,
    hazard: 'slowFog',
    hazardText: 'Hazard: slowing fog',
    ambient: 'mist',
    previewColor: 0x232030,
    unlock: { type: 'surviveOnMap', mapId: 'forest', seconds: 600 },
  },
  {
    id: 'inferno',
    name: 'Infernal Wastes',
    tagline: 'Demons and exploders. Fast escalation. Lava erupts underfoot.',
    groundTexture: 'ground-inferno',
    propTextures: ['prop-tree-demonic1', 'prop-tree-demonic2', 'prop-tree-demonic3', 'prop-tree-demonic4', 'prop-blood-fountain', 'prop-statue-demon'],
    propCount: 30,
    enemyWeightMult: { bat: 2.5, exploder: 2.5, brute: 1.5 },
    escalationMult: 1.45,
    hazard: 'lavaPools',
    hazardText: 'Hazard: erupting lava',
    ambient: 'embers',
    previewColor: 0x2e1210,
    unlock: { type: 'surviveOnMap', mapId: 'graveyard', seconds: 600 },
  },
  {
    id: 'astral',
    name: 'Astral Rift',
    tagline: 'Reality frays. Everything comes early, and the void pulls.',
    groundTexture: 'ground-astral',
    propTextures: ['prop-crystal-orb', 'prop-fountain-spark', 'prop-column', 'prop-statue-imp'],
    propCount: 24,
    enemyWeightMult: { ghost: 2, shooter: 1.5, splitter: 2, shielded: 1.5 },
    escalationMult: 1.6,
    hazard: 'voidRifts',
    hazardText: 'Hazard: gravity rifts',
    ambient: 'astral',
    previewColor: 0x1c1033,
    unlock: { type: 'surviveOnMap', mapId: 'inferno', seconds: 600 },
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
