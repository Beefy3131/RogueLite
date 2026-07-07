import { COLLISION } from '../config/balance';

interface HasXY {
  x: number;
  y: number;
}

/**
 * Spatial hash grid (spec §2 item 2) — the O(n²)-killer. Entities are bucketed
 * by position into cells each frame; queries only touch the cells overlapping
 * the query area instead of every entity in the world.
 *
 * Zero-allocation in steady state: cell arrays are reused across frames and
 * queries write into a caller-provided buffer.
 *
 * Entities are inserted as points (all our entities are smaller than a cell),
 * so callers must expand their query radius by the max entity radius and do
 * the precise distance check themselves on the returned candidates.
 */
export class CollisionGrid<T extends HasXY> {
  private readonly cellSize: number;
  private readonly cells = new Map<number, T[]>();
  private readonly usedCells: T[][] = [];

  constructor(cellSize: number = COLLISION.cellSize) {
    this.cellSize = cellSize;
  }

  /** Reset for the frame. Keeps cell arrays allocated for reuse. */
  clear(): void {
    for (const cell of this.usedCells) cell.length = 0;
    this.usedCells.length = 0;
  }

  insert(item: T): void {
    const key = this.keyFor(item.x, item.y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    if (cell.length === 0) this.usedCells.push(cell);
    cell.push(item);
  }

  /**
   * Gather candidates whose cell overlaps the circle's bounding box into
   * `out` (cleared first). Coarse: caller does the precise distance check.
   */
  queryArea(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const cs = this.cellSize;
    const minCx = Math.floor((x - radius) / cs);
    const maxCx = Math.floor((x + radius) / cs);
    const minCy = Math.floor((y - radius) / cs);
    const maxCy = Math.floor((y + radius) / cs);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells.get(cy * 65536 + cx);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) out.push(cell[i]);
      }
    }
    return out;
  }

  private keyFor(x: number, y: number): number {
    return Math.floor(y / this.cellSize) * 65536 + Math.floor(x / this.cellSize);
  }
}
