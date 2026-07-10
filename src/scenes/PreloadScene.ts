import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import { audio } from '../systems/AudioManager';

/**
 * Loads all real art (spec §15) behind a progress bar, then hands off to the
 * menu. Sources (see public/assets/CREDITS.txt, all CC0):
 *   - 0x72 DungeonTileset II atlas: characters, monsters, pickups (animated)
 *   - Dungeon Crawl Stone Soup: ground tiles, props, projectile effects
 *   - Kenney Particle Pack: soft particle textures (tinted at runtime)
 * A few effect shapes (aura ring, whip arc, joystick…) stay procedural.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const { width, height } = GAME;
    const barWidth = width * 0.4;

    const track = this.add
      .rectangle(width / 2, height / 2, barWidth, 12, 0x000000, 0.6)
      .setStrokeStyle(1, UI.colors.dim);
    const fill = this.add
      .rectangle(width / 2 - barWidth / 2, height / 2, 0, 8, UI.colors.accent)
      .setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      fill.width = (barWidth - 4) * value;
    });
    this.load.on('complete', () => {
      track.destroy();
      fill.destroy();
    });

    // Characters, monsters, chests, coins, flasks — one packed sheet.
    this.load.atlas('dungeon', 'assets/dungeon/sheet.png', 'assets/dungeon/atlas.json');

    // Ground tiles (128×128 composites, tiled across the world).
    for (const g of ['forest', 'graveyard', 'inferno', 'astral']) {
      this.load.image(`ground-${g}`, `assets/tiles/ground-${g}.png`);
    }

    // Props (soft obstacles / decor).
    const props: Record<string, string> = {
      'prop-tree1': 'tree1',
      'prop-tree2': 'tree2',
      'prop-tree3': 'tree3',
      'prop-flowers': 'flower_patch_0',
      'prop-tree-dead1': 'tree_dead1',
      'prop-tree-dead2': 'tree_dead2',
      'prop-tree-dead3': 'tree_dead3',
      'prop-statue-wraith': 'statue_wraith',
      'prop-statue-angel': 'statue_angel',
      'prop-tree-demonic1': 'tree_demonic1',
      'prop-tree-demonic2': 'tree_demonic2',
      'prop-tree-demonic3': 'tree_demonic3',
      'prop-tree-demonic4': 'tree_demonic4',
      'prop-blood-fountain': 'blood_fountain',
      'prop-statue-demon': 'statue_demonic_bust',
      'prop-crystal-orb': 'statue_zot_orb',
      'prop-fountain-spark': 'sparkling_fountain',
      'prop-column': 'crumbled_column_1',
      'prop-statue-imp': 'statue_imp',
    };
    for (const [key, file] of Object.entries(props)) {
      this.load.image(key, `assets/props/${file}.png`);
    }

    // Projectiles / hazard effects (pre-oriented to point east where directional).
    for (const fx of ['bolt', 'arrow', 'venom', 'fireball', 'enemy', 'shard', 'boomerang', 'lava0', 'lava1', 'void']) {
      this.load.image(`fx-${fx}`, `assets/fx/fx-${fx}.png`);
    }

    // Kenney particles (white, soft — tinted per effect at runtime).
    for (const p of [
      'flame_01', 'flame_05', 'smoke_01', 'smoke_04', 'smoke_08',
      'star_04', 'star_07', 'star_09', 'spark_04', 'light_01', 'light_02',
      'twirl_01', 'twirl_02', 'circle_01', 'circle_05', 'flare_01',
      'scorch_01', 'muzzle_01', 'slash_01', 'trace_01', 'dirt_02',
      'magic_01', 'magic_04', 'symbol_02',
    ]) {
      this.load.image(`p-${p}`, `assets/particles/${p}.png`);
    }

    // Real character portraits (hand-made art). Only characters flagged with
    // hasPortrait load a file; a missing PNG just logs a warning and the card
    // falls back to the atlas sprite, so this is safe to ship before every
    // file has been dropped into public/assets/portraits/.
    for (const def of CHARACTERS) {
      if (def.hasPortrait) {
        this.load.image(`portrait-${def.id}`, `assets/portraits/${def.id}.png`);
      }
    }
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[assets] optional asset missing, using placeholder: ${file.key}`);
    });
  }

  create(): void {
    // Crisp pixel art (nearest-neighbor) only for art that's scaled UP: the
    // dungeon sheet sprites and projectile fx. Grounds and props render at or
    // below 1:1 on small screens — NEAREST there shimmers/aliases badly on
    // mobile, so they keep the default LINEAR filtering.
    const pixelKeys = [
      'dungeon',
      ...Object.keys(this.textures.list).filter(k => k.startsWith('fx-')),
    ];
    for (const key of pixelKeys) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    this.registerAnimations();
    this.generatePlaceholderTextures();
    // Music + SFX samples decode in the background; synth fills in meanwhile.
    audio.preloadFiles();
    this.scene.start('MainMenu');
  }

  /** Global animation registry — sprites play these by key from any scene. */
  private registerAnimations(): void {
    const reg = (key: string, prefix: string, frames: number, frameRate: number, repeat = -1) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: Array.from({ length: frames }, (_, i) => ({
          key: 'dungeon',
          frame: `${prefix}_f${i}`,
        })),
        frameRate,
        repeat,
      });
    };

    // Player characters: idle + run (4 frames each in the 0x72 sheet).
    for (const def of CHARACTERS) {
      reg(`${def.sprite}-idle`, `${def.sprite}_idle_anim`, 4, 6);
      reg(`${def.sprite}-run`, `${def.sprite}_run_anim`, 4, 10);
    }

    // Enemies (keys referenced by ENEMY_LOOKS in config/enemies.ts).
    reg('tiny_zombie_run', 'tiny_zombie_run_anim', 4, 8);
    reg('goblin_run', 'goblin_run_anim', 4, 10);
    reg('orc_warrior_run', 'orc_warrior_run_anim', 4, 8);
    reg('imp_run', 'imp_run_anim', 4, 10);
    reg('necromancer_idle', 'necromancer_anim', 4, 6);
    reg('muddy_idle', 'muddy_anim', 4, 6);
    reg('tiny_slug_idle', 'tiny_slug_anim', 4, 8);
    reg('chort_run', 'chort_run_anim', 4, 10);
    reg('skelet_run', 'skelet_run_anim', 4, 8);
    reg('masked_orc_run', 'masked_orc_run_anim', 4, 8);
    reg('ogre_run', 'ogre_run_anim', 4, 7);
    reg('big_demon_run', 'big_demon_run_anim', 4, 7);

    // Pickups / summons.
    reg('coin-spin', 'coin_anim', 4, 8);
    reg('chest-open', 'chest_full_open_anim', 3, 10, 0);
    reg('angel-idle', 'angel_idle_anim', 4, 6);
  }

  /** Procedural effect shapes that real art doesn't cover. */
  private generatePlaceholderTextures(): void {
    const g = this.add.graphics();

    // 1x1 white pixel — tint/scale it for bars, scrims, flashes.
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('pixel', 1, 1);
    g.clear();

    // XP gem: small diamond (kept procedural — reads instantly among chaos).
    g.fillStyle(0x40c4ff, 1);
    g.fillPoints(
      [
        { x: 6, y: 0 },
        { x: 12, y: 6 },
        { x: 6, y: 12 },
        { x: 0, y: 6 },
      ],
      true,
    );
    g.generateTexture('gem', 12, 12);
    g.clear();

    // Fallback ground (never used unless a map texture fails to load).
    g.fillStyle(UI.colors.background, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x2a2a4e, 1);
    g.strokeRect(0, 0, 64, 64);
    g.generateTexture('ground', 64, 64);
    g.clear();

    // Fog blob: soft grey disc, drifts and slows the player (graveyard hazard).
    g.fillStyle(0xb0bec5, 0.13);
    g.fillCircle(130, 130, 130);
    g.fillStyle(0xb0bec5, 0.15);
    g.fillCircle(130, 130, 95);
    g.fillStyle(0xcfd8dc, 0.17);
    g.fillCircle(130, 130, 60);
    g.generateTexture('fog', 260, 260);
    g.clear();

    // Default projectile: small bright bolt (pool fallback).
    g.fillStyle(0xffe57f, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('projectile', 8, 8);
    g.clear();

    // Aura field: translucent green disc (base radius 70 → 140px texture).
    g.fillStyle(0x00e676, 0.22);
    g.fillCircle(70, 70, 70);
    g.lineStyle(2, 0x00e676, 0.45);
    g.strokeCircle(70, 70, 69);
    g.generateTexture('aura', 140, 140);
    g.clear();

    // Whip sweep: 120° wedge pointing right (base range 90 → 180px texture).
    g.fillStyle(0xffffff, 0.5);
    g.slice(90, 90, 90, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false);
    g.fillPath();
    g.generateTexture('whip-arc', 180, 180);
    g.clear();

    // Knife: thin white blade (points right; rotated to flight direction).
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 2, 14, 4);
    g.fillStyle(0xb0bec5, 1);
    g.fillRect(0, 2, 4, 4);
    g.generateTexture('projectile-knife', 14, 8);
    g.clear();

    // Bomb in flight.
    g.fillStyle(0xbf360c, 1);
    g.fillCircle(7, 7, 7);
    g.fillStyle(0xffab91, 1);
    g.fillCircle(4, 4, 2);
    g.generateTexture('bomb', 14, 14);
    g.clear();

    // Explosion flash (base radius 40 → scaled at runtime).
    g.fillStyle(0xffab40, 0.7);
    g.fillCircle(40, 40, 40);
    g.fillStyle(0xfff176, 0.9);
    g.fillCircle(40, 40, 22);
    g.generateTexture('explosion', 80, 80);
    g.clear();

    // Fire patch (base radius 40, translucent).
    g.fillStyle(0xff7043, 0.3);
    g.fillCircle(40, 40, 40);
    g.lineStyle(2, 0xff7043, 0.5);
    g.strokeCircle(40, 40, 39);
    g.generateTexture('fire-patch', 80, 80);
    g.clear();

    // Lightning: jagged vertical bolt.
    g.fillStyle(0xfff59d, 1);
    g.fillPoints([{ x: 14, y: 0 }, { x: 22, y: 0 }, { x: 12, y: 26 }, { x: 18, y: 26 }, { x: 6, y: 56 }, { x: 10, y: 30 }, { x: 4, y: 30 }], true);
    g.generateTexture('lightning-bolt', 24, 56);
    g.clear();

    // Virtual joystick: base ring + thumb puck.
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(64, 64, 60);
    g.generateTexture('joy-base', 128, 128);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 24, 22);
    g.generateTexture('joy-thumb', 48, 48);
    g.destroy();
  }
}
