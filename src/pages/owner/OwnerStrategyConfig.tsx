import { useEffect, useState } from 'react'
import { Sparkles, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAuth } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { getOwnerStrategy, saveOwnerStrategy, type OwnerStrategyRoleBonuses, type OwnerStrategyWeights } from '@/services/strategy'
import { parseStrategyImportJson, STRATEGY_GENERATION_PROMPT } from '@/utils/strategyImport'

const WEIGHT_FIELDS: { key: keyof OwnerStrategyWeights; label: string }[] = [
  { key: 'kills', label: 'Kills' },
  { key: 'deaths', label: 'Deaths (fewer is better)' },
  { key: 'flags', label: 'Flags' },
  { key: 'kd', label: 'K/D Ratio' },
  { key: 'winrate', label: 'Win Rate' },
  { key: 'mvp', label: 'MVP Count' },
  { key: 'experience', label: 'Experience' },
  { key: 'form', label: 'Recent Form' },
]

const DEFAULT_WEIGHTS: OwnerStrategyWeights = {
  kills: 12.5,
  deaths: 12.5,
  flags: 12.5,
  kd: 12.5,
  winrate: 12.5,
  mvp: 12.5,
  experience: 12.5,
  form: 12.5,
}
const DEFAULT_ROLE_BONUSES: OwnerStrategyRoleBonuses = { flagger: 1, defender: 1, all_rounder: 1 }

export default function OwnerStrategyConfig() {
  const { ownerTeamId } = useAuth()
  const { data, loading, error, reload } = useAsync(
    () => (ownerTeamId ? getOwnerStrategy(ownerTeamId) : Promise.resolve(null)),
    [ownerTeamId],
  )

  const [weights, setWeights] = useState<OwnerStrategyWeights>(DEFAULT_WEIGHTS)
  const [roleBonuses, setRoleBonuses] = useState<OwnerStrategyRoleBonuses>(DEFAULT_ROLE_BONUSES)
  const [aggressiveness, setAggressiveness] = useState(5)
  const [budgetDiscipline, setBudgetDiscipline] = useState(5)
  const [persistence, setPersistence] = useState(5)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setWeights({
      kills: data.weight_kills,
      deaths: data.weight_deaths,
      flags: data.weight_flags,
      kd: data.weight_kd,
      winrate: data.weight_winrate,
      mvp: data.weight_mvp,
      experience: data.weight_experience,
      form: data.weight_form,
    })
    setRoleBonuses({
      flagger: data.role_bonus_flagger,
      defender: data.role_bonus_defender,
      all_rounder: data.role_bonus_all_rounder,
    })
    setAggressiveness(data.aggressiveness)
    setBudgetDiscipline(data.budget_discipline)
    setPersistence(data.persistence)
  }, [data])

  if (loading) return <LoadingState rows={6} />
  if (error || !ownerTeamId) return <ErrorState message="Unable to load your team's strategy." />

  async function handleSave() {
    if (!ownerTeamId) return
    setSaving(true)
    setSaved(false)
    try {
      await saveOwnerStrategy(ownerTeamId, weights, roleBonuses, aggressiveness, budgetDiscipline, persistence)
      setSaved(true)
      reload()
    } finally {
      setSaving(false)
    }
  }

  function handleApplyImport() {
    const result = parseStrategyImportJson(importText)
    if (!result.ok) {
      setImportError(result.error)
      return
    }
    setWeights(result.strategy.weights)
    setRoleBonuses(result.strategy.roleBonuses)
    setAggressiveness(result.strategy.aggressiveness)
    setBudgetDiscipline(result.strategy.budgetDiscipline)
    setPersistence(result.strategy.persistence)
    setImportError(null)
    setImportOpen(false)
    setImportText('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Auction Strategy</h1>
          <p className="text-sm text-muted-foreground">
            Set how your team's AI bidder values players. Locked in once the admin starts the auction.
          </p>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import JSON
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="weights">
            <TabsList>
              <TabsTrigger value="weights">Stat Weights</TabsTrigger>
              <TabsTrigger value="behavior">Behavior</TabsTrigger>
            </TabsList>

            <TabsContent value="weights">
              <p className="mb-4 text-sm text-muted-foreground">
                How much each stat matters to you. These don't need to add up to 100 — they're automatically
                balanced against each other when saved.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {WEIGHT_FIELDS.map(({ key, label }) => (
                  <FormField key={key} label={label} htmlFor={`weight-${key}`}>
                    <Input
                      id={`weight-${key}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={weights[key]}
                      onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                    />
                  </FormField>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="behavior">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Flagger Preference" htmlFor="role-flagger">
                  <Input
                    id="role-flagger"
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={roleBonuses.flagger}
                    onChange={(e) => setRoleBonuses((r) => ({ ...r, flagger: Number(e.target.value) }))}
                  />
                </FormField>
                <FormField label="Defender Preference" htmlFor="role-defender">
                  <Input
                    id="role-defender"
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={roleBonuses.defender}
                    onChange={(e) => setRoleBonuses((r) => ({ ...r, defender: Number(e.target.value) }))}
                  />
                </FormField>
                <FormField label="All-Rounder Preference" htmlFor="role-all-rounder">
                  <Input
                    id="role-all-rounder"
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={roleBonuses.all_rounder}
                    onChange={(e) => setRoleBonuses((r) => ({ ...r, all_rounder: Number(e.target.value) }))}
                  />
                </FormField>
                <FormField label="Aggressiveness (0-10)" htmlFor="aggressiveness">
                  <Input
                    id="aggressiveness"
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={aggressiveness}
                    onChange={(e) => setAggressiveness(Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Budget Discipline (0-10)" htmlFor="budget-discipline">
                  <Input
                    id="budget-discipline"
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={budgetDiscipline}
                    onChange={(e) => setBudgetDiscipline(Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Persistence (1-10)" htmlFor="persistence">
                  <Input
                    id="persistence"
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={persistence}
                    onChange={(e) => setPersistence(Number(e.target.value))}
                  />
                </FormField>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Strategy'}
            </Button>
            {saved ? <span className="text-xs font-medium text-green-600">Saved</span> : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Import Strategy from JSON
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Describe your team-building philosophy to an AI assistant using the prompt below, then paste its JSON
              response here to auto-fill the fields (review before saving).
            </p>
            <Textarea
              readOnly
              value={STRATEGY_GENERATION_PROMPT}
              className="min-h-[120px] font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <FormField label="Paste JSON response" htmlFor="import-json" error={importError ?? undefined}>
              <Textarea
                id="import-json"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="min-h-[140px] font-mono text-xs"
                placeholder='{ "weights": { "kills": 20, ... }, "role_bonus": { ... }, "aggressiveness": 7, ... }'
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyImport}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
