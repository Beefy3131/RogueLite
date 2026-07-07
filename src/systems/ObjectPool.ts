/**
 * Generic pre-warmed object pool (spec §2 item 1): nothing transient is
 * instantiated or destroyed mid-run — acquire from the pool, release back.
 * Tracks the live set so systems can iterate active items without allocation.
 */
export class ObjectPool<T> {
  /** Currently checked-out items. Order is not stable (swap-remove). */
  readonly active: T[] = [];
  private readonly free: T[] = [];

  constructor(
    private readonly factory: () => T,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.factory());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.active.push(item);
    return item;
  }

  release(item: T): void {
    const i = this.active.indexOf(item);
    if (i === -1) return;
    // Swap-remove: O(1), order doesn't matter for game entities.
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    this.free.push(item);
  }

  get activeCount(): number {
    return this.active.length;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
