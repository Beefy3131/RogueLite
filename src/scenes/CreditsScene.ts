import Phaser from 'phaser';
import { GAME, UI } from '../config/balance';
import { Button } from '../ui/Button';

/**
 * Attribution screen. The CC-BY music tracks REQUIRE in-product credit —
 * this screen (plus public/assets/CREDITS.txt) satisfies that. Reached from
 * the main menu.
 */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }

  create(): void {
    const { width, height } = GAME;
    const cx = width / 2;

    this.add
      .text(cx, 40, 'CREDITS', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    const sections: Array<[string, string[]]> = [
      [
        'ART',
        [
          '"16x16 DungeonTileset II" by 0x72 (CC0)',
          'Dungeon Crawl Stone Soup tiles — DCSS art team (CC0)',
          '"Particle Pack" by Kenney — kenney.nl (CC0)',
        ],
      ],
      [
        'MUSIC',
        [
          '"The Dark Amulet" & "Woodland Fantasy" by Matthew Pablo — matthewpablo.com (CC-BY 3.0)',
          '"Dark Ambience Loop" by Iwan Gabovitch (qubodup) (CC-BY 3.0)',
          '"Battle Theme A" (CC0) & "Crystal Cave / Mysterious Ambience" (CC-BY 3.0)',
          'by cynicmusic — cynicmusic.com / pixelsphere.org',
          'All music sourced via OpenGameArt.org',
        ],
      ],
      [
        'SOUND EFFECTS',
        ['"RPG Audio" & "Impact Sounds" by Kenney — kenney.nl (CC0)'],
      ],
      ['ENGINE', ['Phaser 3 — phaser.io']],
    ];

    let y = 86;
    for (const [heading, lines] of sections) {
      this.add
        .text(cx, y, heading, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          fontStyle: 'bold',
          color: UI.colors.accentCss,
        })
        .setOrigin(0.5);
      y += 24;
      for (const line of lines) {
        this.add
          .text(cx, y, line, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            color: '#c8c8e8',
          })
          .setOrigin(0.5);
        y += 20;
      }
      y += 14;
    }

    new Button(this, cx, height - 40, 'BACK', () => this.scene.start('MainMenu'), {
      width: 160,
      height: 44,
      fontSize: 17,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MainMenu'));
  }
}
