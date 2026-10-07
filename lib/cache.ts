export class LruCache {
  private entries = new Map<
    string,
    { value: unknown; expires: number; bytes: number }
  >();
  private bytes = 0;
  constructor(
    private maxEntries = 200,
    private maxBytes = 10 * 1024 * 1024,
    private clock = Date.now,
  ) {}
  get<T>(key: string): T | undefined {
    const item = this.entries.get(key);
    if (!item) return;
    if (item.expires <= this.clock()) {
      this.delete(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.value as T;
  }
  set(key: string, value: unknown, ttlMs: number) {
    this.delete(key);
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, expires: this.clock() + ttlMs, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)
      this.delete(this.entries.keys().next().value!);
  }
  delete(key: string) {
    const item = this.entries.get(key);
    if (item) this.bytes -= item.bytes;
    this.entries.delete(key);
  }
}
const globalCache = globalThis as typeof globalThis & {
  dealRadarCache?: LruCache;
};
export const cache = (globalCache.dealRadarCache ??= new LruCache());
