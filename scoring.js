/**
 * Calcutta scoring engine.
 *
 * All functions here are pure (no I/O, no DB calls) so they're easy to unit
 * test and easy to reuse if the app is ever wrapped as a native shell later.
 * The data-access layer (supabaseClient.js) is responsible for fetching the
 * raw team/entry/config rows and handing them to these functions.
 */

// Ordered furthest-round-reached tiers. A team's playoff points are looked
// up by whichever of these they most recently reached — never summed
// per-win — so a first-round-bye team and a team that won a Wild Card game
// land on identical points once both reach the Divisional round.
export const ROUND_TIERS = [
  "none", // did not make the playoffs — always 0 points
  "wild_card", // played and lost the Wild Card round
  "divisional", // reached Divisional round (bye, or won Wild Card)
  "conference", // reached Conference Championship
  "super_bowl", // reached the Super Bowl
  "won_super_bowl", // won the Super Bowl
];

// Default weights — every league can override these up until bidding locks.
export const DEFAULT_CONFIG = {
  regularSeasonPoolPct: 0.35,
  playoffPoolPct: 0.65,
  roundWeights: {
    none: 0,
    wild_card: 1,
    divisional: 2,
    conference: 4,
    super_bowl: 8,
    won_super_bowl: 16,
  },
  locked: false, // flips true once bidding opens; UI should block edits after
};

/**
 * Validate a config object's shape before it's saved or used in a calc.
 * Throws with a descriptive message rather than failing silently.
 */
export function validateConfig(config) {
  const pct = config.regularSeasonPoolPct + config.playoffPoolPct;
  if (Math.abs(pct - 1) > 0.001) {
    throw new Error(
      `regularSeasonPoolPct + playoffPoolPct must sum to 1 (got ${pct})`
    );
  }
  for (const tier of ROUND_TIERS) {
    if (typeof config.roundWeights[tier] !== "number") {
      throw new Error(`Missing weight for round tier "${tier}"`);
    }
  }
  return true;
}

/**
 * Points for a single team, based on the furthest playoff round they reached.
 * @param {{furthestRound: string}} team
 * @param {object} roundWeights
 */
export function teamPlayoffPoints(team, roundWeights) {
  const weight = roundWeights[team.furthestRound];
  if (weight === undefined) {
    throw new Error(`Unknown furthestRound "${team.furthestRound}"`);
  }
  return weight;
}

/**
 * Each team's share of the playoff pool (0–1), keyed by team id.
 * Teams that missed the playoffs get 0. If no team has scored yet
 * (early in the postseason), every share is 0 rather than dividing by zero.
 * @param {Array<{id: string, furthestRound: string}>} teams
 * @param {object} roundWeights
 * @returns {Record<string, number>}
 */
export function computePlayoffShares(teams, roundWeights) {
  const points = Object.fromEntries(
    teams.map((t) => [t.id, teamPlayoffPoints(t, roundWeights)])
  );
  const total = Object.values(points).reduce((sum, p) => sum + p, 0);
  const shares = {};
  for (const team of teams) {
    shares[team.id] = total > 0 ? points[team.id] / total : 0;
  }
  return shares;
}

/**
 * Each team's share of the regular-season pool (0–1), keyed by team id.
 * Share = team's wins ÷ (total league-wide games decided this season, i.e.
 * excluding ties). The denominator is the same fixed number for every team.
 * @param {Array<{id: string, wins: number}>} teams
 * @param {number} totalDecidedGames league-wide games played minus ties
 */
export function computeRegularSeasonShares(teams, totalDecidedGames) {
  if (totalDecidedGames <= 0) {
    throw new Error("totalDecidedGames must be > 0");
  }
  const shares = {};
  for (const team of teams) {
    shares[team.id] = team.wins / totalDecidedGames;
  }
  return shares;
}

/**
 * Full payout for one entry (a bidder's collection of owned teams).
 * Combines their share of the regular-season pool and the playoff pool.
 *
 * @param {{teamIds: string[]}} entry
 * @param {Record<string, number>} playoffShares from computePlayoffShares
 * @param {Record<string, number>} regularSeasonShares from computeRegularSeasonShares
 * @param {object} config league config (pool percentages)
 * @param {number} jackpot total pot size in dollars
 */
export function computeEntryPayout(
  entry,
  playoffShares,
  regularSeasonShares,
  config,
  jackpot
) {
  let playoffShare = 0;
  let regularSeasonShare = 0;
  for (const teamId of entry.teamIds) {
    playoffShare += playoffShares[teamId] ?? 0;
    regularSeasonShare += regularSeasonShares[teamId] ?? 0;
  }
  const playoffPayout = playoffShare * config.playoffPoolPct * jackpot;
  const regularSeasonPayout =
    regularSeasonShare * config.regularSeasonPoolPct * jackpot;
  return {
    playoffPayout,
    regularSeasonPayout,
    totalPayout: playoffPayout + regularSeasonPayout,
  };
}

/**
 * ROI for a single team relative to what an entry paid for it — "how much
 * of their bid have they won back", per the spec. Requires the per-team
 * bid amount since payout is computed at the entry level above; this
 * splits an entry's total payout back out proportional to each team's
 * contribution to that payout, then compares it to what was paid for
 * that specific team.
 *
 * @param {{teamId: string, bidAmount: number}} bid
 * @param {number} teamPlayoffShare this team's individual playoff share
 * @param {number} teamRegularSeasonShare this team's individual reg-season share
 * @param {object} config
 * @param {number} jackpot
 */
export function computeTeamRoi(
  bid,
  teamPlayoffShare,
  teamRegularSeasonShare,
  config,
  jackpot
) {
  const wonBack =
    teamPlayoffShare * config.playoffPoolPct * jackpot +
    teamRegularSeasonShare * config.regularSeasonPoolPct * jackpot;
  const roiPct = bid.bidAmount > 0 ? wonBack / bid.bidAmount : 0;
  return { wonBack, roiPct };
}
