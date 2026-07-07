import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';

/**
 * Loads/generates all assets behind a progress bar, then hands off to the menu.
 * Phase 1 has no external assets — placeholder textures are generated here so
 * later phases reference everything by key (spec §15: real art drops into the
 * atlas later without touching logic).
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

    // External asset loads (atlas, audio) go here in later phases.
  }

  create(): void {
    this.generatePlaceholderTextures();
    this.scene.start('MainMenu');
  }

  /** Flat-color textures, referenced by key everywhere. */
  private generatePlaceholderTextures(): void {
    const g = this.add.graphics();

    // 1x1 white pixel — tint/scale it for bars, scrims, flashes.
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('pixel', 1, 1);
    g.clear();

    // Player: white base tinted per character (spec §4). Notch shows facing.
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x1a1a2e, 1);
    g.fillRect(16, 9, 6, 6);
    g.generateTexture('player', 24, 24);
    g.clear();

    // XP gem placeholder: small diamond.
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

    // Enemies: one strong color-coded silhouette per type (spec §15).
    const circleEnemy = (key: string, r: number, fill: number, core?: number, alpha = 1) => {
      g.fillStyle(fill, alpha);
      g.fillCircle(r, r, r);
      if (core !== undefined) {
        g.fillStyle(core, alpha);
        g.fillCircle(r, r, r * 0.45);
      }
      g.generateTexture(key, r * 2, r * 2);
      g.clear();
    };
    const squareEnemy = (key: string, size: number, fill: number, core?: number) => {
      g.fillStyle(fill, 1);
      g.fillRect(0, 0, size, size);
      if (core !== undefined) {
        g.fillStyle(core, 1);
        g.fillRect(size * 0.28, size * 0.28, size * 0.44, size * 0.44);
      }
      g.generateTexture(key, size, size);
      g.clear();
    };

    circleEnemy('enemy-swarmer', 8, 0xef5350, 0xb71c1c);
    circleEnemy('enemy-runner', 7, 0xffa726, 0xe65100);
    squareEnemy('enemy-brute', 28, 0x8e2424, 0x5c1010);
    // Bat: violet diamond.
    g.fillStyle(0xab47bc, 1);
    g.fillPoints([{ x: 6, y: 0 }, { x: 12, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 6 }], true);
    g.generateTexture('enemy-bat', 12, 12);
    g.clear();
    squareEnemy('enemy-shooter', 18, 0x26c6da, 0x00838f);
    circleEnemy('enemy-splitter', 10, 0xf06292, 0xc2185b);
    circleEnemy('enemy-mini', 5, 0xf48fb1);
    circleEnemy('enemy-exploder', 9, 0xff7043, 0xffeb3b); // yellow core = telegraphed danger
    circleEnemy('enemy-ghost', 8, 0xb3e5fc, undefined, 0.6);
    // Shielded: grey square with a white shield stripe on its front (right) edge.
    g.fillStyle(0x78909c, 1);
    g.fillRect(0, 0, 20, 20);
    g.fillStyle(0xffffff, 1);
    g.fillRect(15, 0, 5, 20);
    g.generateTexture('enemy-shielded', 20, 20);
    g.clear();
    circleEnemy('enemy-elite', 18, 0xffd54f, 0xff8f00);
    squareEnemy('enemy-boss', 56, 0xd81b60, 0x880e4f);

    // Ground tiles per map (spec §9 palettes). Faint grid so motion reads.
    const ground = (key: string, base: number, line: number, speckle: number) => {
      g.fillStyle(base, 1);
      g.fillRect(0, 0, 64, 64);
      g.lineStyle(1, line, 1);
      g.strokeRect(0, 0, 64, 64);
      g.fillStyle(speckle, 0.5);
      g.fillCircle(17, 26, 2);
      g.fillCircle(44, 51, 2);
      g.fillCircle(52, 12, 1.5);
      g.generateTexture(key, 64, 64);
      g.clear();
    };
    ground('ground', UI.colors.background, 0x2a2a4e, 0x2a2a4e); // fallback
    ground('ground-forest', 0x18281b, 0x223626, 0x2c4a30); // greens
    ground('ground-graveyard', 0x1b1826, 0x272236, 0x353046); // cold purples

    // Props: forest tree/rock, graveyard tombstone.
    g.fillStyle(0x2e7d32, 1);
    g.fillCircle(16, 13, 13);
    g.fillStyle(0x5d4037, 1);
    g.fillRect(13, 22, 6, 10);
    g.generateTexture('prop-tree', 32, 32);
    g.clear();
    g.fillStyle(0x757575, 1);
    g.fillCircle(14, 16, 11);
    g.fillCircle(22, 19, 8);
    g.fillStyle(0x9e9e9e, 1);
    g.fillCircle(12, 13, 5);
    g.generateTexture('prop-rock', 32, 30);
    g.clear();
    g.fillStyle(0x9e9e9e, 1);
    g.fillRoundedRect(4, 0, 20, 26, 9);
    g.fillRect(0, 24, 28, 6);
    g.fillStyle(0x616161, 1);
    g.fillRect(11, 8, 6, 2);
    g.fillRect(13, 6, 2, 8);
    g.generateTexture('prop-tombstone', 28, 30);
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

    // Projectile: small bright bolt.
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

    // Enemy shot: red orb.
    g.fillStyle(0xff5252, 1);
    g.fillCircle(5, 5, 5);
    g.fillStyle(0xffcdd2, 1);
    g.fillCircle(5, 5, 2);
    g.generateTexture('projectile-enemy', 10, 10);
    g.clear();

    // Orbit shard: light-blue diamond.
    g.fillStyle(0x80d8ff, 1);
    g.fillPoints([{ x: 7, y: 0 }, { x: 14, y: 7 }, { x: 7, y: 14 }, { x: 0, y: 7 }], true);
    g.generateTexture('shard', 14, 14);
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

    // Boomerang: white chevron.
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 14, 4);
    g.fillRect(0, 0, 4, 14);
    g.generateTexture('projectile-boomerang', 14, 14);
    g.clear();

    // Pickups: heal cross / magnet ring.
    g.fillStyle(0x66bb6a, 1);
    g.fillRect(6, 0, 6, 18);
    g.fillRect(0, 6, 18, 6);
    g.generateTexture('pickup-heal', 18, 18);
    g.clear();
    g.lineStyle(4, 0x40c4ff, 1);
    g.strokeCircle(9, 9, 7);
    g.fillStyle(0x40c4ff, 1);
    g.fillRect(6, 12, 6, 6);
    g.generateTexture('pickup-magnet', 18, 18);
    g.clear();
    // Gold cache: coin.
    g.fillStyle(0xffd54f, 1);
    g.fillCircle(9, 9, 8);
    g.fillStyle(0xff8f00, 1);
    g.fillCircle(9, 9, 5);
    g.fillStyle(0xffd54f, 1);
    g.fillRect(8, 5, 2, 8);
    g.generateTexture('pickup-gold', 18, 18);
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
