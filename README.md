# MMM-GreenMonster

A [MagicMirror²](https://magicmirror.builders/) module modeled on Fenway Park's
hand-operated Green Monster scoreboard: one panel with the full inning-by-inning
linescore (plus pitcher number and an AT BAT / BALL / STRIKE / OUT / H / E light
strip) for one featured American League game, and the A.L. East standings board
built into the same panel underneath. Static layout — nothing scrolls. Only the
values that actually changed since the last refresh play a brief flip animation.
Data comes from the public MLB Stats API — no API key required.

## Install

1. Copy this folder into your MagicMirror's `modules/` directory (or `git
   clone` it there if it's in your own repo):

   ```
   cp -r MMM-GreenMonster ~/MagicMirror/modules/
   ```

2. If your MagicMirror runs on **Node.js 18 or newer**, you're done — it uses
   the built-in `fetch`. On older Node versions, install the fallback
   dependency:

   ```
   cd ~/MagicMirror/modules/MMM-GreenMonster
   npm install
   ```

3. Add the module to `~/MagicMirror/config/config.js`:

   ```js
   {
     module: "MMM-GreenMonster",
     position: "bottom_bar", // spans full width — good for a portrait mirror
     config: {
       favoriteTeam: "BOS" // 3-letter abbreviation, featured when playing
     }
   }
   ```

4. Restart MagicMirror.

## How the featured game is picked

1. Your `favoriteTeam`'s game, if they're playing today.
2. Otherwise, whichever A.L. game is currently live.
3. Otherwise, the first A.L. game scheduled today.

## Config options

| Option              | Default              | Description                                                        |
|---------------------|-----------------------|----------------------------------------------------------------------|
| `updateInterval`    | `30000` (30s)         | How often the live linescore refreshes, in ms.                     |
| `standingsInterval` | `300000` (5min)       | How often the standings board refreshes, in ms.                    |
| `favoriteTeam`      | `null`                | 3-letter team abbreviation (e.g. `"BOS"`, `"NYY"`) to feature/highlight. |
| `timezone`          | `"America/New_York"`  | Timezone used to decide which day's slate counts as "today".        |
| `season`            | current year          | Override the season year for standings (mostly for testing).        |

## Notes

- Shows "NO A.L. GAME TODAY" during the offseason or on a scheduled off-day.
- Pitcher number is each game's **probable/starting pitcher**, not necessarily
  whoever's on the mound at this exact moment — the Stats API doesn't expose
  live current-pitcher without a much heavier per-game call, so this is a
  deliberate simplification.
- Digit tiles only play their flip animation when that specific value
  actually changes between refreshes, and the H/E lights flash only on the
  refresh where a hit or error is newly recorded.
- Styling aims for a photographic painted-metal look (textured panel, grain,
  directional lighting) rather than a retro/pixel-art treatment. Uses Google
  Fonts (`Oswald`, `Bebas Neue`) via `@import` in the CSS — your mirror needs
  internet access for the intended look (it already needs it for live data),
  otherwise it falls back to a generic sans-serif.
- Data source: [MLB Stats API](https://statsapi.mlb.com) — public and free,
  but unofficial and not rate-limit documented. The default 30s/5min
  intervals are meant to be a reasonably polite footprint for a single
  personal device.
