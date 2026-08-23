import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { getActiveDraftAuctionSeason } from '@/services/auction'
import { getOwnerRetentionSelections, getRetentionOptions, saveOwnerRetentions } from '@/services/retention'
import { formatLakh } from '@/utils/currency'

export default function OwnerRetention() {
  const { ownerTeamId } = useAuth()

  const { data, loading, error, reload } = useAsync(async () => {
    if (!ownerTeamId) return null
    const season = await getActiveDraftAuctionSeason()
    if (!season) return { season: null as null }
    const [options, existing] = await Promise.all([
      getRetentionOptions(season.seasonId, ownerTeamId),
      getOwnerRetentionSelections(season.seasonId, ownerTeamId),
    ])
    return { season, options, existing }
  }, [ownerTeamId])

  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data?.existing) setSelected(data.existing)
  }, [data])

  if (loading) return <LoadingState rows={6} />
  if (error || !ownerTeamId) return <ErrorState message="Unable to load retention options." />
  if (!data?.season) {
    return (
      <EmptyState
        icon={Users}
        title="No auction open for retention"
        description="Retention decisions unlock once the admin creates a season with an auction-based roster."
      />
    )
  }

  const { season, options } = data
  const cap = options.maxRetentionsPerTeam

  function toggle(playerId: string) {
    setSaved(false)
    setSelected((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId)
      if (prev.length >= cap) return prev
      return [...prev, playerId]
    })
  }

  async function handleSubmit() {
    setSaving(true)
    setSaved(false)
    try {
      await saveOwnerRetentions(season.seasonId, ownerTeamId!, selected)
      setSaved(true)
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Player Retention</h1>
        <p className="text-sm text-muted-foreground">
          {season.seasonName} — choose up to {cap} player{cap === 1 ? '' : 's'} to keep from your last squad, at their
          last price plus a set increase. Submit even if you want to retain none.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Selected {selected.length} / {cap}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {options.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no players eligible for retention from a prior season.</p>
          ) : (
            options.candidates.map((c) => {
              const checked = selected.includes(c.player.id)
              const disabled = !checked && selected.length >= cap
              return (
                <label
                  key={c.player.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox checked={checked} disabled={disabled} onChange={() => toggle(c.player.id)} />
                    <div>
                      <p className="font-semibold text-primary-900">{c.player.name}</p>
                      <p className="text-xs text-muted-foreground">Season {c.lastSeasonNumber} price: {formatLakh(c.lastPrice)}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-primary-900">{formatLakh(c.retentionPrice)}</p>
                </label>
              )
            })
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Submitting…' : 'Submit Retention Decision'}
        </Button>
        {saved ? <span className="text-xs font-medium text-green-600">Submitted</span> : null}
      </div>
    </div>
  )
}
