import { forwardRef, type InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, checked, ...props }, ref) => (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input type="checkbox" ref={ref} checked={checked} className="peer absolute inset-0 h-5 w-5 cursor-pointer opacity-0" {...props} />
      <span
        className={cn(
          'pointer-events-none flex h-5 w-5 items-center justify-center rounded border border-input bg-white peer-checked:border-primary-700 peer-checked:bg-primary-700 peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
          className,
        )}
      >
        {checked ? <Check className="h-3.5 w-3.5 text-white" /> : null}
      </span>
    </span>
  ),
)
Checkbox.displayName = 'Checkbox'
