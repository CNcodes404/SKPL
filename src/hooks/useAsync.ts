import { useEffect, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
} {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fn()
      .then((result) => {
        if (active) setData(result)
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
