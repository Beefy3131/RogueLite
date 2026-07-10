import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { isMapUnlocked, MAPS, mapUnlockText } from '../config/maps';
import { saveManager } from '../systems/SaveManager';
import { Button } from '../ui/Button';

/**
 * Map picker (spec §9): 2×2 grid, each card previews the real ground tiles
 * with a strip of the map's props; locked maps show their unlock condition.
 */
export class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelect');
  }

  create(): void {
    const { width, height } = GAME;
    this.add
      .text(width / 2, 36, 'CHOOSE YOUR HUNTING GROUND', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    const progress = {
      bestTimeOnMap: (mapId: string) => saveManager.data.stats.bestTimePerMap[mapId] ?? 0,
      unlockAll: new URLSearchParams(location.search).has('unlock'),
    };

    const cardW = 430;
    const cardH = 186;
    const gapX = 18;
    const gapY = 16;
    MAPS.forEach((def, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = width / 2 + (col === 0 ? -(cardW / 2 + gapX / 2) : cardW / 2 + gapX / 2);
      const y = 168 + row * (cardH + gapY);
      const unlocked = isMapUnlocked(def, progress);

      const card = this.add.container(x, y);
      const bg = this.add
        .rectangle(0, 0, cardW, cardH, 0x23234a, 1)
        .setStrokeStyle(2, unlocked ? 0x4a4a8a : 0x2a2a44);

      // Preview: the map's actual ground tiles + a few of its props.
      const preview = this.add
        .tileSprite(0, -cardH / 2 + 40, cardW - 20, 64, def.groundTexture)
        .setAlpha(unlocked ? 1 : 0.35);
      const props: Phaser.GameObjects.Image[] = [];
      for (let p = 0; p < 5; p++) {
        const texture = def.propTextures[p % def.propTextures.length];
        props.push(
          this.add
            .image(-160 + p * 80, -cardH / 2 + 44, texture)
            .setAlpha(unlocked ? 1 : 0.3),
        );
      }

      const name = this.add
        .text(-cardW / 2 + 14, -cardH / 2 + 78, def.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '21px',
          fontStyle: 'bold',
          color: unlocked ? '#ffffff' : '#777788',
        })
        .setOrigin(0, 0);
      const tag = this.add
        .text(-cardW / 2 + 14, -cardH / 2 + 106, unlocked ? def.tagline : `LOCKED — ${mapUnlockText(def)}`, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          color: unlocked ? '#c8c8e8' : '#8888aa',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0, 0);
      const hazard = this.add
        .text(-cardW / 2 + 14, cardH / 2 - 26, def.hazardText, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          color: def.hazard === 'none' ? '#8888aa' : '#ffab91',
        })
        .setOrigin(0, 0);
      card.add([bg, preview, ...props, name, tag, hazard]);

      if (unlocked) {
        bg.setInteractive({ useHandCursor: true })
          .on('pointerover', () => bg.setStrokeStyle(2, UI.colors.accent))
          .on('pointerout', () => bg.setStrokeStyle(2, 0x4a4a8a))
          .on('pointerup', () => {
            this.registry.set('selected-map', def.id);
            this.scene.start('Game');
          });
      } else {
        card.add(this.add.text(cardW / 2 - 12, cardH / 2 - 10, '🔒', { fontSize: '18px' }).setOrigin(1, 1));
      }
    });

    new Button(this, width / 2, height - 28, 'BACK', () => this.scene.start('CharacterSelect'), {
      width: 160,
      height: 42,
      fontSize: 17,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('CharacterSelect'));
  }
}
