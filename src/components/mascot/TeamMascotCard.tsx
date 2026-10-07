import { useEffect, useState } from 'react'
import { Maximize2, Volume2, VolumeX } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { MascotPlayer } from '@/components/mascot/MascotPlayer'
import type { Team } from '@/types'

const DEFAULT_COLOR = '#7c3aed'

function mascotColor(team: Team): string {
  return team.mascot_color && /^#[0-9a-f]{6}$/i.test(team.mascot_color) ? team.mascot_color : DEFAULT_COLOR
}

// Dark stage lit from behind in the team's colour, so the effects pop.
function stage(color: string): string {
  return `radial-gradient(ellipse at 50% 45%, ${color}66 0%, ${color}14 45%, transparent 70%), linear-gradient(160deg, #1e0b45 0%, #0f0626 100%)`
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Muted looping mascot next to the squad; clicking it opens a big view with sound. */
export function TeamMascotCard({ team }: { team: Team }) {
  const [open, setOpen] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  if (!team.mascot_video_url) return null

  const color = mascotColor(team)
  const name = team.mascot_name || team.name

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Meet ${name} — open a bigger view`}
        className="group relative block w-full overflow-hidden rounded-xl text-left shadow-elevated ring-1 ring-white/10 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        style={{ background: stage(color) }}
      >
        <div className="relative aspect-video">
          <MascotPlayer
            webmUrl={team.mascot_video_url}
            safariUrl={team.mascot_video_safari_url}
            posterUrl={team.mascot_poster_url}
            alt={`${name}, the ${team.name} mascot`}
            still={reducedMotion || open}
          />
        </div>
        <div className="flex items-end justify-between gap-3 px-5 pb-5">
          <div className="border-l-4 pl-3" style={{ borderColor: color }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Meet the Mascot</p>
            <p className="font-display text-2xl font-extrabold text-white">{name}</p>
            {team.mascot_tagline ? <p className="text-sm font-semibold text-white/80">{team.mascot_tagline}</p> : null}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors group-hover:bg-white/20">
            <Maximize2 className="h-4 w-4" />
          </span>
        </div>
      </button>

      <MascotDialog team={team} name={name} color={color} open={open} onOpenChange={setOpen} />
    </>
  )
}

function MascotDialog({
  team,
  name,
  color,
  open,
  onOpenChange,
}: {
  team: Team
  name: string
  color: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Opening is a click, so browsers normally allow sound; if one still
  // refuses, the player falls back to muted and the button offers sound.
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    if (open) setMuted(false)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl gap-0 overflow-hidden border-white/10 p-0 text-white"
        style={{ background: stage(color) }}
        // Radix warns about a missing description unless told there is none.
        {...(team.mascot_bio ? {} : { 'aria-describedby': undefined })}
      >
        <div className="relative aspect-video w-full">
          {open && team.mascot_video_url ? (
            <MascotPlayer
              webmUrl={team.mascot_video_url}
              safariUrl={team.mascot_video_safari_url}
              posterUrl={team.mascot_poster_url}
              alt={`${name}, the ${team.name} mascot`}
              muted={muted}
              onSoundBlocked={() => setMuted(true)}
            />
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-4 px-6 pb-6">
          <div className="border-l-4 pl-4" style={{ borderColor: color }}>
            <DialogTitle className="font-display text-3xl font-extrabold">{name}</DialogTitle>
            <p className="text-sm font-semibold uppercase tracking-wide text-white/60">
              {team.name}
              {team.mascot_tagline ? ` · ${team.mascot_tagline}` : ''}
            </p>
            {team.mascot_bio ? (
              <DialogDescription className="mt-3 max-w-2xl text-base text-white/80">{team.mascot_bio}</DialogDescription>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Turn sound on' : 'Mute'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
