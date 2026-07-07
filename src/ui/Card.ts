import Phaser from 'phaser';
import { UI } from '../config/balance';

export interface CardData {
  name: string;
  /** "NEW!" or "Lv 2 → 3" */
  tag: string;
  tagColor: string;
  desc: string;
}

/** Level-up choice card (spec §13): big tap target, hover feedback. */
export class Card extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, data: CardData, onPick: () => void) {
    super(scene, x, y);

    const w = 210;
    const h = 260;
    const bg = scene.add
      .rectangle(0, 0, w, h, 0x23234a, 1)
      .setStrokeStyle(2, 0x4a4a8a);
    const name = scene.add
      .text(0, -h / 2 + 34, data.name, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
        align: 'center',
        wordWrap: { width: w - 20 },
      })
      .setOrigin(0.5);
    const tag = scene.add
      .text(0, -h / 2 + 66, data.tag, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: data.tagColor,
      })
      .setOrigin(0.5);
    const desc = scene.add
      .text(0, 20, data.desc, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#c8c8e8',
        align: 'center',
        wordWrap: { width: w - 28 },
      })
      .setOrigin(0.5);

    this.add([bg, name, tag, desc]);
    scene.add.existing(this);

    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        bg.setFillStyle(0x2e2e5e).setStrokeStyle(2, UI.colors.accent);
        this.setScale(1.04);
      })
      .on('pointerout', () => {
        bg.setFillStyle(0x23234a).setStrokeStyle(2, 0x4a4a8a);
        this.setScale(1);
      })
      .on('pointerup', onPick);
  }
}
