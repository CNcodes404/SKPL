/**
 * Current/Expected Strength display. Values come from
 * computeTeamStrengths() (src/utils/teamStrength.ts) once a team has
 * bought at least one player; before that, or if not passed, renders "—"
 * rather than a fabricated number.
 */
export function TeamStrengthDisplay({
  current,
  expected,
}: {
  current?: number | null
  expected?: number | null
}) {
  return (
    <div className="flex gap-4 text-center">
      <div>
        <p className="font-display text-lg font-bold text-primary-800">{current != null ? current.toFixed(0) : '—'}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current Strength</p>
      </div>
      <div>
        <p className="font-display text-lg font-bold text-muted-foreground">{expected != null ? expected.toFixed(0) : '—'}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Expected Strength</p>
      </div>
    </div>
  )
}
