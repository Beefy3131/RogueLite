import Phaser from 'phaser';

/**
 * Tiny pool of reusable one-shot visual flashes (explosions, lightning bolts).
 * Zero allocation in steady state: images are created once and alpha-decayed.
 */
export class FlashPool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private decayPerMs = 0.004;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly texture: string,
    private readonly depth: number,
    decayPerSecond = 4,
  ) {
    this.decayPerMs = decayPerSecond / 1000;
  }

  show(x: number, y: number, scale = 1, alpha = 1): void {
    let img = this.images.find(i => !i.visible);
    if (!img) {
      img = this.scene.add.image(0, 0, this.texture).setDepth(this.depth).setVisible(false);
      this.images.push(img);
    }
    img.setPosition(x, y).setScale(scale).setAlpha(alpha).setVisible(true);
  }

  update(deltaMs: number): void {
    for (const img of this.images) {
      if (!img.visible) continue;
      img.setAlpha(img.alpha - this.decayPerMs * deltaMs);
      if (img.alpha <= 0) img.setVisible(false);
    }
  }
}
