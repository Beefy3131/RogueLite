import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { audio } from '../systems/AudioManager';
import { saveManager } from '../systems/SaveManager';
import { Button } from '../ui/Button';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create(): void {
    audio.playMusic('menu'); // no-op if the theme is already playing (quit-to-menu keeps it)
    const { width, height } = GAME;
    const cx = width / 2;

    this.add
      .text(cx, height * 0.22, 'ROGUELITE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: UI.colors.accentCss,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, height * 0.34, 'SURVIVORS', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: UI.colors.textCss,
        letterSpacing: 12,
      })
      .setOrigin(0.5);

    new Button(this, cx, height * 0.52, 'PLAY', () => this.scene.start('CharacterSelect'));
    new Button(this, cx, height * 0.65, 'SHOP', () => this.scene.start('Shop'));
    new Button(this, cx, height * 0.78, 'SETTINGS', () => this.scene.start('Settings'));

    // Lifetime stats strip (spec §13), from the persistent save.
    const s = saveManager.data.stats;
    const bm = Math.floor(s.bestTimeSeconds / 60);
    const bs = Math.floor(s.bestTimeSeconds % 60);
    this.add
      .text(
        cx,
        height * 0.92,
        `Kills: ${s.totalKills}    Best time: ${bm}:${bs.toString().padStart(2, '0')}    Runs: ${s.runs}    Gold: ${saveManager.data.gold}`,
        {
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          color: UI.colors.dimCss,
        },
      )
      .setOrigin(0.5);

    this.add
      .text(width - 8, height - 8, 'v0.1.0 — Phase 1', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        color: UI.colors.dimCss,
      })
      .setOrigin(1, 1);
  }
}
