import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listLiveMatches, subscribeAllLiveMatches, type LiveMatch } from '@/services/scorekeeper'

interface LiveMatchesContextValue {
  liveMatches: LiveMatch[]
  getLive: (matchId: string) => LiveMatch | undefined
}

// Outside the provider (e.g. admin pages) nothing is live.
const LiveMatchesContext = createContext<LiveMatchesContextValue>({ liveMatches: [], getLive: () => undefined })

// One scoreboard save upserts a row per player, so coalesce bursts of events into one reload.
const RELOAD_DEBOUNCE_MS = 500

export function LiveMatchesProvider({ children }: { children: ReactNode }) {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const next = await listLiveMatches()
        if (active) setLiveMatches(next)
      } catch {
        // Keep the last known state; the next event retries.
      }
    }
    load()
    const unsubscribe = subscribeAllLiveMatches(() => {
      clearTimeout(timer)
      timer = setTimeout(load, RELOAD_DEBOUNCE_MS)
    })
    return () => {
      active = false
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  const value = useMemo<LiveMatchesContextValue>(() => {
    const byId = new Map(liveMatches.map((l) => [l.match.id, l]))
    return { liveMatches, getLive: (matchId) => byId.get(matchId) }
  }, [liveMatches])

  return <LiveMatchesContext.Provider value={value}>{children}</LiveMatchesContext.Provider>
}

export function useLiveMatches() {
  return useContext(LiveMatchesContext)
}

/** Public scorecard URL for a match (exhibitions live under their own route). */
export function matchPath(match: { id: string; match_type: string }) {
  return match.match_type === 'EXHIBITION' ? `/exhibitions/${match.id}` : `/matches/${match.id}`
}
