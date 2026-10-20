import { useParams } from 'react-router-dom'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { getTournamentBySlug } from '@/services/tournaments'
import SeasonCreateWizard from '@/pages/admin/SeasonCreateWizard'
import RoundsSeasonWizard from '@/pages/admin/RoundsSeasonWizard'

/** Opens the season wizard that matches the tournament's format. */
export default function SeasonCreatePage() {
  const { slug = 'skctf' } = useParams()
  const { data: tournament, loading, error } = useAsync(() => getTournamentBySlug(slug), [slug])

  if (loading) return <LoadingState rows={6} />
  if (error || !tournament) return <ErrorState message="Tournament not found." />

  return tournament.format === 'ROUNDS' ? (
    <RoundsSeasonWizard tournament={tournament} />
  ) : (
    <SeasonCreateWizard tournament={tournament} />
  )
}
