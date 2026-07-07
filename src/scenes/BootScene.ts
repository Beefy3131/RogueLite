import Phaser from 'phaser';
import { saveManager } from '../systems/SaveManager';

/**
 * First scene: load the save before anything reads it, then hand off.
 * No assets here — PreloadScene owns loading so it can show a progress bar.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    saveManager.load().then(() => this.scene.start('Preload'));
  }
}
