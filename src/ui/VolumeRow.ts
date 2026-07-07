import Phaser from 'phaser';
import { UI } from '../config/balance';
import { audio } from '../systems/AudioManager';

type VolumeKind = 'masterVolume' | 'sfxVolume' | 'musicVolume';

/** Label + [−] percentage [+] row, bound straight to the persisted settings. */
export class VolumeRow extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, label: string, kind: VolumeKind) {
    super(scene, x, y);

    const labelText = scene.add
      .text(-190, 0, label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: UI.colors.textCss,
      })
      .setOrigin(0, 0.5);
    const value = scene.add
      .text(90, 0, `${Math.round(audio.getVolume(kind) * 100)}%`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: UI.colors.accentCss,
      })
      .setOrigin(0.5);

    const makeStep = (dx: number, sign: string, delta: number) => {
      const bg = scene.add
        .rectangle(dx, 0, UI.minTapTargetPx, UI.minTapTargetPx, 0x2e2e5e, 1)
        .setStrokeStyle(1, 0x4a4a8a);
      const txt = scene.add
        .text(dx, 0, sign, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '22px',
          fontStyle: 'bold',
          color: UI.colors.textCss,
        })
        .setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        audio.setVolume(kind, audio.getVolume(kind) + delta);
        audio.play('click');
        value.setText(`${Math.round(audio.getVolume(kind) * 100)}%`);
      });
      return [bg, txt];
    };

    this.add([labelText, value, ...makeStep(20, '−', -0.1), ...makeStep(160, '+', 0.1)]);
    scene.add.existing(this);
  }
}
