import { useState } from 'react'
import { initials, cn } from '@/lib/utils'

export function PlayerAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={cn('rounded-full object-cover bg-secondary', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-skpl-gradient-soft font-display font-bold text-white',
        className,
      )}
    >
      {initials(name) || '?'}
    </div>
  )
}

export function TeamLogo({ name, logoUrl, className }: { name: string; logoUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={cn('object-contain', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md bg-skpl-gradient font-display font-bold text-white',
        className,
      )}
    >
      {initials(name) || '?'}
    </div>
  )
}
