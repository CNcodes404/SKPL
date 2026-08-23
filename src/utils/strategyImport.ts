export interface ParsedStrategy {
  weights: {
    kills: number
    deaths: number
    flags: number
    kd: number
    winrate: number
    mvp: number
    experience: number
    form: number
  }
  roleBonuses: {
    flagger: number
    defender: number
    all_rounder: number
  }
  aggressiveness: number
  budgetDiscipline: number
  persistence: number
}

export type ParseStrategyResult = { ok: true; strategy: ParsedStrategy } | { ok: false; error: string }

/** Deterministically parses the JSON an owner pastes in after asking an AI to draft a bidding strategy. Weights need not sum to 100 — the server normalizes them. */
export function parseStrategyImportJson(raw: string): ParseStrategyResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "That isn't valid JSON. Paste the AI's response exactly as given, including the surrounding { } braces." }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a single JSON object, e.g. { "weights": { ... }, "role_bonus": { ... }, ... }.' }
  }
  const rec = parsed as Record<string, unknown>

  const weightsRec = (rec.weights ?? {}) as Record<string, unknown>
  const roleBonusRec = (rec.role_bonus ?? {}) as Record<string, unknown>

  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const weightKeys = ['kills', 'deaths', 'flags', 'kd', 'winrate', 'mvp', 'experience', 'form'] as const

  const hasAnyWeight = weightKeys.some((k) => typeof weightsRec[k] === 'number')
  if (!hasAnyWeight) {
    return { ok: false, error: 'The "weights" object needs at least one numeric field (kills, deaths, flags, kd, winrate, mvp, experience, form).' }
  }

  const weights = {
    kills: num(weightsRec.kills, 12.5),
    deaths: num(weightsRec.deaths, 12.5),
    flags: num(weightsRec.flags, 12.5),
    kd: num(weightsRec.kd, 12.5),
    winrate: num(weightsRec.winrate, 12.5),
    mvp: num(weightsRec.mvp, 12.5),
    experience: num(weightsRec.experience, 12.5),
    form: num(weightsRec.form, 12.5),
  }

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

  return {
    ok: true,
    strategy: {
      weights,
      roleBonuses: {
        flagger: clamp(num(roleBonusRec.flagger, 1), 0.5, 2),
        defender: clamp(num(roleBonusRec.defender, 1), 0.5, 2),
        all_rounder: clamp(num(roleBonusRec.all_rounder, 1), 0.5, 2),
      },
      aggressiveness: clamp(num(rec.aggressiveness, 5), 0, 10),
      budgetDiscipline: clamp(num(rec.budget_discipline, 5), 0, 10),
      persistence: clamp(Math.round(num(rec.persistence, 5)), 1, 10),
    },
  }
}

export const STRATEGY_GENERATION_PROMPT = `Based on the team-building philosophy I described, produce a Smash Karts Premier League auction bidding-strategy file.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{
  "weights": { "kills": 0-100, "deaths": 0-100, "flags": 0-100, "kd": 0-100, "winrate": 0-100, "mvp": 0-100, "experience": 0-100, "form": 0-100 },
  "role_bonus": { "flagger": 0.5-2.0, "defender": 0.5-2.0, "all_rounder": 0.5-2.0 },
  "aggressiveness": 0-10,
  "budget_discipline": 0-10,
  "persistence": 1-10
}

Rules:
- "weights" don't need to sum to 100 — they'll be normalized automatically. Higher means the strategy cares more about that stat.
- "deaths" being high means the strategy strongly avoids players who die a lot (fewer deaths scores better).
- "role_bonus" values above 1.0 favor that role, below 1.0 disfavor it.
- "aggressiveness" is how far over fair value the team will pay for a player it wants.
- "budget_discipline" is how much purse the team holds back early for later picks.
- "persistence" is how many times the team keeps re-bidding on a player before giving up.
- Do not add explanations, headers, or any text outside the JSON object.`
