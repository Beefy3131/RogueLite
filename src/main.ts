import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { GAME, UI } from './config/balance';
import { saveManager } from './systems/SaveManager';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { MapSelectScene } from './scenes/MapSelectScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { PauseScene } from './scenes/PauseScene';
import { GameOverScene } from './scenes/GameOverScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ShopScene } from './scenes/ShopScene';
import { audio } from './systems/AudioManager';

// PWA: auto-update service worker, take control immediately.
registerSW({ immediate: true });

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: UI.colors.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.width,
    height: GAME.height,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  render: {
    roundPixels: true,
  },
  // Scene order matters only for which starts first (BootScene).
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    CharacterSelectScene,
    MapSelectScene,
    GameScene,
    HUDScene,
    LevelUpScene,
    PauseScene,
    GameOverScene,
    ShopScene,
    SettingsScene,
  ],
});

// Audio can only start after a user gesture — arm the unlock listeners now.
audio.attachUnlock();

// Mobile browsers resize the visible viewport when the URL bar hides/shows
// without always firing window.resize — re-fit the canvas whenever the
// container's box actually changes, whatever triggered it.
window.visualViewport?.addEventListener('resize', () => game.scale.refresh());
const container = document.getElementById('game');
if (container) new ResizeObserver(() => game.scale.refresh()).observe(container);

// Debug handles for inspecting scene/pool/save/audio state from the console.
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __save: unknown }).__save = saveManager;
(window as unknown as { __audio: unknown }).__audio = audio;
