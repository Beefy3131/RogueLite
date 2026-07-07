import Phaser from 'phaser';
import { JOYSTICK } from '../config/balance';

/**
 * Floating virtual joystick (spec §12): appears wherever the thumb touches,
 * drag to steer, releases to zero. Screen-space (scroll factor 0). Only
 * responds to touch pointers — mouse users never see it.
 */
export class VirtualJoystick {
  /** Analog output, length 0..1. */
  readonly vector = new Phaser.Math.Vector2();
  isActive = false;

  private pointerId = -1;
  private readonly base: Phaser.GameObjects.Image;
  private readonly thumb: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.base = scene.add
      .image(0, 0, 'joy-base')
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(JOYSTICK.baseAlpha)
      .setVisible(false);
    this.thumb = scene.add
      .image(0, 0, 'joy-thumb')
      .setScrollFactor(0)
      .setDepth(1001)
      .setAlpha(JOYSTICK.thumbAlpha)
      .setVisible(false);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.isActive || !pointer.wasTouch) return;
    this.isActive = true;
    this.pointerId = pointer.id;
    this.base.setPosition(pointer.x, pointer.y).setVisible(true);
    this.thumb.setPosition(pointer.x, pointer.y).setVisible(true);
    this.vector.set(0, 0);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isActive || pointer.id !== this.pointerId) return;
    const dx = pointer.x - this.base.x;
    const dy = pointer.y - this.base.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, JOYSTICK.radius);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    this.thumb.setPosition(this.base.x + nx * clamped, this.base.y + ny * clamped);
    this.vector.set((nx * clamped) / JOYSTICK.radius, (ny * clamped) / JOYSTICK.radius);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isActive || pointer.id !== this.pointerId) return;
    this.reset();
  }

  /**
   * Force-release the stick. When the scene pauses mid-touch (level-up, pause
   * menu) the pointerup never reaches us, so the old vector would keep driving
   * the player on resume — callers reset us before pausing.
   */
  reset(): void {
    this.isActive = false;
    this.pointerId = -1;
    this.base.setVisible(false);
    this.thumb.setVisible(false);
    this.vector.set(0, 0);
  }
}
