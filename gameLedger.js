/**
 * Game-based head-to-head money ledger.
 *
 * Unlike scoring.js's computeHeadToHead (which proportionally redistributes
 * net profit/loss), this attributes GROSS winnings to the specific bidder
 * whose team was actually beaten — matching the real game-by-game results.
 *
 * Rules (as specified):
 * - Regular season: each win is worth a fixed dollar amount (the pool's
 *   regular-season share divided across all decided games). That amount
 *   transfers from the loser's bidder to the winner's bidder.
 * - Making the playoffs is worth the dollar value of the round a team FIRST
 *   entered at (wild_card normally, or divisional if they had a bye). That
 *   money doesn't come from a single opponent — it's spread evenly across
 *   the team's regular-season wins, topping up what was already transferred
 *   from each of those specific regular-season opponents.
 * - Each playoff win is worth the incremental dollar value between the round
 *   just reached and the round before it, taken directly from the specific
 *   opponent beaten in that game.
 * - If both teams in a game belong to the same bidder, no transfer happens
 *   for that game (their ROI still reflects it individually — this ledger
 *   just has no "other bidder" to attribute it to).
 */

const NEXT_TIER = {
  wild_card: "divisional",
  divisional: "conference",
  conference: "super_bowl",
  super_bowl: "won_super_bowl",
};

function addTransfer(matrix, winnerEntryId, loserEntryId, amount) {
  if (!winnerEntryId || !loserEntryId || winnerEntryId === loserEntryId) return;
  if (!matrix[winnerEntryId]) matrix[winnerEntryId] = {};
  if (!matrix[loserEntryId]) matrix[loserEntryId] = {};
  matrix[winnerEntryId][loserEntryId] = (matrix[winnerEntryId][loserEntryId] || 0) + amount;
  matrix[loserEntryId][winnerEntryId] = (matrix[loserEntryId][winnerEntryId] || 0) - amount;
}

/**
 * @param {Array<{seasonType: string, homeTeamCode: string, awayTeamCode: string, winnerTeamCode: string|null}>} games
 *   seasonType is one of 'regular','wild_card','divisional','conference','super_bowl'.
 *   winnerTeamCode is null for games not yet completed.
 * @param {Record<string, string>} teamCodeToEntryId — nfl_team_code -> owning entry id
 * @param {Record<string, string>} teamCodeToFurthestRound — nfl_team_code -> furthest_round tier
 * @param {object} roundWeights
 * @param {number} playoffPoolPct
 * @param {number} regularSeasonPoolPct
 * @param {number} jackpot
 * @param {number} totalDecidedGames
 * @returns {Record<string, Record<string, number>>} matrix[entryA][entryB] = amount A won from B
 */
export function computeGameBasedHeadToHead({
  games,
  teamCodeToEntryId,
  teamCodeToFurthestRound,
  roundWeights,
  playoffPoolPct,
  regularSeasonPoolPct,
  jackpot,
  totalDecidedGames,
}) {
  const matrix = {};
  for (const entryId of new Set(Object.values(teamCodeToEntryId))) {
    matrix[entryId] = matrix[entryId] || {};
  }

  const regularWinValue =
    totalDecidedGames > 0 ? (regularSeasonPoolPct * jackpot) / totalDecidedGames : 0;

  const totalPlayoffPoints = Object.values(teamCodeToFurthestRound).reduce(
    (sum, tier) => sum + (roundWeights[tier] ?? 0),
    0
  );
  const dollarsPerPoint =
    totalPlayoffPoints > 0 ? (playoffPoolPct * jackpot) / totalPlayoffPoints : 0;

  // Regular season: direct transfer per win, plus track each team's list of
  // beaten opponents (used below to spread playoff-berth money).
  const regularSeasonWinsByTeam = {}; // teamCode -> [beaten opponent codes]
  for (const game of games) {
    if (game.seasonType !== "regular" || !game.winnerTeamCode) continue;
    const loserCode =
      game.winnerTeamCode === game.homeTeamCode ? game.awayTeamCode : game.homeTeamCode;
    regularSeasonWinsByTeam[game.winnerTeamCode] =
      regularSeasonWinsByTeam[game.winnerTeamCode] || [];
    regularSeasonWinsByTeam[game.winnerTeamCode].push(loserCode);

    addTransfer(
      matrix,
      teamCodeToEntryId[game.winnerTeamCode],
      teamCodeToEntryId[loserCode],
      regularWinValue
    );
  }

  // Playoff berth money: spread across each team's regular-season wins.
  for (const [teamCode, furthestRound] of Object.entries(teamCodeToFurthestRound)) {
    if (furthestRound === "none" || furthestRound === "tbd") continue;

    const hasWildCardGame = games.some(
      (g) =>
        g.seasonType === "wild_card" &&
        (g.homeTeamCode === teamCode || g.awayTeamCode === teamCode)
    );
    const berthTier = hasWildCardGame ? "wild_card" : "divisional";
    const berthDollars = dollarsPerPoint * (roundWeights[berthTier] ?? 0);

    const wins = regularSeasonWinsByTeam[teamCode] || [];
    if (wins.length === 0 || berthDollars === 0) continue;
    const perWinShare = berthDollars / wins.length;
    for (const opponentCode of wins) {
      addTransfer(
        matrix,
        teamCodeToEntryId[teamCode],
        teamCodeToEntryId[opponentCode],
        perWinShare
      );
    }
  }

  // Playoff win increments: taken directly from the specific opponent beaten.
  for (const game of games) {
    const tier = game.seasonType;
    if (!NEXT_TIER[tier] || !game.winnerTeamCode) continue;
    const loserCode =
      game.winnerTeamCode === game.homeTeamCode ? game.awayTeamCode : game.homeTeamCode;
    const increment =
      dollarsPerPoint * ((roundWeights[NEXT_TIER[tier]] ?? 0) - (roundWeights[tier] ?? 0));
    addTransfer(
      matrix,
      teamCodeToEntryId[game.winnerTeamCode],
      teamCodeToEntryId[loserCode],
      increment
    );
  }

  return matrix;
}
