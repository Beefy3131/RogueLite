import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { audio } from '../systems/AudioManager';
import { Button } from '../ui/Button';
import { VolumeRow } from '../ui/VolumeRow';

/** Settings from the main menu: persisted volumes + mute (spec §13/§14). */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  create(): void {
    const { width, height } = GAME;
    this.add
      .text(width / 2, height * 0.16, 'SETTINGS', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    new VolumeRow(this, width / 2, height * 0.34, 'Master', 'masterVolume');
    new VolumeRow(this, width / 2, height * 0.46, 'Music', 'musicVolume');
    new VolumeRow(this, width / 2, height * 0.58, 'SFX', 'sfxVolume');

    const muteBtn = new Button(this, width / 2, height * 0.72, audio.muted ? 'UNMUTE' : 'MUTE', () => {
      const muted = audio.toggleMute();
      (muteBtn.list[1] as Phaser.GameObjects.Text).setText(muted ? 'UNMUTE' : 'MUTE');
    });

    new Button(this, width / 2, height * 0.86, 'BACK', () => this.scene.start('MainMenu'));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MainMenu'));
  }
}
