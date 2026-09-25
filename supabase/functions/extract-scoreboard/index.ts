// Reads a Smash Karts scoreboard image with Gemini and returns per-player
// stats as JSON. Called from the Scorekeeper page in the SKPL app.
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

async function callGemini(model: string, apiKey: string, prompt: string, image: string, mimeType: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: image } }, { text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
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

  let payload: { image?: string; mimeType?: string; kind?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const { image, mimeType = 'image/jpeg', kind = 'live' } = payload
  if (!image || typeof image !== 'string') return json({ error: 'Missing "image" (base64).' }, 400)
  const prompt = PROMPTS[kind]
  if (!prompt) return json({ error: 'kind must be "live" or "final".' }, 400)

  const failures: string[] = []
  for (const model of MODELS) {
    try {
      const result = await callGemini(model, apiKey, prompt, image, mimeType)
      return json({ ...result, model })
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err))
    }
  }
  return json({ error: 'All models failed.', details: failures }, 502)
})
