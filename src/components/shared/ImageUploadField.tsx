import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/shared/FormField'
import { uploadImage } from '@/services/storage'

export function ImageUploadField({
  label,
  value,
  onChange,
  folder,
  hint,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  folder: 'teams' | 'players'
  hint?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadImage(file, folder)
      onChange(url)
    } catch {
      setError('Unable to upload image. Please try a smaller file (max 5MB) or a different format.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <FormField label={label} hint={hint} error={error ?? undefined}>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img src={value} alt="" className="h-12 w-12 rounded-md border border-border object-cover" />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste an image URL, or upload a file"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload'}
        </Button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChange} className="hidden" />
      </div>
    </FormField>
  )
}
