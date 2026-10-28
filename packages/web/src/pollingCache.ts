/** Recent page snapshots only; every mount still revalidates and retains the original timestamp. */
export type Snapshot<T> = { data: T; updatedAt: Date };
export class PollingCache {
  private entries = new Map<string, { snapshot: Snapshot<unknown>; bytes: number }>();
  private bytes = 0;
  constructor(private maxEntries = 48, private maxBytes = 8 * 1024 * 1024, private maxAge = 30_000) {}
  get<T>(key: string | undefined, now = Date.now()): Snapshot<T> | null {
    if (!key) return null;
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (now - entry.snapshot.updatedAt.getTime() >= this.maxAge) { this.delete(key); return null; }
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.snapshot as Snapshot<T>;
  }
  set<T>(key: string | undefined, snapshot: Snapshot<T>) {
    if (!key) return;
    this.delete(key);
    let size: number;
    try { size = JSON.stringify(snapshot.data).length * 2; } catch { return; }
    if (size > Math.min(this.maxBytes, 1024 * 1024)) return;
    while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + size > this.maxBytes)) this.delete(this.entries.keys().next().value!);
    if (this.maxEntries > 0) { this.entries.set(key, { snapshot, bytes: size }); this.bytes += size; }
  }
  delete(key: string) { const entry = this.entries.get(key); if (entry) this.bytes -= entry.bytes; this.entries.delete(key); }
}
export const pollingCache = new PollingCache();
export const pollingKey = (...parts: (string | number)[]) => JSON.stringify(parts);
