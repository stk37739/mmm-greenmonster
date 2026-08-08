/* MMM-GreenMonster / MMM-GreenMonster.js
 *
 * A MagicMirror² module styled after Fenway Park's hand-operated Green
 * Monster scoreboard: live A.L. linescores (yellow digits mid-inning,
 * white digits once an inning is final — same convention the real wall
 * uses), a ball/strike/out light strip, and the A.L. East standings
 * board. Data via node_helper.js from the MLB Stats API.
 *
 * Intended region: "bottom_bar" (spans full width, sits at the bottom —
 * a good match for a portrait-oriented mirror).
 */

Module.register("MMM-GreenMonster", {
  defaults: {
    updateInterval: 30 * 1000, // live linescore refresh
    standingsInterval: 5 * 60 * 1000, // standings refresh (changes slowly)
    favoriteTeam: null, // 3-letter abbreviation, e.g. "BOS" — highlights that team
    layout: "column", // "column" (stacked, good for portrait) or "row"
    fadeSpeed: 500,
    timezone: "America/New_York", // which "today" to fetch — Fenway's, by default
    season: null // override season year if needed (e.g. for testing); defaults to current year
  },

  requiresVersion: "2.20.0",

  start() {
    this.games = [];
    this.standings = [];
    this.loaded = false;
    this._changedCells = new Set();
    this.sendSocketNotification("GM_INIT", this.config);
  },

  getStyles() {
    return ["MMM-GreenMonster.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "GM_GAMES") {
      this._changedCells = this.computeChangedCells(this.games, payload.games);
      this.games = payload.games;
      this.loaded = true;
      this.updateDom(this.config.fadeSpeed);
    } else if (notification === "GM_STANDINGS") {
      this.standings = payload.standings;
      this.updateDom(this.config.fadeSpeed);
    }
  },

  // Figures out which individual inning cells changed since the last
  // payload so only those digits get the "flip" animation.
  computeChangedCells(oldGames, newGames) {
    const changed = new Set();
    const oldMap = {};
    (oldGames || []).forEach((g) => {
      oldMap[g.gamePk] = g;
    });

    (newGames || []).forEach((g) => {
      const old = oldMap[g.gamePk];
      (g.innings || []).forEach((inn) => {
        ["home", "away"].forEach((side) => {
          const newVal = inn[side];
          const oldInn = old && old.innings ? old.innings.find((x) => x.num === inn.num) : null;
          const oldVal = oldInn ? oldInn[side] : undefined;
          if (newVal !== null && newVal !== undefined && newVal !== oldVal) {
            changed.add(`${g.gamePk}-${inn.num}-${side}`);
          }
        });
      });
    });

    return changed;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "gm-wrapper";

    const scanlines = document.createElement("div");
    scanlines.className = "gm-scanlines";
    wrapper.appendChild(scanlines);

    wrapper.appendChild(this.buildHeader());

    const body = document.createElement("div");
    body.className = `gm-body gm-layout-${this.config.layout === "row" ? "row" : "column"}`;
    body.appendChild(this.buildTicker());
    body.appendChild(this.buildStandings());
    wrapper.appendChild(body);

    const mascot = document.createElement("div");
    mascot.className = "gm-mascot";
    wrapper.appendChild(mascot);

    return wrapper;
  },

  buildHeader() {
    const header = document.createElement("div");
    header.className = "gm-header";

    const title = document.createElement("span");
    title.className = "gm-title";
    title.innerHTML = "FENWAY&nbsp;PARK&nbsp;&middot;&nbsp;<span class='gm-title-sub'>GREEN MONSTER</span>";
    header.appendChild(title);

    const anyLive = this.games.some((g) => g.status === "Live");
    const liveDot = document.createElement("span");
    liveDot.className = "gm-live-dot" + (anyLive ? " on" : "");
    liveDot.textContent = anyLive ? "\u25CF LIVE" : "";
    header.appendChild(liveDot);

    return header;
  },

  buildTicker() {
    const track = document.createElement("div");
    track.className = "gm-scoreboard";

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "gm-loading";
      loading.textContent = "LOADING TODAY'S GAMES\u2026";
      track.appendChild(loading);
      return track;
    }

    if (this.games.length === 0) {
      const none = document.createElement("div");
      none.className = "gm-loading";
      none.textContent = "NO A.L. GAMES TODAY";
      track.appendChild(none);
      return track;
    }

    const inner = document.createElement("div");
    inner.className = "gm-ticker-track";
    const duration = Math.max(24, this.games.length * 9);
    inner.style.setProperty("--gm-scroll-duration", `${duration}s`);

    // Duplicate the list back-to-back so the marquee loops seamlessly.
    [...this.games, ...this.games].forEach((game) => {
      inner.appendChild(this.buildGameTile(game));
    });

    track.appendChild(inner);
    return track;
  },

  buildGameTile(game) {
    const tile = document.createElement("div");
    tile.className = "gm-game-tile";
    if (game.status === "Live") tile.classList.add("is-live");
    if (game.status === "Final") tile.classList.add("is-final");

    const maxInning = Math.max(9, game.innings.length);

    [
      { side: "away", abbr: game.awayAbbr, runs: game.awayRuns, hits: game.awayHits, errs: game.awayErrors },
      { side: "home", abbr: game.homeAbbr, runs: game.homeRuns, hits: game.homeHits, errs: game.homeErrors }
    ].forEach((row) => {
      tile.appendChild(this.buildTeamRow(game, row, maxInning));
    });

    if (game.status === "Live") {
      tile.appendChild(this.buildLights(game));
    } else {
      const status = document.createElement("div");
      status.className = "gm-status";
      status.textContent = game.status === "Final" ? "FINAL" : game.detailedState || "";
      tile.appendChild(status);
    }

    return tile;
  },

  buildTeamRow(game, row, maxInning) {
    const rowEl = document.createElement("div");
    rowEl.className = "gm-row";

    const abbr = document.createElement("span");
    abbr.className = "gm-abbr";
    abbr.textContent = row.abbr;
    if (this.config.favoriteTeam && row.abbr === this.config.favoriteTeam) {
      abbr.classList.add("is-favorite");
    }
    rowEl.appendChild(abbr);

    for (let i = 1; i <= maxInning; i++) {
      const inn = game.innings.find((x) => x.num === i);
      const val = inn ? inn[row.side] : null;
      const digit = document.createElement("span");
      digit.className = "gm-digit";

      const isCurrentInning = game.status === "Live" && game.inning === i;
      if (isCurrentInning) digit.classList.add("live");
      if (val === null || val === undefined) {
        digit.classList.add("empty");
      } else {
        digit.textContent = String(val);
      }

      const key = `${game.gamePk}-${i}-${row.side}`;
      if (this._changedCells.has(key)) digit.classList.add("gm-flip");

      rowEl.appendChild(digit);
    }

    rowEl.appendChild(this.buildRHECell(row.runs));
    rowEl.appendChild(this.buildRHECell(row.hits));
    rowEl.appendChild(this.buildRHECell(row.errs));

    return rowEl;
  },

  buildRHECell(value) {
    const cell = document.createElement("span");
    cell.className = "gm-digit gm-rhe";
    if (value === null || value === undefined) {
      cell.classList.add("empty");
    } else {
      cell.textContent = String(value);
    }
    return cell;
  },

  buildLights(game) {
    const wrap = document.createElement("div");
    wrap.className = "gm-lights";

    const mkGroup = (label, count, lit) => {
      const group = document.createElement("span");
      group.className = "gm-light-group";

      const l = document.createElement("span");
      l.className = "gm-light-label";
      l.textContent = label;
      group.appendChild(l);

      for (let i = 0; i < count; i++) {
        const dot = document.createElement("span");
        dot.className = "gm-light" + (i < (lit || 0) ? " on" : "");
        group.appendChild(dot);
      }
      return group;
    };

    wrap.appendChild(mkGroup("B", 3, game.balls));
    wrap.appendChild(mkGroup("S", 2, game.strikes));
    wrap.appendChild(mkGroup("O", 2, game.outs));

    return wrap;
  },

  buildStandings() {
    const panel = document.createElement("div");
    panel.className = "gm-standings";

    const title = document.createElement("div");
    title.className = "gm-standings-title";
    title.textContent = "A.L. EAST STANDINGS";
    panel.appendChild(title);

    const table = document.createElement("div");
    table.className = "gm-standings-table";

    const headerRow = document.createElement("div");
    headerRow.className = "gm-standings-row gm-standings-head";
    ["TEAM", "W", "L", "PCT", "GB"].forEach((h) => {
      const c = document.createElement("span");
      c.textContent = h;
      headerRow.appendChild(c);
    });
    table.appendChild(headerRow);

    if (!this.standings || this.standings.length === 0) {
      const row = document.createElement("div");
      row.className = "gm-standings-row";
      row.textContent = "LOADING STANDINGS\u2026";
      table.appendChild(row);
    } else {
      this.standings.forEach((team) => {
        const row = document.createElement("div");
        row.className = "gm-standings-row";
        if (this.config.favoriteTeam && team.abbreviation === this.config.favoriteTeam) {
          row.classList.add("is-favorite");
        }

        const gbRaw = team.gamesBack;
        const gb = gbRaw === "0.0" || gbRaw === "-" || gbRaw === undefined ? "--" : gbRaw;
        const pct = (team.pct || "").toString().replace(/^0/, "");

        [team.abbreviation, team.wins, team.losses, pct, gb].forEach((val) => {
          const c = document.createElement("span");
          c.textContent = val;
          row.appendChild(c);
        });

        table.appendChild(row);
      });
    }

    panel.appendChild(table);
    return panel;
  }
});
