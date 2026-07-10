import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { CHARACTERS, isCharacterUnlocked, type UnlockProgress } from '../config/characters';
import { isMapUnlocked, MAPS } from '../config/maps';
import { saveManager } from '../systems/SaveManager';
import { Button } from '../ui/Button';

/**
 * Run summary (spec §13): time, kills, level, gold earned → Continue to Shop.
 * Banks gold + lifetime stats into the save and announces new unlocks.
 */
export class GameOverScene extends Phaser.Scene {
  private survivedSeconds = 0;
  private kills = 0;
  private level = 1;
  private victory = false;
  private mapId = 'forest';
  private runGold = 0;
  private bonusGold = 0;
  private newUnlocks: string[] = [];

  constructor() {
    super('GameOver');
  }

  init(data: {
    survivedSeconds?: number;
    kills?: number;
    level?: number;
    victory?: boolean;
    mapId?: string;
    runGold?: number;
    bonusGold?: number;
  }): void {
    this.survivedSeconds = data.survivedSeconds ?? 0;
    this.kills = data.kills ?? 0;
    this.level = data.level ?? 1;
    this.victory = data.victory ?? false;
    this.mapId = data.mapId ?? 'forest';
    this.runGold = data.runGold ?? 0;
    this.bonusGold = data.bonusGold ?? 0;
    this.bankRun();
  }

  /** Persist gold + lifetime stats (spec §11) and diff unlocks for the toast. */
  private bankRun(): void {
    const unlockedNames = () => {
      const p = this.unlockProgress();
      const names = new Map<string, string>();
      for (const c of CHARACTERS) if (isCharacterUnlocked(c, p)) names.set(c.id, c.name);
      for (const m of MAPS) if (isMapUnlocked(m, p)) names.set(m.id, m.name);
      return names;
    };
    const before = unlockedNames();

    saveManager.addGold(this.runGold + this.bonusGold);
    saveManager.recordRun(this.kills, this.survivedSeconds, this.mapId);

    this.newUnlocks = [];
    for (const [id, name] of unlockedNames()) {
      if (!before.has(id)) this.newUnlocks.push(`${name} UNLOCKED!`);
    }
  }

  private unlockProgress(): UnlockProgress & { bestTimeOnMap: (mapId: string) => number } {
    const s = saveManager.data.stats;
    return {
      totalKills: s.totalKills,
      bestTimeSeconds: s.bestTimeSeconds,
      unlockedIds: new Set(saveManager.data.purchasedCharacters),
      unlockAll: false,
      bestTimeOnMap: (mapId: string) => s.bestTimePerMap[mapId] ?? 0,
    };
  }

  create(): void {
    const { width, height } = GAME;
    const cx = width / 2;
    this.cameras.main.fadeIn(450, 8, 4, 14); // pick up where the death fade left off

    // Drifting background motes: souls on defeat, gold sparks on victory.
    const moteColors = this.victory ? [0xffd54f, 0x00e676, 0xfff9c4] : [0x90caf9, 0xb39ddb, 0x546e9a];
    for (let i = 0; i < 14; i++) {
      const mote = this.add
        .image(Math.random() * width, height + 20 + Math.random() * 160, 'p-light_01')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(moteColors[i % moteColors.length])
        .setScale(0.05 + Math.random() * 0.1)
        .setAlpha(0.12 + Math.random() * 0.2)
        .setDepth(0);
      this.tweens.add({
        targets: mote,
        y: -30,
        x: mote.x + (Math.random() * 2 - 1) * 90,
        duration: 6000 + Math.random() * 7000,
        delay: Math.random() * 4000,
        repeat: -1,
        onRepeat: () => {
          mote.y = height + 20;
          mote.x = Math.random() * width;
        },
      });
    }

    // Title slams in: oversized and transparent → full size, with an afterglow.
    const titleText = this.victory ? 'YOU SURVIVED!' : 'YOU DIED';
    const titleColor = this.victory ? UI.colors.accentCss : '#ff5252';
    const glow = this.add
      .text(cx, height * 0.18, titleText, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: titleColor,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(1);
    const title = this.add
      .text(cx, height * 0.18, titleText, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: titleColor,
      })
      .setOrigin(0.5)
      .setScale(2.6)
      .setAlpha(0)
      .setDepth(2);
    this.tweens.add({
      targets: title,
      scale: 1,
      alpha: 1,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!this.victory) this.cameras.main.shake(140, 0.008);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.35, to: 0 },
          scale: { from: 1.05, to: 1.6 },
          duration: 900,
          ease: 'Cubic.easeOut',
        });
      },
    });

    // Stats count up from zero, appearing one after the other.
    const m = Math.floor(this.survivedSeconds / 60);
    const s = Math.floor(this.survivedSeconds % 60);
    const statText = this.add
      .text(cx, height * 0.34, '', { fontFamily: 'Arial, sans-serif', fontSize: '21px', color: UI.colors.textCss })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: statText, alpha: 1, delay: 450, duration: 250 });
    this.tweens.addCounter({
      from: 0,
      to: 1,
      delay: 450,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: tween => {
        const t = tween.getValue() ?? 1;
        const cm = Math.floor((this.survivedSeconds * t) / 60);
        const cs = Math.floor((this.survivedSeconds * t) % 60);
        statText.setText(
          `Survived  ${cm}:${cs.toString().padStart(2, '0')}      Kills  ${Math.round(this.kills * t)}      Level  ${Math.max(1, Math.round(this.level * t))}`,
        );
      },
      onComplete: () => {
        statText.setText(
          `Survived  ${m}:${s.toString().padStart(2, '0')}      Kills  ${this.kills}      Level  ${this.level}`,
        );
      },
    });

    const gold = this.add
      .text(
        cx,
        height * 0.44,
        `Gold earned  +${this.runGold + this.bonusGold}   (run ${this.runGold} + bonus ${this.bonusGold})`,
        { fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffd54f' },
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: gold, alpha: 1, y: { from: height * 0.44 + 14, to: height * 0.44 }, delay: 900, duration: 300 });

    this.newUnlocks.forEach((line, i) => {
      const unlock = this.add
        .text(cx, height * 0.52 + i * 24, line, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: UI.colors.accentCss,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(0.6);
      this.tweens.add({
        targets: unlock,
        alpha: 1,
        scale: 1,
        delay: 1150 + i * 180,
        duration: 320,
        ease: 'Back.easeOut',
      });
    });

    // Buttons rise in last, staggered.
    const buttons = [
      new Button(this, cx, height * 0.66, 'CONTINUE  →  SHOP', () => this.scene.start('Shop'), { width: 280 }),
      new Button(this, cx - 150, height * 0.82, 'RETRY', () => this.scene.start('Game'), { width: 240 }),
      new Button(this, cx + 150, height * 0.82, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 240 }),
    ];
    buttons.forEach((btn, i) => {
      btn.setAlpha(0);
      btn.y += 26;
      this.tweens.add({
        targets: btn,
        alpha: 1,
        y: btn.y - 26,
        delay: 1000 + i * 140,
        duration: 340,
        ease: 'Cubic.easeOut',
      });
    });
  }
}
