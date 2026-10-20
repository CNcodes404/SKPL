import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { updateSeason } from '@/services/seasons'

export function SeasonDescriptionCard({
  seasonId,
  description,
  onSaved,
}: {
  seasonId: string
  description: string | null
  onSaved: () => void
}) {
  const [text, setText] = useState(description ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateSeason(seasonId, { description: text.trim() || null })
      setSaved(true)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>About This Season</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          placeholder="Optional intro shown on the public About page, e.g. how the season played out."
          className="min-h-[100px]"
        />
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Description'}
          </Button>
          {saved ? <span className="text-xs font-medium text-green-600">Saved</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
