import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Goes back to the previous page in the app with its filters intact (they
 * live in the URL). When the page was opened directly — a shared link or a
 * fresh tab — there is no in-app history, so it goes to `fallback` instead.
 */
export function BackButton({ fallback, label = 'Back', className }: { fallback: string; label?: string; className?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasHistory = location.key !== 'default'

  return (
    <button
      type="button"
      onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50 hover:text-primary-900',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}
