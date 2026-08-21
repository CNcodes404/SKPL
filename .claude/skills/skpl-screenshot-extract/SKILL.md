---
name: skpl-screenshot-extract
description: Extract per-player kills/deaths/flags from a Smash Karts in-game leaderboard screenshot into the exact JSON schema the SKPL admin app's "Import from Screenshot" feature expects. Use whenever the user shares a Smash Karts match-results/leaderboard screenshot in the SKPL project, or asks to extract stats, log a match, or decide an MVP from one.
---

# SKPL screenshot stat extraction

Reads a Smash Karts leaderboard screenshot and turns it into the JSON array consumed by
`src/utils/screenshotImport.ts` (`parseImportJson`) in this repo, so it can be pasted directly into
the admin match score-entry page.

## Column order — the one mistake to never repeat

The Smash Karts leaderboard shows three icon columns per row. It is tempting to assume the
skull-and-crossbones icon means **kills** (common game convention) — **that assumption is wrong for
this UI and has caused a real misread before.** The confirmed order, left to right, is:

| Position | Icon | Stat |
|---|---|---|
| 1st | skull and crossbones | **Deaths** |
| 2nd | medal / ribbon | **Kills** |
| 3rd | flag | **Flags** |

Always map columns by this fixed order (Deaths, Kills, Flags), not by icon intuition. If a
screenshot ever includes visible text headers above the columns, trust the text headers over both
this table and icon intuition — but absent headers, use this order.

## What to ignore

- The numbered circle badges on the left of each row (e.g. `1`, `11`, `26`) are the player's global
  in-game rank, not part of this match's stats. Do not extract them, and do not confuse them with
  kills/deaths/flags.
- Row background color (orange/red vs. blue) indicates team affiliation in-game. The SKPL app
  doesn't need a team label from the screenshot — team membership is derived automatically from
  each matched player's season roster once the name is matched in-app. Don't try to infer or output
  a team field.

## Extraction procedure

1. Read every row's player name exactly as displayed — same capitalization, same symbols, no
   corrections or "cleanup". This must match the player's stored in-game name exactly for the
   app's exact-match lookup to work.
2. For each row, read the three numeric columns in **Deaths, Kills, Flags** order per the table
   above.
3. Sanity-check before answering: every value is a non-negative integer; no row is missing a name
   or a number (use `0` only if a value is genuinely blank/unreadable in the image, never guess).
4. Output **only** a JSON array, no prose, no markdown code fence, in this exact shape:

```json
[
  { "game_name": "ExactNameFromScreenshot", "kills": 0, "deaths": 0, "flags": 0 }
]
```

This is the same schema as `SCREENSHOT_EXTRACTION_PROMPT` in `src/utils/screenshotImport.ts` — keep
them in sync if either ever changes.

## If asked to suggest an MVP

The SKPL app deliberately has **no automatic MVP formula** (season/match MVP is an admin's manual,
subjective call — see `src/pages/admin/AdminMatchDetail.tsx` and `SeasonDetail.tsx`). It's fine to
share a quick K/D table and a personal read of who stood out, but always frame it as a suggestion,
never as a computed/authoritative answer, and never store or push a value into the MVP field
yourself.
