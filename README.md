# RogueLite Survivors

2D top-down survivor roguelite (Vampire Survivors–style). Phaser 3 + TypeScript + Vite, PWA-installable, Capacitor-ready. Built per `roguelite-build-spec.md` in 8 phases.

**Status: all 8 phases complete.** Full game loop: 6 characters, 8 weapons, 10 passives, 10 enemies + bosses, 2 maps, meta-progression shop with IndexedDB saves, synthesized audio, PWA offline play.

**Controls:** WASD/arrows move, Esc/P pause. Mobile: floating touch joystick. Everything auto-attacks.

**Debug:** backtick = perf overlay, T = spawn 300 enemies, `?stress` = both at run start, `?unlock` = unlock everything. Console handles: `__game`, `__save`, `__audio`.

## Commands

```bash
npm install        # once
npm run dev        # dev server → http://localhost:5173 (no service worker in dev)
npm run build      # type-check + production build → dist/
npm run preview    # serve dist/ → http://localhost:4173 (PWA install + offline testable here)
npm run check      # type-check only
npm run icons      # regenerate public/ PWA icons
```

## Testing the PWA install

The service worker only runs on a production build: `npm run build && npm run preview`, open http://localhost:4173 in Chrome/Edge — an install icon appears in the address bar. After the first load it works offline (DevTools → Network → Offline to verify).

## Layout

- `src/config/balance.ts` — **all** tuning numbers (single source of truth)
- `src/config/` — character/weapon/passive/enemy/map definitions
- `src/scenes/` — Boot → Preload → MainMenu → Game, plus overlays (HUD, LevelUp, Pause, GameOver, Shop)
- `src/entities/` — Player, Enemy, Projectile, XPGem, Pickup
- `src/systems/` — SpawnDirector, WeaponSystem, CollisionGrid, ObjectPool, SaveManager, InputManager, AudioManager
- `src/ui/` — Button, Bar, Card, VirtualJoystick
- `capacitor.config.ts` — present but unused until store wrapping (spec §16)
