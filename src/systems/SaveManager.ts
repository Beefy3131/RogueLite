import { SHOP_UPGRADES } from '../config/balance';

/**
 * IndexedDB persistence (spec §11): gold, upgrade ranks, purchased unlocks,
 * lifetime stats, settings. Loaded once in BootScene before anything reads
 * it; every mutator autosaves (debounced). If IndexedDB is unavailable the
 * game still runs on in-memory defaults — it just won't persist.
 */

export interface SaveData {
  gold: number;
  /** upgradeId → purchased rank. */
  upgrades: Record<string, number>;
  /** Gold-unlocked character ids (Brute/Warden/Bomber). */
  purchasedCharacters: string[];
  stats: {
    totalKills: number;
    bestTimeSeconds: number;
    runs: number;
    bestTimePerMap: Record<string, number>;
  };
  settings: {
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
  };
}

const DB_NAME = 'roguelite';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'main';

function defaultSave(): SaveData {
  return {
    gold: 0,
    upgrades: {},
    purchasedCharacters: [],
    stats: { totalKills: 0, bestTimeSeconds: 0, runs: 0, bestTimePerMap: {} },
    settings: { masterVolume: 1, sfxVolume: 1, musicVolume: 1 },
  };
}

export class SaveManager {
  data: SaveData = defaultSave();
  /** False when IndexedDB is unavailable (private browsing edge cases). */
  persistent = false;

  private db: IDBDatabase | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    try {
      this.db = await this.openDb();
      const stored = await this.get();
      if (stored) {
        const d = defaultSave();
        this.data = {
          ...d,
          ...stored,
          stats: { ...d.stats, ...stored.stats },
          settings: { ...d.settings, ...stored.settings },
          upgrades: { ...stored.upgrades },
          purchasedCharacters: [...(stored.purchasedCharacters ?? [])],
        };
      }
      this.persistent = true;
    } catch {
      this.persistent = false; // play on, in-memory only
    }
  }

  /** Debounced write — autosave on every meaningful change (spec §11). */
  save(): void {
    if (!this.db) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.put().catch(() => undefined);
    }, 150);
  }

  /** For tests/shutdown: write immediately. */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    return this.put().catch(() => undefined);
  }

  // --- Mutators (all autosave) ---

  addGold(amount: number): void {
    this.data.gold += Math.round(amount);
    this.save();
  }

  trySpend(amount: number): boolean {
    if (this.data.gold < amount) return false;
    this.data.gold -= amount;
    this.save();
    return true;
  }

  upgradeRank(id: string): number {
    return this.data.upgrades[id] ?? 0;
  }

  /** Cost of the next rank: baseCost × (currentRank + 1). */
  nextCost(id: string): number | null {
    const def = SHOP_UPGRADES.find(u => u.id === id);
    if (!def) return null;
    const rank = this.upgradeRank(id);
    if (rank >= def.ranks) return null;
    return def.baseCost * (rank + 1);
  }

  tryBuyUpgrade(id: string): boolean {
    const cost = this.nextCost(id);
    if (cost === null || !this.trySpend(cost)) return false;
    this.data.upgrades[id] = this.upgradeRank(id) + 1;
    this.save();
    return true;
  }

  /** Reset all upgrades → refund every coin spent (spec §11 QoL). */
  resetUpgrades(): number {
    let refund = 0;
    for (const def of SHOP_UPGRADES) {
      const rank = this.upgradeRank(def.id);
      for (let r = 1; r <= rank; r++) refund += def.baseCost * r;
    }
    this.data.upgrades = {};
    this.data.gold += refund;
    this.save();
    return refund;
  }

  tryPurchaseCharacter(id: string, cost: number): boolean {
    if (this.data.purchasedCharacters.includes(id)) return false;
    if (!this.trySpend(cost)) return false;
    this.data.purchasedCharacters.push(id);
    this.save();
    return true;
  }

  recordRun(kills: number, survivedSeconds: number, mapId: string): void {
    const s = this.data.stats;
    s.totalKills += kills;
    s.runs += 1;
    if (survivedSeconds > s.bestTimeSeconds) s.bestTimeSeconds = survivedSeconds;
    if (survivedSeconds > (s.bestTimePerMap[mapId] ?? 0)) s.bestTimePerMap[mapId] = survivedSeconds;
    this.save();
  }

  // --- IndexedDB plumbing ---

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private get(): Promise<SaveData | undefined> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as SaveData | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private put(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      const tx = this.db.transaction(STORE, 'readwrite');
      // Structured clone of plain data — strip any accidental references.
      tx.objectStore(STORE).put(JSON.parse(JSON.stringify(this.data)), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/** Singleton: loaded by BootScene, read/written everywhere else. */
export const saveManager = new SaveManager();
