# MMM-GreenMonster

A [MagicMirror²](https://magicmirror.builders/) module styled after Fenway Park's
hand-operated Green Monster scoreboard: a scrolling ticker of every American League
game today (inning-by-inning, yellow digits mid-inning / white once final — the same
convention the real wall uses), a balls-strikes-outs light strip for live games, and
the A.L. East standings board. Wrapped in a chunky-pixel, CRT-scanline, N64-dugout
kind of look. Data comes from the public MLB Stats API — no API key required.

## Install

1. Copy this folder into your MagicMirror's `modules/` directory:

   ```
   cp -r MMM-GreenMonster ~/MagicMirror/modules/
   ```

2. If your MagicMirror runs on **Node.js 18 or newer**, you're done — it uses the
   built-in `fetch`. On older Node versions, install the fallback dependency:

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
       favoriteTeam: "BOS",  // 3-letter abbreviation, highlights that team
       layout: "column"      // "column" (stacked) or "row" (side-by-side)
     }
   }
   ```

4. Restart MagicMirror.

## Config options

| Option              | Default              | Description                                                        |
|---------------------|-----------------------|----------------------------------------------------------------------|
| `updateInterval`    | `30000` (30s)         | How often live linescores refresh, in ms.                          |
| `standingsInterval` | `300000` (5min)       | How often the standings board refreshes, in ms.                    |
| `favoriteTeam`      | `null`                | 3-letter team abbreviation (e.g. `"BOS"`, `"NYY"`) to highlight.    |
| `layout`             | `"column"`            | `"column"` stacks the ticker above standings; `"row"` puts them side by side. |
| `timezone`          | `"America/New_York"`  | Timezone used to decide which day's slate counts as "today".        |
| `season`            | current year          | Override the season year for standings (mostly for testing).        |

## Notes

- Games shown are any game involving an A.L. team (including interleague matchups),
  same as the real board's rule.
- The board shows "NO A.L. GAMES TODAY" during the offseason or scheduled off-days.
- Digit tiles only play their flip animation when that specific inning's value
  actually changes between refreshes, so the board stays calm between updates and
  comes alive right when a run scores.
- Uses Google Fonts (`Press Start 2P`, `VT323`) via `@import` in the CSS — your
  mirror needs internet access for the intended look (it already needs it for
  live data), otherwise it falls back to a generic monospace font.
- Data source: [MLB Stats API](https://statsapi.mlb.com) — public and free, but
  unofficial and not rate-limit documented. The default 30s/5min intervals are
  meant to be a reasonably polite footprint for a single personal device.
