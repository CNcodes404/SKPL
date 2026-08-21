export interface ExtractedStat {
  game_name: string
  kills: number
  deaths: number
  flags: number
}

export type ParseImportResult = { ok: true; entries: ExtractedStat[] } | { ok: false; error: string }

/** Deterministically parses the JSON an admin pastes in after asking an AI to read a match screenshot. */
export function parseImportJson(raw: string): ParseImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      error: "That isn't valid JSON. Paste the AI's response exactly as given, including the surrounding [ ] brackets.",
    }
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON array of player stat entries, e.g. [{ "game_name": "...", ... }].' }
  }

  const toInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

  const entries: ExtractedStat[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (typeof rec.game_name !== 'string' || rec.game_name.trim() === '') continue
    entries.push({
      game_name: rec.game_name.trim(),
      kills: toInt(rec.kills),
      deaths: toInt(rec.deaths),
      flags: toInt(rec.flags),
    })
  }

  if (entries.length === 0) {
    return { ok: false, error: 'No valid player entries were found. Each entry needs at least a "game_name".' }
  }

  return { ok: true, entries }
}

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface RosterPlayerOption {
  id: string
  name: string
  game_name: string | null
  team_id: string
}

/** Exact match only, on the player's stored in-game name first, then their registered name. No fuzzy guessing. */
export function matchEntryToPlayer(entry: ExtractedStat, roster: RosterPlayerOption[]): string | null {
  const norm = normalizeName(entry.game_name)
  const byGameName = roster.find((p) => p.game_name && normalizeName(p.game_name) === norm)
  if (byGameName) return byGameName.id
  const byName = roster.find((p) => normalizeName(p.name) === norm)
  return byName ? byName.id : null
}

export const SCREENSHOT_EXTRACTION_PROMPT = `Look at this Smash Karts match-results screenshot and extract each player's stats.

Reply with ONLY a JSON array (no other text, no markdown code fence) in exactly this shape:
[
  { "game_name": "exact in-game name as shown", "kills": 0, "deaths": 0, "flags": 0 }
]

Rules:
- One entry per player visible in the screenshot.
- "game_name" must be copied exactly as it appears on screen, including capitalization and symbols.
- kills, deaths, and flags must be non-negative whole numbers. Use 0 if a value isn't visible.
- Do not include any players who are not shown in the screenshot.
- Do not add explanations, headers, or any text outside the JSON array.`
