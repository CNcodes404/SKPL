import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const STORAGE_KEY = 'skpl:scroll'
const RESTORE_TIMEOUT_MS = 1500

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writePositions(positions: Record<string, number>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // Storage unavailable (private mode etc.) — scroll restore just won't persist.
  }
}

/**
 * New pages open at the top; going back/forward returns to where you were.
 * Positions are remembered per history entry. Pages load data after they
 * mount, so restoring waits until the page is tall enough (or gives up).
 */
export function ScrollManager() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const keyRef = useRef(location.key)
  const positions = useRef<Record<string, number>>(readPositions())
  const lastPathname = useRef(location.pathname)

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  }, [])

  // Remember the position of the current entry as the user scrolls.
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        positions.current[keyRef.current] = window.scrollY
        writePositions(positions.current)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useLayoutEffect(() => {
    const previousKey = keyRef.current
    keyRef.current = location.key
    const samePage = lastPathname.current === location.pathname
    lastPathname.current = location.pathname

    // Filter changes replace the entry on the same page: keep the position.
    if (navigationType === 'REPLACE') {
      if (samePage && previousKey in positions.current) positions.current[location.key] = positions.current[previousKey]
      return
    }

    if (navigationType === 'PUSH') {
      window.scrollTo(0, 0)
      return
    }

    // POP (back/forward): restore once the page has rendered enough content.
    const target = positions.current[location.key] ?? 0
    if (target === 0) {
      window.scrollTo(0, 0)
      return
    }
    let cancelled = false
    const started = performance.now()
    const stop = () => {
      cancelled = true
    }
    window.addEventListener('wheel', stop, { once: true, passive: true })
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    const attempt = () => {
      if (cancelled) return
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll >= target || performance.now() - started > RESTORE_TIMEOUT_MS) {
        window.scrollTo(0, Math.min(target, Math.max(maxScroll, 0)))
        return
      }
      requestAnimationFrame(attempt)
    }
    attempt()
    return () => {
      cancelled = true
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
    }
  }, [location.key])

  return null
}
