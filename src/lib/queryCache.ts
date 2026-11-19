/**
 * Short-lived in-memory cache for public page data. Going back to a page
 * within the TTL shows the data instantly instead of re-fetching it. Lives
 * only for the tab's session; a full reload starts empty.
 */
export const DEFAULT_CACHE_TTL_MS = 60_000

const store = new Map<string, { data: unknown; at: number }>()

export function getCached<T>(key: string, ttlMs = DEFAULT_CACHE_TTL_MS): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at > ttlMs) {
    store.delete(key)
    return undefined
  }
  return entry.data as T
}

export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() })
}

/** Runs fn, or returns its cached result when one is still fresh. */
export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_CACHE_TTL_MS): Promise<T> {
  const hit = getCached<T>(key, ttlMs)
  if (hit !== undefined) return hit
  const data = await fn()
  setCached(key, data)
  return data
}
