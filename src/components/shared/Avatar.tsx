import { initials, cn } from '@/lib/utils'

export function PlayerAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className?: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={cn('rounded-full object-cover bg-secondary', className)} />
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
  if (logoUrl) {
    return <img src={logoUrl} alt={name} className={cn('object-contain', className)} />
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
