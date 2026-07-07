import Phaser from 'phaser';
import { UI } from '../config/balance';
import { audio } from '../systems/AudioManager';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  disabled?: boolean;
}

/**
 * Chunky menu/tap button: min 44px hit target (spec §13), hover + press
 * feedback, disabled state for not-yet-built features.
 */
export class Button extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    options: ButtonOptions = {},
  ) {
    super(scene, x, y);

    const width = options.width ?? 240;
    const height = Math.max(options.height ?? 52, UI.minTapTargetPx);
    const disabled = options.disabled ?? false;

    const bg = scene.add
      .rectangle(0, 0, width, height, disabled ? 0x2a2a4e : UI.colors.accent, 1)
      .setStrokeStyle(2, disabled ? 0x3a3a5e : 0xffffff, disabled ? 1 : 0.25);
    const text = scene.add
      .text(0, 0, label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${options.fontSize ?? 22}px`,
        fontStyle: 'bold',
        color: disabled ? UI.colors.dimCss : '#0a2a1a',
      })
      .setOrigin(0.5);

    this.add([bg, text]);
    scene.add.existing(this);

    if (disabled) {
      this.setAlpha(0.5);
      return;
    }

    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x33ff99))
      .on('pointerout', () => {
        bg.setFillStyle(UI.colors.accent);
        this.setScale(1);
      })
      .on('pointerdown', () => this.setScale(0.96))
      .on('pointerup', () => {
        this.setScale(1);
        audio.play('click');
        onClick();
      });
  }
}
