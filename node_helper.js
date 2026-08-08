/* MMM-GreenMonster / node_helper.js
 *
 * Talks to the (unofficial, public) MLB Stats API, normalizes the data,
 * and pushes it up to the front-end module via socket notifications.
 *
 * Endpoints used:
 *   GET /api/v1/teams?sportId=1
 *       -> cached once per boot: team id -> {abbreviation, name, leagueId}
 *   GET /api/v1/schedule?sportId=1&date=YYYY-MM-DD&hydrate=linescore,team,probablePitcher
 *       -> today's games incl. inning-by-inning linescore, B/S/O, probable pitchers
 *   GET /api/v1/people?personIds=ID1,ID2,...
 *       -> batch lookup of jersey numbers for probable pitchers (cached by id)
 *   GET /api/v1/standings?leagueId=103&season=YYYY&standingsTypes=regularSeason
 *       -> AL standings, filtered down to the AL East division
 */

const NodeHelper = require("node_helper");

// Node 18+ ships a global fetch. Fall back to node-fetch for older installs.
let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    console.error(
      "[MMM-GreenMonster] No global fetch found and node-fetch isn't installed. " +
        "Run 'npm install node-fetch@2' inside the MMM-GreenMonster folder, or upgrade to Node 18+."
    );
  }
}

const AL_LEAGUE_ID = 103;
const AL_EAST_DIVISION_ID = 201;

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.teamsCache = null;
    this.pitcherNumberCache = {}; // personId -> jersey number string
    this.gamesTimer = null;
    this.standingsTimer = null;
    console.log("[MMM-GreenMonster] node_helper started");
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "GM_INIT") {
      this.config = payload;
      this.init();
    }
  },

  async init() {
    await this.loadTeams();
    this.updateGames();
    this.updateStandings();

    if (this.gamesTimer) clearInterval(this.gamesTimer);
    if (this.standingsTimer) clearInterval(this.standingsTimer);

    this.gamesTimer = setInterval(() => this.updateGames(), this.config.updateInterval);
    this.standingsTimer = setInterval(() => this.updateStandings(), this.config.standingsInterval);
  },

  async fetchJSON(url) {
    if (!fetchFn) throw new Error("fetch is unavailable");
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  },

  async loadTeams() {
    try {
      const data = await this.fetchJSON("https://statsapi.mlb.com/api/v1/teams?sportId=1");
      const map = {};
      (data.teams || []).forEach((t) => {
        map[t.id] = {
          abbreviation: t.abbreviation,
          name: t.teamName || t.name,
          leagueId: t.league ? t.league.id : null
        };
      });
      this.teamsCache = map;
    } catch (e) {
      console.error("[MMM-GreenMonster] Failed to load team list:", e.message);
      this.teamsCache = this.teamsCache || {};
    }
  },

  // Bucket "today" using the mirror's configured timezone (defaults to Fenway's).
  todayISO() {
    const tz = (this.config && this.config.timezone) || "America/New_York";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  },

  formatStartTime(isoString) {
    const tz = (this.config && this.config.timezone) || "America/New_York";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(isoString));
    } catch (e) {
      return "-";
    }
  },

  async updateGames() {
    if (!this.teamsCache) await this.loadTeams();

    const date = this.todayISO();
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore,team,probablePitcher`;

    try {
      const data = await this.fetchJSON(url);
      const rawGames = (data.dates && data.dates[0] && data.dates[0].games) || [];

      let games = rawGames
        .map((g) => this.normalizeGame(g))
        .filter((g) => g.awayIsAL || g.homeIsAL); // AL team involved, same rule the real wall uses

      await this.ensurePitcherNumbers(games);

      games = games.map((g) => ({
        ...g,
        awayPitcherNumber: g.awayProbablePitcherId
          ? this.pitcherNumberCache[g.awayProbablePitcherId] || null
          : null,
        homePitcherNumber: g.homeProbablePitcherId
          ? this.pitcherNumberCache[g.homeProbablePitcherId] || null
          : null
      }));

      this.sendSocketNotification("GM_GAMES", { games, date });
    } catch (e) {
      console.error("[MMM-GreenMonster] updateGames failed:", e.message);
    }
  },

  normalizeGame(g) {
    const awayTeam = g.teams.away.team;
    const homeTeam = g.teams.home.team;
    const awayInfo = this.teamsCache[awayTeam.id] || {};
    const homeInfo = this.teamsCache[homeTeam.id] || {};
    const ls = g.linescore || {};
    const lsTeams = ls.teams || {};
    const awayProbable = g.teams.away.probablePitcher;
    const homeProbable = g.teams.home.probablePitcher;

    const innings = (ls.innings || []).map((inn) => ({
      num: inn.num,
      away: inn.away && typeof inn.away.runs === "number" ? inn.away.runs : null,
      home: inn.home && typeof inn.home.runs === "number" ? inn.home.runs : null
    }));

    return {
      gamePk: g.gamePk,
      status: g.status.abstractGameState, // "Preview" | "Live" | "Final"
      detailedState: g.status.detailedState,
      startTime: this.formatStartTime(g.gameDate),
      awayAbbr: awayInfo.abbreviation || awayTeam.abbreviation || "???",
      homeAbbr: homeInfo.abbreviation || homeTeam.abbreviation || "???",
      awayIsAL: awayInfo.leagueId === AL_LEAGUE_ID,
      homeIsAL: homeInfo.leagueId === AL_LEAGUE_ID,
      inning: ls.currentInning || null,
      inningState: ls.inningState || null,
      balls: typeof ls.balls === "number" ? ls.balls : null,
      strikes: typeof ls.strikes === "number" ? ls.strikes : null,
      outs: typeof ls.outs === "number" ? ls.outs : null,
      innings,
      awayRuns: lsTeams.away ? lsTeams.away.runs : null,
      awayHits: lsTeams.away ? lsTeams.away.hits : null,
      awayErrors: lsTeams.away ? lsTeams.away.errors : null,
      homeRuns: lsTeams.home ? lsTeams.home.runs : null,
      homeHits: lsTeams.home ? lsTeams.home.hits : null,
      homeErrors: lsTeams.home ? lsTeams.home.errors : null,
      awayProbablePitcherId: awayProbable ? awayProbable.id : null,
      awayProbablePitcherName: awayProbable ? awayProbable.fullName : null,
      homeProbablePitcherId: homeProbable ? homeProbable.id : null,
      homeProbablePitcherName: homeProbable ? homeProbable.fullName : null
    };
  },

  // Jersey numbers aren't in the schedule payload, so batch-fetch any we
  // haven't seen yet and cache them (numbers don't change mid-season).
  async ensurePitcherNumbers(games) {
    const missing = new Set();
    games.forEach((g) => {
      if (g.awayProbablePitcherId && !(g.awayProbablePitcherId in this.pitcherNumberCache)) {
        missing.add(g.awayProbablePitcherId);
      }
      if (g.homeProbablePitcherId && !(g.homeProbablePitcherId in this.pitcherNumberCache)) {
        missing.add(g.homeProbablePitcherId);
      }
    });

    if (missing.size === 0) return;

    try {
      const ids = [...missing].join(",");
      const data = await this.fetchJSON(`https://statsapi.mlb.com/api/v1/people?personIds=${ids}`);
      (data.people || []).forEach((p) => {
        this.pitcherNumberCache[p.id] = p.primaryNumber || null;
      });
    } catch (e) {
      console.error("[MMM-GreenMonster] Failed to load pitcher numbers:", e.message);
    }
  },

  async updateStandings() {
    if (!this.teamsCache) await this.loadTeams();

    const season = (this.config && this.config.season) || new Date().getFullYear();
    const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=${AL_LEAGUE_ID}&season=${season}&standingsTypes=regularSeason`;

    try {
      const data = await this.fetchJSON(url);
      const records = data.records || [];
      const alEast = records.find(
        (r) => r.division && (r.division.id === AL_EAST_DIVISION_ID || /east/i.test(r.division.name || ""))
      );

      const rows = alEast
        ? alEast.teamRecords
            .map((tr) => {
              const info = this.teamsCache[tr.team.id] || {};
              return {
                teamId: tr.team.id,
                abbreviation: info.abbreviation || "???",
                name: info.name || tr.team.name,
                wins: tr.wins,
                losses: tr.losses,
                pct: tr.winningPercentage,
                gamesBack: tr.gamesBack,
                rank: Number(tr.divisionRank)
              };
            })
            .sort((a, b) => a.rank - b.rank)
        : [];

      this.sendSocketNotification("GM_STANDINGS", { standings: rows });
    } catch (e) {
      console.error("[MMM-GreenMonster] updateStandings failed:", e.message);
    }
  }
});
