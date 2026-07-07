import Phaser from 'phaser';
import {
  ENEMY_BASE,
  GAME,
  LIMITS,
  SPAWN,
  SPAWN_CURVE,
  WORLD,
  type EnemyKind,
} from '../config/balance';
import type { MapDef } from '../config/maps';
import { Enemy } from '../entities/Enemy';
import type { ObjectPool } from './ObjectPool';

/**
 * Time-based enemy spawning (spec §8), driven by the minute-keyed curve in
 * balance.ts: ramping spawn rate + weighted enemy pools. Elite waves every
 * 90s, bosses at fixed minute marks (5/10/15/20), each boss +80% HP. At the
 * hard cap the oldest off-screen non-elite is recycled in place.
 */
export class SpawnDirector {
  private accumulator = 0;
  private eliteTimer = SPAWN.eliteWaveIntervalSeconds;
  private nextBossIndex = 0;
  bossAlive = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly pool: ObjectPool<Enemy>,
    private readonly player: Phaser.GameObjects.Sprite,
    private readonly map: MapDef,
  ) {}

  update(deltaMs: number, elapsedSeconds: number): void {
    const minute = elapsedSeconds / 60;
    // Map pacing (spec §9): graveyard escalates 1.25× faster into the curve.
    const effMinute = minute * this.map.escalationMult;
    const row = SPAWN_CURVE[Math.min(Math.floor(effMinute), SPAWN_CURVE.length - 1)];

    this.accumulator += deltaMs / 1000;
    while (this.accumulator >= row.intervalSeconds) {
      this.accumulator -= row.intervalSeconds;
      this.spawnKind(this.pickWeighted(row.weights, effMinute), minute);
    }

    // Elite wave every ~90s (spec §8).
    this.eliteTimer -= deltaMs / 1000;
    if (this.eliteTimer <= 0) {
      this.eliteTimer += SPAWN.eliteWaveIntervalSeconds;
      this.spawnKind('elite', minute);
      this.scene.events.emit('elite-spawned');
    }

    // Boss at 5/10/15/20 (spec §8). +80% HP each (spec §10).
    if (this.nextBossIndex < SPAWN.bossMinutes.length && minute >= SPAWN.bossMinutes[this.nextBossIndex]) {
      const hp = ENEMY_BASE.boss.hp * Math.pow(ENEMY_BASE.boss.hpScalePerBoss, this.nextBossIndex);
      const enemy = this.obtain();
      if (enemy) {
        const { x, y } = this.ringPosition();
        enemy.spawn(x, y, 'boss', minute, this.player, hp);
        this.bossAlive = true;
        this.scene.events.emit('boss-spawned', enemy);
      }
      this.nextBossIndex++;
    }
  }

  /** Spawn a specific kind at a specific place (splitter minis, debug). */
  spawnKindAt(kind: EnemyKind, x: number, y: number, minute: number): Enemy | null {
    const enemy = this.obtain();
    if (!enemy) return null;
    return enemy.spawn(x, y, kind, minute, this.player);
  }

  /** Debug/perf-gate helper: burst-spawn many enemies at once. */
  stressSpawn(count: number, minute = 0): void {
    for (let i = 0; i < count; i++) this.spawnKind('swarmer', minute);
  }

  private spawnKind(kind: EnemyKind, minute: number): void {
    const enemy = this.obtain();
    if (!enemy) return;
    const { x, y } = this.ringPosition();
    enemy.spawn(x, y, kind, minute, this.player);
  }

  /**
   * Row weights × map multipliers (spec §9). A kind the map boosts but the
   * row doesn't include yet gets a small base weight from minute 2 — the
   * graveyard has ghosts long before the forest does.
   */
  private pickWeighted(weights: Partial<Record<EnemyKind, number>>, effMinute: number): EnemyKind {
    const mapMult = this.map.enemyWeightMult;
    const kinds = new Set<EnemyKind>([
      ...(Object.keys(weights) as EnemyKind[]),
      ...(effMinute >= 2 ? (Object.keys(mapMult) as EnemyKind[]) : []),
    ]);
    let total = 0;
    const entries: Array<[EnemyKind, number]> = [];
    for (const kind of kinds) {
      const w = (weights[kind] ?? 1) * (mapMult[kind] ?? 1);
      entries.push([kind, w]);
      total += w;
    }
    let roll = Math.random() * total;
    for (const [kind, w] of entries) {
      roll -= w;
      if (roll <= 0) return kind;
    }
    return 'swarmer';
  }

  /** Pool acquire, or at the cap: recycle an off-screen non-elite in place. */
  private obtain(): Enemy | null {
    if (this.pool.activeCount < LIMITS.maxEnemies) return this.pool.acquire();
    const view = this.scene.cameras.main.worldView;
    for (const enemy of this.pool.active) {
      if (enemy.kind === 'boss' || enemy.kind === 'elite') continue;
      if (!view.contains(enemy.x, enemy.y)) return enemy;
    }
    return null;
  }

  /** Random point on a ring just outside the camera view, around the player. */
  private ringPosition(): { x: number; y: number } {
    const view = this.scene.cameras.main.worldView;
    const w = view.width || GAME.width;
    const h = view.height || GAME.height;
    const radius = Math.hypot(w, h) / 2 + SPAWN.spawnRingPadding;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, 16, WORLD.width - 16),
      y: Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, 16, WORLD.height - 16),
    };
  }
}
