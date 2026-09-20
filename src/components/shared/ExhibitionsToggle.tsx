import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Independent of the season selector — lets a viewer blend exhibition-match
 * stats into whatever season/all-time scope is already selected. Off by
 * default everywhere so exhibitions never change existing numbers unopted.
 */
export function ExhibitionsToggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Tabs value={value ? 'WITH' : 'LEAGUE'} onValueChange={(v) => onChange(v === 'WITH')}>
      <TabsList>
        <TabsTrigger value="LEAGUE">League Only</TabsTrigger>
        <TabsTrigger value="WITH">Include Exhibitions</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
