import type { ExtensionContext } from 'vscode';

import type { ChatSession } from '../core/models';

interface CacheEntry {
  session: ChatSession;
  mtime: number;
  lastAccessed: number;
}

const CACHE_KEY = 'sessionCache.v2';

export class SessionCache {
  private readonly map: Map<string, CacheEntry>;

  constructor(
    private readonly context: ExtensionContext,
    private readonly maxEntries = 1000,
  ) {
    const raw = context.globalState.get<Record<string, CacheEntry>>(CACHE_KEY, {});
    this.map = new Map(Object.entries(raw));
  }

  get(filePath: string, currentMtime: number): ChatSession | null {
    const entry = this.map.get(filePath);
    if (!entry || entry.mtime !== currentMtime) { return null; }
    entry.lastAccessed = Date.now();
    return entry.session;
  }

  set(filePath: string, mtime: number, session: ChatSession): void {
    if (this.map.size >= this.maxEntries && !this.map.has(filePath)) {
      const oldestKey = [...this.map.entries()]
        .sort((left, right) => (left[1].lastAccessed ?? left[1].mtime) - (right[1].lastAccessed ?? right[1].mtime))[0]?.[0];
      if (oldestKey) { this.map.delete(oldestKey); }
    }
    this.map.set(filePath, { mtime, session, lastAccessed: Date.now() });
  }

  async flush(): Promise<void> {
    await this.context.globalState.update(CACHE_KEY, Object.fromEntries(this.map));
  }

  async clear(): Promise<void> {
    this.map.clear();
    await this.context.globalState.update(CACHE_KEY, {});
  }
}