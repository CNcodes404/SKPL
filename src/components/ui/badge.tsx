import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-100 text-primary-800',
        accent: 'border-transparent bg-accent-100 text-accent-800',
        success: 'border-transparent bg-green-100 text-green-700',
        destructive: 'border-transparent bg-red-100 text-red-700',
        outline: 'border-border text-foreground',
        solid: 'border-transparent bg-primary-700 text-white',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />
}
