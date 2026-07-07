import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export interface UpgradeChoice {
  kind: 'weapon-new' | 'weapon-upgrade' | 'passive';
  id: string;
  name: string;
  tag: string;
  desc: string;
}

interface GameSceneApi extends Phaser.Scene {
  rerollsLeft: number;
  banishesLeft: number;
  skipUnlocked: boolean;
  applyUpgrade(c: UpgradeChoice): void;
  applySkip(): void;
  rerollChoices(): UpgradeChoice[];
  banishChoice(id: string): UpgradeChoice[];
}

/**
 * Paused overlay: pick 1 of 3 (spec §3/§13). Reroll / Skip / Banish appear
 * only when unlocked in the shop, with remaining charges (spec §11).
 * Banish mode: press BANISH, then click the card to remove from this run.
 */
export class LevelUpScene extends Phaser.Scene {
  private choices: UpgradeChoice[] = [];
  private picked = false;
  private banishMode = false;

  constructor() {
    super('LevelUp');
  }

  init(data: { choices: UpgradeChoice[] }): void {
    this.choices = data.choices;
    this.picked = false;
    this.banishMode = false;
  }

  create(): void {
    const { width, height } = GAME;
    const game = this.scene.get('Game') as GameSceneApi;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72);
    const title = this.add
      .text(width / 2, height * 0.13, 'LEVEL UP!', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: UI.colors.accentCss,
      })
      .setOrigin(0.5);

    const spacing = 236;
    const startX = width / 2 - ((this.choices.length - 1) * spacing) / 2;
    this.choices.forEach((choice, i) => {
      const tagColor = choice.kind === 'weapon-new' ? UI.colors.accentCss : '#40c4ff';
      new Card(
        this,
        startX + i * spacing,
        height * 0.5,
        { name: choice.name, tag: choice.tag, tagColor, desc: choice.desc },
        () => (this.banishMode ? this.banish(choice) : this.pick(choice, game)),
      );
      this.input.keyboard?.on(`keydown-${'ONE,TWO,THREE'.split(',')[i]}`, () => this.pick(choice, game));
    });

    // Utility row (spec §11 unlocks) — only rendered if owned.
    const buttons: Array<{ label: string; onClick: () => void }> = [];
    if (game.rerollsLeft > 0) {
      buttons.push({ label: `REROLL (${game.rerollsLeft})`, onClick: () => this.reroll(game) });
    }
    if (game.skipUnlocked) {
      buttons.push({ label: 'SKIP', onClick: () => this.skip(game) });
    }
    if (game.banishesLeft > 0) {
      buttons.push({
        label: `BANISH (${game.banishesLeft})`,
        onClick: () => {
          this.banishMode = !this.banishMode;
          title.setText(this.banishMode ? 'BANISH WHICH?' : 'LEVEL UP!');
          title.setColor(this.banishMode ? '#ff5252' : UI.colors.accentCss);
        },
      });
    }
    const bSpacing = 190;
    const bStart = width / 2 - ((buttons.length - 1) * bSpacing) / 2;
    buttons.forEach((b, i) => {
      new Button(this, bStart + i * bSpacing, height * 0.87, b.label, b.onClick, {
        width: 170,
        height: 44,
        fontSize: 16,
      });
    });
  }

  private pick(choice: UpgradeChoice, game: GameSceneApi): void {
    if (this.picked) return;
    this.picked = true;
    this.scene.stop();
    this.scene.resume('Game');
    game.applyUpgrade(choice);
  }

  private skip(game: GameSceneApi): void {
    if (this.picked) return;
    this.picked = true;
    this.scene.stop();
    this.scene.resume('Game');
    game.applySkip();
  }

  private reroll(game: GameSceneApi): void {
    if (this.picked) return;
    this.scene.restart({ choices: game.rerollChoices() });
  }

  private banish(choice: UpgradeChoice, ): void {
    if (this.picked) return;
    const game = this.scene.get('Game') as GameSceneApi;
    this.scene.restart({ choices: game.banishChoice(choice.id) });
  }
}
