import Phaser from 'phaser';
import { CAMERA, GAME, JOYSTICK, ULTIMATE } from '../config/balance';

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
  private downX = 0;
  private downY = 0;
  private readonly base: Phaser.GameObjects.Image;
  private readonly thumb: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    // Camera zoom scales scrollFactor-0 objects around the screen center, so
    // counter-scale the art and place it through toRenderX/Y to stay under
    // the finger.
    const invZoom = 1 / CAMERA.zoom;
    this.base = scene.add
      .image(0, 0, 'joy-base')
      .setScrollFactor(0)
      .setDepth(1000)
      .setScale(invZoom)
      .setAlpha(JOYSTICK.baseAlpha)
      .setVisible(false);
    this.thumb = scene.add
      .image(0, 0, 'joy-thumb')
      .setScrollFactor(0)
      .setDepth(1001)
      .setScale(invZoom)
      .setAlpha(JOYSTICK.thumbAlpha)
      .setVisible(false);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  /** Screen point → the position that renders there under the camera zoom. */
  private toRenderX(x: number): number {
    return GAME.width / 2 + (x - GAME.width / 2) / CAMERA.zoom;
  }

  private toRenderY(y: number): number {
    return GAME.height / 2 + (y - GAME.height / 2) / CAMERA.zoom;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.isActive || !pointer.wasTouch) return;
    // Bottom-right corner belongs to the ultimate button (HUD scene).
    if (
      pointer.x > GAME.width - ULTIMATE.joystickExcludePx &&
      pointer.y > GAME.height - ULTIMATE.joystickExcludePx
    ) {
      return;
    }
    // Top strip is HUD (bars, timer, pause button) — don't start a stick there.
    if (pointer.y < JOYSTICK.excludeTopPx) return;
    this.isActive = true;
    this.pointerId = pointer.id;
    this.downX = pointer.x;
    this.downY = pointer.y;
    this.base.setPosition(this.toRenderX(pointer.x), this.toRenderY(pointer.y)).setVisible(true);
    this.thumb.setPosition(this.base.x, this.base.y).setVisible(true);
    this.vector.set(0, 0);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isActive || pointer.id !== this.pointerId) return;
    // All math in raw screen space; only the sprites go through the transform.
    const dx = pointer.x - this.downX;
    const dy = pointer.y - this.downY;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, JOYSTICK.radius);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    this.thumb.setPosition(
      this.toRenderX(this.downX + nx * clamped),
      this.toRenderY(this.downY + ny * clamped),
    );
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
