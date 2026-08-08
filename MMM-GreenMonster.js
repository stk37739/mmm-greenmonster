/* MMM-GreenMonster / MMM-GreenMonster.js
 *
 * A MagicMirror² module styled after Fenway Park's hand-operated Green
 * Monster scoreboard: a "FENWAY PARK" panel with the full inning-by-inning
 * linescore for one featured A.L. game (your favorite team's game if it's
 * on today, otherwise whichever A.L. game is live, otherwise the first
 * game of the day) plus an AT BAT / BALL / STRIKE / OUT / H / E light
 * strip; an "AMERICAN LEAGUE" out-of-town panel listing every other A.L.
 * team's pitcher / inning / runs; and an A.L. East standings board.
 *
 * The layout is static, the way the real wall is — nothing scrolls.
 * Only the specific digits that actually changed since the last refresh
 * play a brief flip animation, so the board sits calm and comes alive
 * right when something happens.
 *
 * Intended region: "bottom_bar" (spans full width — a good match for a
 * portrait-oriented mirror).
 */

Module.register("MMM-GreenMonster", {
  defaults: {
    updateInterval: 30 * 1000, // live linescore refresh
    standingsInterval: 5 * 60 * 1000, // standings refresh (changes slowly)
    favoriteTeam: null, // 3-letter abbreviation, e.g. "BOS" — featured in the Fenway panel when playing
    layout: "column", // "column" (stacked, good for portrait) or "row"
    showMascot: true, // small decorative pixel baseball that occasionally wanders across
    fadeSpeed: 500,
    timezone: "America/New_York", // which "today" to fetch — Fenway's, by default
    season: null // override season year if needed (e.g. for testing); defaults to current year
  },

  requiresVersion: "2.20.0",

  start() {
    this.games = [];
    this.featured = null;
    this.otherRows = [];
    this.standings = [];
    this.loaded = false;
    this._changed = new Set();
    this._prevFlat = {};
    this.sendSocketNotification("GM_INIT", this.config);
  },

  getStyles() {
    return ["MMM-GreenMonster.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "GM_GAMES") {
      const derived = this.computeDerived(payload.games);
      const flat = this.flattenValues(derived);
      this._changed = this.diffValues(this._prevFlat, flat);
      this._prevFlat = flat;

      this.games = payload.games;
      this.featured = derived.featured;
      this.otherRows = derived.otherRows;
      this.loaded = true;
      this.updateDom(this.config.fadeSpeed);
    } else if (notification === "GM_STANDINGS") {
      this.standings = payload.standings;
      this.updateDom(this.config.fadeSpeed);
    }
  },

  // ---------- data selection / diffing ----------

  selectFeaturedGame(games) {
    if (!games || games.length === 0) return null;

    if (this.config.favoriteTeam) {
      const favGame = games.find(
        (g) => g.awayAbbr === this.config.favoriteTeam || g.homeAbbr === this.config.favoriteTeam
      );
      if (favGame) return favGame;
    }

    const live = games.find((g) => g.status === "Live");
    if (live) return live;

    return games[0];
  },

  makeTeamRow(game, side) {
    const isAway = side === "away";
    return {
      abbr: isAway ? game.awayAbbr : game.homeAbbr,
      gamePk: game.gamePk,
      side,
      status: game.status,
      pitcherNumber: isAway ? game.awayPitcherNumber : game.homePitcherNumber,
      inningDisplay: this.formatInning(game),
      runs: isAway ? game.awayRuns : game.homeRuns
    };
  },

  formatInning(game) {
    if (game.status === "Final") return "F";
    if (game.status === "Preview") return game.startTime || "-";
    const half = game.inningState === "Top" ? "\u25B2" : game.inningState === "Bottom" ? "\u25BC" : "";
    return `${half}${game.inning != null ? game.inning : "-"}`;
  },

  computeDerived(games) {
    const featured = this.selectFeaturedGame(games);
    const otherRows = [];

    games.forEach((g) => {
      if (featured && g.gamePk === featured.gamePk) return; // don't repeat the featured game out-of-town
      if (g.awayIsAL) otherRows.push(this.makeTeamRow(g, "away"));
      if (g.homeIsAL) otherRows.push(this.makeTeamRow(g, "home"));
    });

    otherRows.sort((a, b) => a.abbr.localeCompare(b.abbr));

    return { featured, otherRows };
  },

  flattenValues(derived) {
    const flat = {};
    const f = derived.featured;

    if (f) {
      const maxInning = Math.max(10, f.innings.length);
      for (let i = 1; i <= maxInning; i++) {
        const inn = f.innings.find((x) => x.num === i);
        flat[`feat-inn-${i}-away`] = inn ? inn.away : null;
        flat[`feat-inn-${i}-home`] = inn ? inn.home : null;
      }
      flat["feat-runs-away"] = f.awayRuns;
      flat["feat-runs-home"] = f.homeRuns;
      flat["feat-hits-away"] = f.awayHits;
      flat["feat-hits-home"] = f.homeHits;
      flat["feat-errors-away"] = f.awayErrors;
      flat["feat-errors-home"] = f.homeErrors;
    }

    derived.otherRows.forEach((row) => {
      flat[`alrow-${row.gamePk}-${row.side}-R`] = row.runs;
    });

    return flat;
  },

  diffValues(oldFlat, newFlat) {
    const changed = new Set();
    Object.keys(newFlat).forEach((k) => {
      const oldVal = oldFlat ? oldFlat[k] : undefined;
      const newVal = newFlat[k];
      if (oldVal !== undefined && newVal !== null && newVal !== undefined && oldVal !== newVal) {
        changed.add(k);
      }
    });
    return changed;
  },

  // ---------- rendering ----------

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "gm-wrapper";

    const scanlines = document.createElement("div");
    scanlines.className = "gm-scanlines";
    wrapper.appendChild(scanlines);

    wrapper.appendChild(this.buildHeader());

    const body = document.createElement("div");
    body.className = `gm-body gm-layout-${this.config.layout === "row" ? "row" : "column"}`;
    body.appendChild(this.buildFenwayPanel());
    body.appendChild(this.buildAmericanLeaguePanel());
    body.appendChild(this.buildStandingsPanel());
    wrapper.appendChild(body);

    if (this.config.showMascot) {
      const mascot = document.createElement("div");
      mascot.className = "gm-mascot";
      wrapper.appendChild(mascot);
    }

    return wrapper;
  },

  buildHeader() {
    const header = document.createElement("div");
    header.className = "gm-header";

    const title = document.createElement("span");
    title.className = "gm-title";
    title.innerHTML = "FENWAY&nbsp;PARK&nbsp;&middot;&nbsp;<span class='gm-title-sub'>GREEN MONSTER</span>";
    header.appendChild(title);

    const isLive = this.featured && this.featured.status === "Live";
    const liveDot = document.createElement("span");
    liveDot.className = "gm-live-dot" + (isLive ? " on" : "");
    liveDot.textContent = isLive ? "\u25CF LIVE" : "";
    header.appendChild(liveDot);

    return header;
  },

  buildMessage(text) {
    const m = document.createElement("div");
    m.className = "gm-message";
    m.textContent = text;
    return m;
  },

  buildFenwayPanel() {
    const panel = document.createElement("div");
    panel.className = "gm-panel gm-fenway-panel";

    const title = document.createElement("div");
    title.className = "gm-panel-title";
    title.textContent = "FENWAY PARK";
    panel.appendChild(title);

    if (!this.loaded) {
      panel.appendChild(this.buildMessage("LOADING\u2026"));
      return panel;
    }

    if (!this.featured) {
      panel.appendChild(this.buildMessage("NO A.L. GAME TODAY"));
      return panel;
    }

    const g = this.featured;
    const maxInning = Math.max(10, g.innings.length);

    const grid = document.createElement("div");
    grid.className = "gm-linescore";
    grid.appendChild(this.buildLinescoreHeaderRow(maxInning));
    grid.appendChild(this.buildLinescoreTeamRow(g, "away", maxInning));
    grid.appendChild(this.buildLinescoreTeamRow(g, "home", maxInning));
    panel.appendChild(grid);

    panel.appendChild(this.buildLightStrip(g));

    return panel;
  },

  buildLinescoreHeaderRow(maxInning) {
    const row = document.createElement("div");
    row.className = "gm-linescore-row gm-linescore-head";

    const spacer = document.createElement("span");
    spacer.className = "gm-abbr";
    row.appendChild(spacer);

    const p = document.createElement("span");
    p.className = "gm-digit gm-head-cell";
    p.textContent = "P";
    row.appendChild(p);

    for (let i = 1; i <= maxInning; i++) {
      const c = document.createElement("span");
      c.className = "gm-digit gm-head-cell";
      c.textContent = String(i);
      row.appendChild(c);
    }

    ["R", "H", "E"].forEach((l) => {
      const c = document.createElement("span");
      c.className = "gm-digit gm-head-cell gm-rhe";
      c.textContent = l;
      row.appendChild(c);
    });

    return row;
  },

  buildLinescoreTeamRow(game, side, maxInning) {
    const isAway = side === "away";
    const row = document.createElement("div");
    row.className = "gm-linescore-row";

    const abbrText = isAway ? game.awayAbbr : game.homeAbbr;
    const abbr = document.createElement("span");
    abbr.className = "gm-abbr";
    abbr.textContent = abbrText;
    if (this.config.favoriteTeam && abbrText === this.config.favoriteTeam) abbr.classList.add("is-favorite");
    row.appendChild(abbr);

    const pitcherNum = isAway ? game.awayPitcherNumber : game.homePitcherNumber;
    const pCell = document.createElement("span");
    pCell.className = "gm-digit";
    if (pitcherNum) {
      pCell.textContent = pitcherNum;
    } else {
      pCell.classList.add("empty");
    }
    row.appendChild(pCell);

    for (let i = 1; i <= maxInning; i++) {
      const inn = game.innings.find((x) => x.num === i);
      const val = inn ? inn[side] : null;
      const digit = document.createElement("span");
      digit.className = "gm-digit";

      if (game.status === "Live" && game.inning === i) digit.classList.add("live");
      if (val === null || val === undefined) {
        digit.classList.add("empty");
      } else {
        digit.textContent = String(val);
      }

      if (this._changed.has(`feat-inn-${i}-${side}`)) digit.classList.add("gm-flip");
      row.appendChild(digit);
    }

    const rheValues = [
      [isAway ? game.awayRuns : game.homeRuns, `feat-runs-${side}`],
      [isAway ? game.awayHits : game.homeHits, `feat-hits-${side}`],
      [isAway ? game.awayErrors : game.homeErrors, `feat-errors-${side}`]
    ];
    rheValues.forEach(([val, key]) => {
      const c = document.createElement("span");
      c.className = "gm-digit gm-rhe";
      if (val === null || val === undefined) {
        c.classList.add("empty");
      } else {
        c.textContent = String(val);
      }
      if (this._changed.has(key)) c.classList.add("gm-flip");
      row.appendChild(c);
    });

    return row;
  },

  litArray(count, litCount) {
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(i < (litCount || 0));
    return arr;
  },

  buildLightItem(label, litStates, variant, round) {
    const item = document.createElement("span");
    item.className = "gm-ls-item";

    const text = document.createElement("span");
    text.className = "gm-ls-text";
    text.textContent = round ? `(${label})` : label;
    item.appendChild(text);

    litStates.forEach((lit) => {
      const dot = document.createElement("span");
      let cls = "gm-light";
      if (lit) cls += " on";
      if (variant === "strike") cls += " strike";
      if (variant === "flash") cls += " flash";
      dot.className = cls;
      item.appendChild(dot);
    });

    return item;
  },

  buildLightStrip(game) {
    const strip = document.createElement("div");
    strip.className = "gm-light-strip";

    const isLive = game.status === "Live";
    const atBatOn = isLive && (game.inningState === "Top" || game.inningState === "Bottom");

    strip.appendChild(this.buildLightItem("AT BAT", [atBatOn]));
    strip.appendChild(this.buildLightItem("BALL", this.litArray(3, game.balls)));
    strip.appendChild(this.buildLightItem("STRIKE", this.litArray(2, game.strikes), "strike"));
    strip.appendChild(this.buildLightItem("OUT", this.litArray(2, game.outs)));

    const hitFlash = this._changed.has("feat-hits-away") || this._changed.has("feat-hits-home");
    const errorFlash = this._changed.has("feat-errors-away") || this._changed.has("feat-errors-home");

    strip.appendChild(this.buildLightItem("H", [hitFlash], "flash", true));
    strip.appendChild(this.buildLightItem("E", [errorFlash], "flash", true));

    return strip;
  },

  buildAmericanLeaguePanel() {
    const panel = document.createElement("div");
    panel.className = "gm-panel gm-al-panel";

    const title = document.createElement("div");
    title.className = "gm-panel-title";
    title.textContent = "AMERICAN LEAGUE";
    panel.appendChild(title);

    if (!this.loaded) {
      panel.appendChild(this.buildMessage("LOADING\u2026"));
      return panel;
    }

    if (!this.otherRows || this.otherRows.length === 0) {
      panel.appendChild(this.buildMessage("NO OTHER A.L. GAMES"));
      return panel;
    }

    const header = document.createElement("div");
    header.className = "gm-al-row gm-al-head";

    const teamHeader = document.createElement("span");
    teamHeader.className = "gm-al-abbr";
    teamHeader.textContent = "TEAM";
    header.appendChild(teamHeader);

    ["P", "IN", "R"].forEach((h) => {
      const c = document.createElement("span");
      c.className = "gm-digit gm-head-cell";
      c.textContent = h;
      header.appendChild(c);
    });
    panel.appendChild(header);

    this.otherRows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "gm-al-row";
      if (this.config.favoriteTeam && row.abbr === this.config.favoriteTeam) rowEl.classList.add("is-favorite");

      const abbr = document.createElement("span");
      abbr.className = "gm-al-abbr";
      abbr.textContent = row.abbr;
      rowEl.appendChild(abbr);

      const p = document.createElement("span");
      p.className = "gm-digit";
      if (row.pitcherNumber) {
        p.textContent = row.pitcherNumber;
      } else {
        p.classList.add("empty");
      }
      rowEl.appendChild(p);

      const inn = document.createElement("span");
      inn.className = "gm-digit gm-inn-cell";
      inn.textContent = row.inningDisplay || "-";
      rowEl.appendChild(inn);

      const r = document.createElement("span");
      r.className = "gm-digit gm-rhe";
      if (row.runs === null || row.runs === undefined) {
        r.classList.add("empty");
      } else {
        r.textContent = String(row.runs);
      }
      if (this._changed.has(`alrow-${row.gamePk}-${row.side}-R`)) r.classList.add("gm-flip");
      rowEl.appendChild(r);

      panel.appendChild(rowEl);
    });

    return panel;
  },

  buildStandingsPanel() {
    const panel = document.createElement("div");
    panel.className = "gm-panel gm-standings";

    const title = document.createElement("div");
    title.className = "gm-panel-title";
    title.textContent = "A.L. EAST STANDINGS";
    panel.appendChild(title);

    const table = document.createElement("div");
    table.className = "gm-standings-table";

    const standingsCols = ["gm-col-team", "gm-col-w", "gm-col-l", "gm-col-pct", "gm-col-gb"];

    const headerRow = document.createElement("div");
    headerRow.className = "gm-standings-row gm-standings-head";
    ["TEAM", "W", "L", "PCT", "GB"].forEach((h, idx) => {
      const c = document.createElement("span");
      c.className = standingsCols[idx];
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

        [team.abbreviation, team.wins, team.losses, pct, gb].forEach((val, idx) => {
          const c = document.createElement("span");
          c.className = standingsCols[idx];
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
