import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { isMapUnlocked, MAPS, mapUnlockText } from '../config/maps';
import { saveManager } from '../systems/SaveManager';
import { Button } from '../ui/Button';

/**
 * Map picker (spec §9): preview + survival modifier; locked map shows its
 * unlock condition.
 */
export class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelect');
  }

  create(): void {
    const { width, height } = GAME;
    this.add
      .text(width / 2, 48, 'CHOOSE YOUR HUNTING GROUND', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    const progress = {
      bestTimeOnMap: (mapId: string) => saveManager.data.stats.bestTimePerMap[mapId] ?? 0,
      unlockAll: new URLSearchParams(location.search).has('unlock'),
    };

    const cardW = 380;
    const cardH = 320;
    MAPS.forEach((def, i) => {
      const x = width / 2 + (i === 0 ? -cardW / 2 - 14 : cardW / 2 + 14);
      const y = height / 2 + 14;
      const unlocked = isMapUnlocked(def, progress);

      const card = this.add.container(x, y);
      const bg = this.add
        .rectangle(0, 0, cardW, cardH, 0x23234a, 1)
        .setStrokeStyle(2, unlocked ? 0x4a4a8a : 0x2a2a44);
      // Preview: the map's palette with a few prop silhouettes.
      const preview = this.add.rectangle(0, -cardH / 2 + 92, cardW - 24, 150, def.previewColor, 1);
      const props: Phaser.GameObjects.Image[] = [];
      for (let p = 0; p < 6; p++) {
        const texture = def.propTextures[p % def.propTextures.length];
        props.push(
          this.add
            .image(-150 + p * 60 + (p % 2) * 14, -cardH / 2 + 70 + (p % 3) * 34, texture)
            .setAlpha(unlocked ? 0.9 : 0.35),
        );
      }
      const name = this.add
        .text(0, 12, def.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          fontStyle: 'bold',
          color: unlocked ? '#ffffff' : '#777788',
        })
        .setOrigin(0.5, 0);
      const tag = this.add
        .text(0, 46, unlocked ? def.tagline : `LOCKED — ${mapUnlockText(def)}`, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '15px',
          color: unlocked ? '#c8c8e8' : '#8888aa',
          align: 'center',
          wordWrap: { width: cardW - 40 },
        })
        .setOrigin(0.5, 0);
      const hazard = this.add
        .text(0, cardH / 2 - 34, def.hazard === 'slowFog' ? 'Hazard: slowing fog' : 'Hazard: none', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          color: def.hazard === 'none' ? '#8888aa' : '#ffab91',
        })
        .setOrigin(0.5, 0);
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
        preview.setFillStyle(def.previewColor, 0.4);
        card.add(this.add.text(cardW / 2 - 14, cardH / 2 - 12, '🔒', { fontSize: '18px' }).setOrigin(1, 1));
      }
    });

    new Button(this, width / 2, height - 34, 'BACK', () => this.scene.start('CharacterSelect'), {
      width: 160,
      height: 44,
      fontSize: 17,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('CharacterSelect'));
  }
}
