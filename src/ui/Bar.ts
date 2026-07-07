import Phaser from 'phaser';

/** Simple fill bar (HP, XP). set() takes a 0..1 ratio. */
export class Bar extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly innerWidth: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor: number,
    bgColor = 0x000000,
  ) {
    super(scene, x, y);
    this.innerWidth = width - 4;
    const bg = scene.add.rectangle(0, 0, width, height, bgColor, 0.7).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.3);
    this.fill = scene.add.rectangle(2, 2, this.innerWidth, height - 4, fillColor).setOrigin(0);
    this.add([bg, this.fill]);
    scene.add.existing(this);
  }

  set(ratio: number): void {
    this.fill.width = this.innerWidth * Phaser.Math.Clamp(ratio, 0, 1);
  }
}
