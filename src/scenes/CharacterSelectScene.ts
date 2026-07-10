import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { CHARACTERS, isCharacterUnlocked, unlockText, type UnlockProgress } from '../config/characters';
import { WEAPONS } from '../config/weapons';
import { saveManager } from '../systems/SaveManager';
import { Button } from '../ui/Button';

/**
 * Character picker (spec §4): sprite, name, starting weapon, perk text, stat
 * arrows. Locked characters are greyed with their unlock condition.
 */
export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelect');
  }

  create(): void {
    const { width, height } = GAME;
    this.add
      .text(width / 2, 44, 'CHOOSE YOUR SURVIVOR', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    const progress: UnlockProgress = {
      totalKills: saveManager.data.stats.totalKills,
      bestTimeSeconds: saveManager.data.stats.bestTimeSeconds,
      unlockedIds: new Set(saveManager.data.purchasedCharacters),
      unlockAll: new URLSearchParams(location.search).has('unlock'),
    };

    const cardW = 280;
    const cardH = 176;
    const startX = width / 2 - cardW - 12;
    const startY = 176;
    CHARACTERS.forEach((def, i) => {
      const x = startX + (i % 3) * (cardW + 12);
      const y = startY + Math.floor(i / 3) * (cardH + 14);
      const unlocked = isCharacterUnlocked(def, progress);

      const card = this.add.container(x, y);
      const bg = this.add
        .rectangle(0, 0, cardW, cardH, unlocked ? 0x23234a : 0x1a1a30, 1)
        .setStrokeStyle(2, unlocked ? 0x4a4a8a : 0x2a2a44);
      // Real portrait art when it exists (and the character is unlocked),
      // otherwise the character's animated dungeon sprite.
      const portraitKey = `portrait-${def.id}`;
      const showPortrait = unlocked && !!def.hasPortrait && this.textures.exists(portraitKey);
      let sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
      if (showPortrait) {
        sprite = this.add.image(-cardW / 2 + 48, 12, portraitKey);
        // Contain-fit into the card's left column, preserving aspect.
        const fit = Math.min(92 / sprite.width, 150 / sprite.height);
        sprite.setScale(fit);
      } else {
        const s = this.add
          .sprite(-cardW / 2 + 34, -cardH / 2 + 42, 'dungeon', `${def.sprite}_idle_anim_f0`)
          .setScale(2.1);
        if (unlocked) s.play(`${def.sprite}-idle`);
        else s.setTint(0x555566).setAlpha(0.8);
        sprite = s;
      }
      const name = this.add
        .text(-cardW / 2 + 62, -cardH / 2 + 20, def.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '22px',
          fontStyle: 'bold',
          color: unlocked ? '#ffffff' : '#777788',
        })
        .setOrigin(0, 0);
      const weapon = this.add
        .text(-cardW / 2 + 62, -cardH / 2 + 46, WEAPONS[def.startWeapon].name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          color: unlocked ? '#40c4ff' : '#555566',
        })
        .setOrigin(0, 0);
      const stat = this.add
        .text(cardW / 2 - 12, -cardH / 2 + 20, def.statLine, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          color: unlocked ? UI.colors.accentCss : '#555566',
        })
        .setOrigin(1, 0);
      // With a portrait on the left, the perk text is left-aligned into the
      // right column so it clears the art; otherwise it stays centered.
      const perkText = unlocked ? def.perkText : `LOCKED\n${unlockText(def)}`;
      const perk = showPortrait
        ? this.add
            .text(-cardW / 2 + 100, 42, perkText, {
              fontFamily: 'Arial, sans-serif',
              fontSize: '14px',
              color: '#c8c8e8',
              align: 'left',
              wordWrap: { width: cardW - 112 },
            })
            .setOrigin(0, 0)
        : this.add
            .text(0, 18, perkText, {
              fontFamily: 'Arial, sans-serif',
              fontSize: '14px',
              color: unlocked ? '#c8c8e8' : '#8888aa',
              align: 'center',
              wordWrap: { width: cardW - 28 },
            })
            .setOrigin(0.5, 0);
      card.add([bg, sprite, name, weapon, stat, perk]);

      if (unlocked) {
        bg.setInteractive({ useHandCursor: true })
          .on('pointerover', () => bg.setStrokeStyle(2, UI.colors.accent))
          .on('pointerout', () => bg.setStrokeStyle(2, 0x4a4a8a))
          .on('pointerup', () => {
            this.registry.set('selected-character', def.id);
            this.scene.start('MapSelect');
          });
      } else {
        const lock = this.add
          .text(cardW / 2 - 12, cardH / 2 - 10, '🔒', { fontSize: '18px' })
          .setOrigin(1, 1);
        card.add(lock);
      }
    });

    new Button(this, width / 2, height - 40, 'BACK', () => this.scene.start('MainMenu'), {
      width: 160,
      height: 44,
      fontSize: 17,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MainMenu'));
  }
}
