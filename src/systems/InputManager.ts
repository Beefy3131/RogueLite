import Phaser from 'phaser';
import { VirtualJoystick } from '../ui/VirtualJoystick';

/**
 * Desktop + mobile input abstraction (spec §12). Game logic only ever reads
 * `moveVector` — a normalized vector (length ≤ 1) — and never knows whether it
 * came from WASD, arrows, or the touch joystick. Detection is per-input: the
 * joystick only reacts to touch pointers, keyboard is always live.
 */
export class InputManager {
  private keys: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key> | null =
    null;
  private joystick: VirtualJoystick | null = null;
  private readonly out = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as NonNullable<typeof this.keys>;
    }
    // Extra pointers so the joystick works alongside other touches (pause tap etc.).
    scene.input.addPointer(2);
    this.joystick = new VirtualJoystick(scene);
  }

  /** Normalized move vector, length 0..1. Joystick (analog) wins while touched. */
  get moveVector(): Phaser.Math.Vector2 {
    if (this.joystick?.isActive) {
      return this.out.copy(this.joystick.vector);
    }
    let x = 0;
    let y = 0;
    if (this.keys) {
      x = (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
      y = (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) - (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);
    }
    this.out.set(x, y);
    if (this.out.lengthSq() > 1) this.out.normalize();
    return this.out;
  }
}
