/* MMM-GreenMonster / MMM-GreenMonster.js
 *
 * A MagicMirror² module modeled on Fenway Park's hand-operated Green
 * Monster scoreboard: one panel showing the full inning-by-inning
 * linescore (plus pitcher number and an AT BAT / BALL / STRIKE / OUT /
 * H / E light strip) for one featured A.L. game — your favorite team's
 * game if it's on today, otherwise whichever A.L. game is live,
 * otherwise the first game of the day — with the A.L. East standings
 * board built into the same panel underneath.
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
    favoriteTeam: null, // 3-letter abbreviation, e.g. "BOS" — featured in the panel when playing
    fadeSpeed: 500,
    timezone: "America/New_York", // which "today" to fetch — Fenway's, by default
    season: null // override season year if needed (e.g. for testing); defaults to current year
  },

  requiresVersion: "2.20.0",

  start() {
    this.games = [];
    this.featured = null;
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
      const featured = this.selectFeaturedGame(payload.games);
      const flat = this.flattenValues(featured);
      this._changed = this.diffValues(this._prevFlat, flat);
      this._prevFlat = flat;

      this.games = payload.games;
      this.featured = featured;
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

  formatInning(game) {
    if (game.status === "Final") return "F";
    if (game.status === "Preview") return game.startTime || "-";
    const half = game.inningState === "Top" ? "\u25B2" : game.inningState === "Bottom" ? "\u25BC" : "";
    return `${half}${game.inning != null ? game.inning : "-"}`;
  },

  flattenValues(featured) {
    const flat = {};
    if (!featured) return flat;

    const maxInning = Math.max(10, featured.innings.length);
    for (let i = 1; i <= maxInning; i++) {
      const inn = featured.innings.find((x) => x.num === i);
      flat[`feat-inn-${i}-away`] = inn ? inn.away : null;
      flat[`feat-inn-${i}-home`] = inn ? inn.home : null;
    }
    flat["feat-runs-away"] = featured.awayRuns;
    flat["feat-runs-home"] = featured.homeRuns;
    flat["feat-hits-away"] = featured.awayHits;
    flat["feat-hits-home"] = featured.homeHits;
    flat["feat-errors-away"] = featured.awayErrors;
    flat["feat-errors-home"] = featured.homeErrors;

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

    wrapper.appendChild(this.buildHeader());

    const body = document.createElement("div");
    body.className = "gm-body";
    body.appendChild(this.buildMergedPanel());
    wrapper.appendChild(body);

    return wrapper;
  },

  buildHeader() {
    const header = document.createElement("div");
    header.className = "gm-header";

    const title = document.createElement("span");
    title.className = "gm-title";
    title.innerHTML = "FENWAY PARK <span class='gm-title-sub'>GREEN MONSTER</span>";
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

  buildMergedPanel() {
    const panel = document.createElement("div");
    panel.className = "gm-panel";

    const row = document.createElement("div");
    row.className = "gm-panel-row";

    const leftCol = document.createElement("div");
    leftCol.className = "gm-col-linescore";

    if (!this.loaded) {
      leftCol.appendChild(this.buildMessage("LOADING\u2026"));
    } else if (!this.featured) {
      leftCol.appendChild(this.buildMessage("NO A.L. GAME TODAY"));
    } else {
      const g = this.featured;
      const maxInning = Math.max(10, g.innings.length);

      const grid = document.createElement("div");
      grid.className = "gm-linescore";
      grid.appendChild(this.buildLinescoreHeaderRow(maxInning));
      grid.appendChild(this.buildLinescoreTeamRow(g, "away", maxInning));
      grid.appendChild(this.buildLinescoreTeamRow(g, "home", maxInning));
      leftCol.appendChild(grid);

      leftCol.appendChild(this.buildLightStrip(g));
    }

    const divider = document.createElement("div");
    divider.className = "gm-vdivider";

    const rightCol = document.createElement("div");
    rightCol.className = "gm-col-standings";

    const standingsTitle = document.createElement("div");
    standingsTitle.className = "gm-section-title";
    standingsTitle.textContent = "A.L. EAST STANDINGS";
    rightCol.appendChild(standingsTitle);
    rightCol.appendChild(this.buildStandingsTable());

    row.appendChild(leftCol);
    row.appendChild(divider);
    row.appendChild(rightCol);
    panel.appendChild(row);

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

  buildStandingsTable() {
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

    return table;
  }
});
