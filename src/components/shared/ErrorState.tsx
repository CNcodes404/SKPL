import { AlertTriangle } from 'lucide-react'

export function ErrorState({ message = 'Something went wrong. Please try again.' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm font-medium text-destructive">{message}</p>
    </div>
  )
}
