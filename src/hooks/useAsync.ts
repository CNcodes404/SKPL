import { useEffect, useState } from 'react'
import { getCached, setCached } from '@/lib/queryCache'

/**
 * cache: a name for this query. When set, results are kept in memory for a
 * minute (keyed by name + deps), so revisiting the page — e.g. with the back
 * button — renders instantly without a refetch. reload() always refetches.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList,
  options: { cache?: string } = {},
): {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
} {
  const cacheKey = options.cache ? `${options.cache}:${JSON.stringify(deps)}` : null
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? getCached<T>(cacheKey) : undefined))
  const [loading, setLoading] = useState(() => !(cacheKey && getCached<T>(cacheKey) !== undefined))
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    if (cacheKey && tick === 0) {
      const hit = getCached<T>(cacheKey)
      if (hit !== undefined) {
        setData(hit)
        setError(null)
        setLoading(false)
        return
      }
    }
    setLoading(true)
    setError(null)
    fn()
      .then((result) => {
        if (!active) return
        if (cacheKey) setCached(cacheKey, result)
        setData(result)
      })
      .catch((err) => {
        console.error(err)
        if (active) setError(err instanceof Error ? err.message : 'Something went wrong.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}
