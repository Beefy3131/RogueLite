import Phaser from 'phaser';
import { GAME, SHOP_UPGRADES, UI } from '../config/balance';
import { CHARACTERS } from '../config/characters';
import { audio } from '../systems/AudioManager';
import { saveManager } from '../systems/SaveManager';
import { Button } from '../ui/Button';

/**
 * Permanent Power-Up Shop (spec §11): all 14 upgrades with rank pips +
 * escalating costs, the gold-unlock characters, and the reset-refund button.
 * Restarts itself after every purchase — cheap full refresh.
 */
export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create(): void {
    const { width, height } = GAME;

    this.add
      .text(24, 20, 'SHOP', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(width - 24, 20, `GOLD  ${saveManager.data.gold}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffd54f',
      })
      .setOrigin(1, 0.5);

    // --- Upgrade grid: 7 × 2 ---
    const cols = 7;
    const tileW = 128;
    const tileH = 138;
    const gap = 6;
    const gridX = width / 2 - ((cols - 1) * (tileW + gap)) / 2;
    SHOP_UPGRADES.forEach((def, i) => {
      const x = gridX + (i % cols) * (tileW + gap);
      const y = 116 + Math.floor(i / cols) * (tileH + gap);
      this.makeUpgradeTile(x, y, tileW, tileH, def.id);
    });

    // --- Character unlocks (spec §11) ---
    this.add
      .text(width / 2, 318, 'UNLOCKS', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: UI.colors.dimCss,
      })
      .setOrigin(0.5);
    const goldChars = CHARACTERS.filter(c => c.unlock.type === 'gold');
    const uw = 250;
    const ux = width / 2 - ((goldChars.length - 1) * (uw + 12)) / 2;
    goldChars.forEach((def, i) => {
      this.makeCharacterTile(ux + i * (uw + 12), 388, uw, 100, def.id);
    });

    // --- Reset + back ---
    new Button(this, width / 2 - 130, height - 36, 'RESET  (REFUND ALL)', () => {
      const refund = saveManager.resetUpgrades();
      if (refund > 0) this.scene.restart();
    }, { width: 240, height: 44, fontSize: 15 });
    new Button(this, width / 2 + 130, height - 36, 'BACK', () => this.scene.start('MainMenu'), {
      width: 240,
      height: 44,
      fontSize: 15,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MainMenu'));
  }

  private makeUpgradeTile(x: number, y: number, w: number, h: number, id: string): void {
    const def = SHOP_UPGRADES.find(u => u.id === id)!;
    const rank = saveManager.upgradeRank(id);
    const cost = saveManager.nextCost(id);
    const maxed = cost === null;
    const affordable = !maxed && saveManager.data.gold >= cost;

    const card = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, maxed ? 0x1f3b2d : 0x23234a, 1)
      .setStrokeStyle(2, maxed ? 0x2e7d32 : affordable ? 0x4a4a8a : 0x33334f);
    const name = this.add
      .text(0, -h / 2 + 16, def.name, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);
    // Rank pips.
    const pipW = 14;
    const pipStart = -((def.ranks - 1) * (pipW + 3)) / 2;
    const pips: Phaser.GameObjects.Rectangle[] = [];
    for (let r = 0; r < def.ranks; r++) {
      pips.push(
        this.add
          .rectangle(pipStart + r * (pipW + 3), -h / 2 + 36, pipW, 8, r < rank ? UI.colors.accent : 0x33334f, 1)
          .setStrokeStyle(1, 0x55557a),
      );
    }
    const text = this.add
      .text(0, -2, def.text, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: '#c8c8e8',
        align: 'center',
        wordWrap: { width: w - 14 },
      })
      .setOrigin(0.5, 0);
    const costText = this.add
      .text(0, h / 2 - 16, maxed ? 'MAX' : `${cost}g`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: maxed ? UI.colors.accentCss : affordable ? '#ffd54f' : '#77667a',
      })
      .setOrigin(0.5);
    card.add([bg, name, ...pips, text, costText]);

    if (!maxed && affordable) {
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setStrokeStyle(2, UI.colors.accent))
        .on('pointerout', () => bg.setStrokeStyle(2, 0x4a4a8a))
        .on('pointerup', () => {
          if (saveManager.tryBuyUpgrade(id)) {
            audio.play('purchase');
            this.scene.restart();
          }
        });
    }
  }

  private makeCharacterTile(x: number, y: number, w: number, h: number, id: string): void {
    const def = CHARACTERS.find(c => c.id === id)!;
    const cost = def.unlock.type === 'gold' ? def.unlock.cost : 0;
    const owned = saveManager.data.purchasedCharacters.includes(id);
    const affordable = !owned && saveManager.data.gold >= cost;

    const card = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, owned ? 0x1f3b2d : 0x23234a, 1)
      .setStrokeStyle(2, owned ? 0x2e7d32 : affordable ? 0x4a4a8a : 0x33334f);
    const sprite = this.add.image(-w / 2 + 30, 0, 'player').setScale(1.4).setTint(owned || affordable ? def.tint : 0x444455);
    const name = this.add
      .text(-w / 2 + 56, -h / 2 + 14, def.name, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0, 0);
    const info = this.add
      .text(-w / 2 + 56, -h / 2 + 38, def.perkText, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '10px',
        color: '#c8c8e8',
        wordWrap: { width: w - 70 },
      })
      .setOrigin(0, 0);
    const costText = this.add
      .text(w / 2 - 10, h / 2 - 12, owned ? 'OWNED' : `${cost}g`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: owned ? UI.colors.accentCss : affordable ? '#ffd54f' : '#77667a',
      })
      .setOrigin(1, 1);
    card.add([bg, sprite, name, info, costText]);

    if (!owned && affordable) {
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setStrokeStyle(2, UI.colors.accent))
        .on('pointerout', () => bg.setStrokeStyle(2, 0x4a4a8a))
        .on('pointerup', () => {
          if (saveManager.tryPurchaseCharacter(id, cost)) {
            audio.play('purchase');
            this.scene.restart();
          }
        });
    }
  }
}
