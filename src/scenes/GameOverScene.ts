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

    this.add
      .text(cx, height * 0.18, this.victory ? 'YOU SURVIVED!' : 'YOU DIED', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: this.victory ? UI.colors.accentCss : '#ff5252',
      })
      .setOrigin(0.5);

    const m = Math.floor(this.survivedSeconds / 60);
    const s = Math.floor(this.survivedSeconds % 60);
    this.add
      .text(
        cx,
        height * 0.34,
        `Survived  ${m}:${s.toString().padStart(2, '0')}      Kills  ${this.kills}      Level  ${this.level}`,
        { fontFamily: 'Arial, sans-serif', fontSize: '21px', color: UI.colors.textCss },
      )
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        height * 0.44,
        `Gold earned  +${this.runGold + this.bonusGold}   (run ${this.runGold} + bonus ${this.bonusGold})`,
        { fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffd54f' },
      )
      .setOrigin(0.5);

    this.newUnlocks.forEach((line, i) => {
      this.add
        .text(cx, height * 0.52 + i * 24, line, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: UI.colors.accentCss,
        })
        .setOrigin(0.5);
    });

    new Button(this, cx, height * 0.66, 'CONTINUE  →  SHOP', () => this.scene.start('Shop'), { width: 280 });
    new Button(this, cx - 150, height * 0.82, 'RETRY', () => this.scene.start('Game'), { width: 240 });
    new Button(this, cx + 150, height * 0.82, 'MAIN MENU', () => this.scene.start('MainMenu'), { width: 240 });
  }
}
