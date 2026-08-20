import { useEffect, useState } from 'react'
import { listSeasons } from '@/services/seasons'
import type { Season } from '@/types'
import { ALL_SEASONS } from '@/components/shared/SeasonSelector'

export function useSeasonFilter(allowAll = true) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    listSeasons()
      .then((data) => {
        if (!active) return
        setSeasons(data)
        if (data.length > 0) setSelected(data[0].id)
        else if (allowAll) setSelected(ALL_SEASONS)
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [allowAll])

  const selectedSeason = seasons.find((s) => s.id === selected) ?? null

  return { seasons, selected, setSelected, selectedSeason, loading }
}
