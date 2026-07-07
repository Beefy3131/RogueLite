import Phaser from 'phaser';
import { GAME, PLAYER, UI, ULTIMATE, XP } from '../config/balance';
import { Bar } from '../ui/Bar';

/**
 * Overlay scene running parallel to GameScene (spec §13). Phase 4: XP bar +
 * level (top strip), HP bar, run timer, kill count, and the equipped-weapon
 * readout. Gold arrives in Phase 7.
 */
export class HUDScene extends Phaser.Scene {
  private xpBar!: Bar;
  private levelText!: Phaser.GameObjects.Text;
  private hpBar!: Bar;
  private hpText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private loadoutText!: Phaser.GameObjects.Text;
  private bossBar!: Bar;
  private bossLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('HUD');
  }

  create(): void {
    const { width } = GAME;

    // XP strip across the very top, VS-style.
    this.xpBar = new Bar(this, 0, 0, width, 14, 0x40c4ff);
    this.xpBar.set(0);
    this.levelText = this.add
      .text(width - 8, 7, 'LV 1', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(1, 0.5)
      .setDepth(1);

    this.hpBar = new Bar(this, 16, 22, 220, 20, UI.colors.danger);
    this.hpBar.set(1);
    this.hpText = this.add.text(20, 24, `${PLAYER.maxHP}/${PLAYER.maxHP}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: UI.colors.textCss,
    });

    // Equipped weapons + levels, under the HP bar.
    this.loadoutText = this.add.text(16, 48, 'Magic Bolt 1', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: UI.colors.dimCss,
    });

    this.add.rectangle(width / 2, 34, 96, 30, UI.colors.scrim, UI.colors.scrimAlpha).setOrigin(0.5);
    this.timerText = this.add
      .text(width / 2, 34, '0:00', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: UI.colors.textCss,
      })
      .setOrigin(0.5);

    this.killsText = this.add
      .text(width - 16, 26, 'Kills 0', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: UI.colors.textCss,
      })
      .setOrigin(1, 0);

    this.goldText = this.add
      .text(width - 16, 46, 'Gold 0', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffd54f',
      })
      .setOrigin(1, 0);

    // Boss HP bar: bottom center, hidden until a boss spawns.
    this.bossBar = new Bar(this, width / 2 - 180, GAME.height - 36, 360, 16, 0xd81b60);
    this.bossBar.setVisible(false);
    this.bossLabel = this.add
      .text(width / 2, GAME.height - 46, 'BOSS', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ff8a80',
      })
      .setOrigin(0.5)
      .setVisible(false);

    const game = this.scene.get('Game');

    // --- Ultimate button (bottom-right): charge ring, tap or SPACE to fire ---
    const r = ULTIMATE.buttonSize / 2;
    const ultButton = this.add.container(
      GAME.width - ULTIMATE.buttonMargin - r,
      GAME.height - ULTIMATE.buttonMargin - r,
    );
    const ultBg = this.add.circle(0, 0, r, 0x23234a, 0.85).setStrokeStyle(2, 0x4a4a8a);
    const ultArc = this.add.graphics();
    const ultLabel = this.add
      .text(0, 0, 'ULT', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: UI.colors.dimCss,
      })
      .setOrigin(0.5);
    ultButton.add([ultBg, ultArc, ultLabel]);
    if (!this.sys.game.device.input.touch) {
      // Desktop hint under the button; touch users just tap it.
      this.add
        .text(ultButton.x, ultButton.y + r + 12, 'SPACE', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '10px',
          color: UI.colors.dimCss,
        })
        .setOrigin(0.5);
    }
    let ultPulse: Phaser.Tweens.Tween | null = null;
    const onUlt = (charge: number, ready: boolean, activeFrac: number) => {
      ultArc.clear();
      const frac = activeFrac > 0 ? activeFrac : charge;
      const color = activeFrac > 0 ? 0xffd54f : ready ? UI.colors.accent : 0x40c4ff;
      if (frac > 0) {
        ultArc.lineStyle(5, color, 1);
        ultArc.beginPath();
        ultArc.arc(0, 0, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
        ultArc.strokePath();
      }
      ultBg.setStrokeStyle(2, ready ? UI.colors.accent : 0x4a4a8a);
      ultLabel
        .setText(activeFrac > 0 ? '...' : ready ? 'ULT!' : 'ULT')
        .setColor(ready ? UI.colors.accentCss : activeFrac > 0 ? '#ffd54f' : UI.colors.dimCss);
      if (ready && !ultPulse) {
        ultPulse = this.tweens.add({ targets: ultButton, scale: 1.12, duration: 420, yoyo: true, repeat: -1 });
      } else if (!ready && ultPulse) {
        ultPulse.stop();
        ultPulse = null;
        ultButton.setScale(1);
      }
    };
    ultBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => game.events.emit('ult-pressed'));

    const onHP = (hp: number, max: number) => {
      this.hpBar.set(hp / max);
      this.hpText.setText(`${Math.ceil(hp)}/${max}`);
    };
    const onXP = (xp: number, needed: number, level: number) => {
      this.xpBar.set(xp / needed);
      this.levelText.setText(`LV ${level}`);
    };
    const onTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    };
    const onKills = (kills: number) => this.killsText.setText(`Kills ${kills}`);
    const onGold = (gold: number) => this.goldText.setText(`Gold ${gold}`);
    const onLoadout = (weapons: Array<{ name: string; level: number }>) => {
      this.loadoutText.setText(weapons.map(w => `${w.name} ${w.level}`).join('   '));
    };
    const onBoss = (hp: number, max: number) => {
      this.bossBar.setVisible(true);
      this.bossLabel.setVisible(true);
      this.bossBar.set(hp / max);
    };
    const onBossSpawned = () => onBoss(1, 1);
    const onBossOff = () => {
      this.bossBar.setVisible(false);
      this.bossLabel.setVisible(false);
    };

    game.events.on('hud-hp', onHP);
    game.events.on('hud-xp', onXP);
    game.events.on('hud-time', onTime);
    game.events.on('hud-kills', onKills);
    game.events.on('hud-gold', onGold);
    game.events.on('hud-loadout', onLoadout);
    game.events.on('hud-boss', onBoss);
    game.events.on('boss-spawned', onBossSpawned);
    game.events.on('hud-boss-off', onBossOff);
    game.events.on('hud-ult', onUlt);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      game.events.off('hud-ult', onUlt);
      game.events.off('hud-hp', onHP);
      game.events.off('hud-xp', onXP);
      game.events.off('hud-time', onTime);
      game.events.off('hud-kills', onKills);
      game.events.off('hud-gold', onGold);
      game.events.off('hud-loadout', onLoadout);
      game.events.off('hud-boss', onBoss);
      game.events.off('boss-spawned', onBossSpawned);
      game.events.off('hud-boss-off', onBossOff);
    });

    // Seed from current state (HUD launches after the run starts).
    const g = game as Phaser.Scene & {
      xp: number;
      xpForNext: number;
      level: number;
      ultimate?: { chargeFraction: number; ready: boolean };
    };
    onXP(g.xp ?? 0, g.xpForNext ?? XP.xpForLevel(1), g.level ?? 1);
    onUlt(g.ultimate?.chargeFraction ?? 0, g.ultimate?.ready ?? false, 0);
  }
}
