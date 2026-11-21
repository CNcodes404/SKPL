// Reads a Smash Karts scoreboard image with Gemini and returns per-player
// stats as JSON. Called from the Scorekeeper page in the SKPL app, and from
// the admin Solo League round editor (kind "solo").
//
// The Gemini key lives only here, as the GEMINI_API_KEY function secret —
// never in the browser. Only signed-in scorekeepers and admins may call it.
//
// Deploy:  npx supabase functions deploy extract-scoreboard --no-verify-jwt
// (the caller's token is verified below instead, which also works with the
// newer asymmetric JWT signing keys).
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Tried in order: free-tier models are sometimes "experiencing high demand",
// and each model has its own rate limit, so falling through keeps captures flowing.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COMMON_RULES = `Columns in the stats table, left to right, are marked by icons: skull = DEATHS, medal/rosette = KILLS, flag = FLAGS. The skull column is deaths, NOT kills.
Row background colour gives the team: "red" or "blue".
Copy each player's name exactly as shown, including capitalisation, symbols and any prefix.
Ignore the small numbered level badge at the start of each row.
Include every row that is visible. If no stats table with those three icon columns is visible, set scoreboard_visible to false and return an empty players list.`

const PROMPTS: Record<string, string> = {
  live: `This is a Smash Karts spectator view. The in-match scoreboard panel may be open in the centre (it has a close X button).
${COMMON_RULES}
Do not read the small list at the top-left of the screen; only read the central scoreboard panel.`,
  final: `This is a Smash Karts end-of-match results screen with a "Leaderboards" table.
${COMMON_RULES}
Names on this screen may start with a number and a dash, e.g. "147.18-Name" — copy them exactly as shown.`,
}

// Solo League (free-for-all): one full screenshot, or two crops of the same
// moment (top-left player list + centre stats panel). No teams, no flags.
const SOLO_PROMPT = `These images are from a Smash Karts free-for-all match (no teams). They may show one or both of:
1. The small player list at the top-left of the screen: one row per player with a numbered level badge, the player's name, and one number on the right = that player's KILLS. Every player is listed here.
2. The central stats panel (it has a close X button): one row per player with a numbered level badge, the name, then three icon columns left to right: a badge icon (IGNORE this column), a skull = DEATHS, a crosshair/target = KILLS. It shows at most 8 rows, so some players may be missing from it.
If two images are given they are the same moment: the first is the player list, the second is the stats panel.
Return every player once. kills: from the stats panel if the player's row is there, otherwise from the player list. deaths: from the stats panel's skull column, or null if the player's row isn't in the stats panel.
Kills can be negative (e.g. -1). Ignore the numbered level badge at the start of each row — it is not a stat.
Skip any player named "BOT" and any row whose number is "-" or blank.
Copy each name exactly as shown, including capitalisation and symbols.
If neither panel is visible, set scoreboard_visible to false and return an empty players list.`

const SOLO_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    scoreboard_visible: { type: 'BOOLEAN' },
    players: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          game_name: { type: 'STRING' },
          kills: { type: 'INTEGER' },
          deaths: { type: 'INTEGER', nullable: true },
        },
        required: ['game_name', 'kills'],
      },
    },
  },
  required: ['scoreboard_visible', 'players'],
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    scoreboard_visible: { type: 'BOOLEAN' },
    players: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          game_name: { type: 'STRING' },
          team: { type: 'STRING', enum: ['red', 'blue'] },
          deaths: { type: 'INTEGER' },
          kills: { type: 'INTEGER' },
          flags: { type: 'INTEGER' },
        },
        required: ['game_name', 'team', 'deaths', 'kills', 'flags'],
      },
    },
  },
  required: ['scoreboard_visible', 'players'],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function isStaff(authHeader: string): Promise<boolean> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const [scorekeeper, admin] = await Promise.all([supabase.rpc('is_scorekeeper'), supabase.rpc('is_admin')])
  if (scorekeeper.error || admin.error) return false
  return scorekeeper.data === true || admin.data === true
}

async function callGemini(
  model: string,
  apiKey: string,
  prompt: string,
  images: string[],
  mimeType: string,
  schema: unknown,
) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      contents: [
        { parts: [...images.map((data) => ({ inline_data: { mime_type: mimeType, data } })), { text: prompt }] },
      ],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
    }),
  })
  const body = await res.json()
  if (!res.ok || body.error) {
    throw new Error(`${model}: ${body.error?.message ?? res.statusText}`)
  }
  const text = body.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new Error(`${model}: empty response`)
  return JSON.parse(text)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !(await isStaff(authHeader))) {
    return json({ error: 'Only scorekeepers can extract scoreboards.' }, 403)
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'GEMINI_API_KEY is not set for this function.' }, 500)

  let payload: { image?: string; images?: string[]; mimeType?: string; kind?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const { image, mimeType = 'image/jpeg', kind = 'live' } = payload
  const images = Array.isArray(payload.images) ? payload.images.filter((i) => typeof i === 'string' && i) : image ? [image] : []
  if (images.length === 0 || images.length > 2) return json({ error: 'Send "image" or one or two "images" (base64).' }, 400)
  const solo = kind === 'solo'
  const prompt = solo ? SOLO_PROMPT : PROMPTS[kind]
  if (!prompt) return json({ error: 'kind must be "live", "final" or "solo".' }, 400)
  if (!solo && images.length !== 1) return json({ error: 'Team scoreboards take a single image.' }, 400)

  const failures: string[] = []
  for (const model of MODELS) {
    try {
      const result = await callGemini(model, apiKey, prompt, images, mimeType, solo ? SOLO_RESPONSE_SCHEMA : RESPONSE_SCHEMA)
      return json({ ...result, model })
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err))
    }
  }
  return json({ error: 'All models failed.', details: failures }, 502)
})
