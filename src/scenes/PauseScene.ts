import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { audio } from '../systems/AudioManager';
import { Button } from '../ui/Button';
import { VolumeRow } from '../ui/VolumeRow';

/** Pause overlay (spec §13): resume, restart, quit to menu, volume. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    const { width, height } = GAME;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72);
    this.add
      .text(width / 2, height * 0.14, 'PAUSED', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    new VolumeRow(this, width / 2, height * 0.3, 'Master', 'masterVolume');
    new VolumeRow(this, width / 2, height * 0.41, 'Music', 'musicVolume');
    new VolumeRow(this, width / 2, height * 0.52, 'SFX', 'sfxVolume');

    new Button(this, width / 2, height * 0.66, 'RESUME', () => this.resumeGame());
    new Button(this, width / 2, height * 0.78, 'RESTART', () => {
      audio.stopMusic();
      this.scene.stop('HUD');
      const game = this.scene.get('Game');
      this.scene.stop();
      game.scene.restart();
    });
    new Button(this, width / 2, height * 0.9, 'QUIT TO MENU', () => {
      audio.stopMusic();
      this.scene.stop('HUD');
      this.scene.stop('Game');
      this.scene.start('MainMenu');
    });

    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard?.on('keydown-P', () => this.resumeGame());
  }

  private resumeGame(): void {
    this.scene.stop();
    this.scene.resume('Game');
  }
}
