import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * A page option (tab, filter, toggle) kept in the URL query string, so the
 * back button — and shared links — return to the same view. The default value
 * is left out of the URL to keep links short. Updates replace the history
 * entry rather than adding one, so back still goes to the previous page.
 */
export function useUrlState<T extends string>(
  key: string,
  defaultValue: T,
  allowed?: readonly T[],
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(key)
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as T) : defaultValue

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next === defaultValue) params.delete(key)
          else params.set(key, next)
          return params
        },
        { replace: true },
      )
    },
    [key, defaultValue, setSearchParams],
  )

  return [value, setValue]
}

/** Boolean flavour of useUrlState, stored as "1" when on. Defaults to off. */
export function useUrlFlag(key: string): [boolean, (value: boolean) => void] {
  const [raw, setRaw] = useUrlState<'0' | '1'>(key, '0', ['0', '1'])
  return [raw === '1', (v: boolean) => setRaw(v ? '1' : '0')]
}
