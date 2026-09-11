import { describe, it, expect } from "vitest";
import { computeGameBasedHeadToHead } from "./gameLedger.js";

const roundWeights = {
  none: 0,
  tbd: 0,
  wild_card: 1,
  divisional: 2,
  conference: 4,
  super_bowl: 8,
  won_super_bowl: 16,
};

describe("computeGameBasedHeadToHead — regular season", () => {
  it("transfers a fixed per-win value from loser's bidder to winner's bidder", () => {
    const games = [{ seasonType: "regular", homeTeamCode: "A", awayTeamCode: "B", winnerTeamCode: "A" }];
    const teamCodeToEntryId = { A: "e1", B: "e2" };
    const teamCodeToFurthestRound = { A: "none", B: "none" };

    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId,
      teamCodeToFurthestRound,
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 272, // makes the math trivial: 0.35*272/272 = 0.35 per win
      totalDecidedGames: 272,
    });

    expect(matrix.e1.e2).toBeCloseTo(0.35, 5);
    expect(matrix.e2.e1).toBeCloseTo(-0.35, 5);
  });

  it("does not record a transfer when both teams share the same bidder", () => {
    const games = [{ seasonType: "regular", homeTeamCode: "A", awayTeamCode: "B", winnerTeamCode: "A" }];
    const teamCodeToEntryId = { A: "e1", B: "e1" }; // same bidder owns both

    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId,
      teamCodeToFurthestRound: { A: "none", B: "none" },
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 272,
      totalDecidedGames: 272,
    });

    expect(matrix.e1.e1).toBeUndefined();
    expect(Object.keys(matrix.e1)).toHaveLength(0);
  });

  it("ignores games with no winner yet (not completed)", () => {
    const games = [{ seasonType: "regular", homeTeamCode: "A", awayTeamCode: "B", winnerTeamCode: null }];
    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId: { A: "e1", B: "e2" },
      teamCodeToFurthestRound: { A: "none", B: "none" },
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 272,
      totalDecidedGames: 272,
    });
    expect(matrix.e1?.e2).toBeUndefined();
  });
});

describe("computeGameBasedHeadToHead — playoff berth money", () => {
  it("spreads a non-bye team's wild_card berth money evenly across its regular-season wins", () => {
    // Team A beats B and C in the regular season, then loses in the wild card round to D.
    const games = [
      { seasonType: "regular", homeTeamCode: "A", awayTeamCode: "B", winnerTeamCode: "A" },
      { seasonType: "regular", homeTeamCode: "A", awayTeamCode: "C", winnerTeamCode: "A" },
      { seasonType: "wild_card", homeTeamCode: "D", awayTeamCode: "A", winnerTeamCode: "D" },
    ];
    const teamCodeToEntryId = { A: "eA", B: "eB", C: "eC", D: "eD" };
    const teamCodeToFurthestRound = { A: "wild_card", B: "none", C: "none", D: "divisional" };

    // Use a jackpot/weights setup where the math is clean:
    // totalPlayoffPoints = wild_card(1) + divisional(2) = 3
    // playoffPoolPct*jackpot = 0.65 * 300 = 195 -> dollarsPerPoint = 65
    // A's berth (wild_card, 1 point) = 65 dollars, spread across 2 wins = 32.5 each
    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId,
      teamCodeToFurthestRound,
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 300,
      totalDecidedGames: 272,
    });

    const regularWinValue = (0.35 * 300) / 272;
    expect(matrix.eA.eB).toBeCloseTo(regularWinValue + 32.5, 4);
    expect(matrix.eA.eC).toBeCloseTo(regularWinValue + 32.5, 4);
  });

  it("credits a bye team's berth at the divisional tier instead of wild_card, with no wild_card game", () => {
    // Team A has a bye (no wild_card game), beats one regular-season opponent B,
    // then loses in the divisional round to D.
    const games = [
      { seasonType: "regular", homeTeamCode: "A", awayTeamCode: "B", winnerTeamCode: "A" },
      { seasonType: "divisional", homeTeamCode: "A", awayTeamCode: "D", winnerTeamCode: "D" },
    ];
    const teamCodeToEntryId = { A: "eA", B: "eB", D: "eD" };
    const teamCodeToFurthestRound = { A: "divisional", B: "none", D: "conference" };

    // totalPlayoffPoints = divisional(2) + conference(4) = 6
    // playoffPoolPct*jackpot = 0.65*600 = 390 -> dollarsPerPoint = 65
    // A's berth (divisional, 2 points) = 130 dollars, spread across 1 win = 130
    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId,
      teamCodeToFurthestRound,
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 600,
      totalDecidedGames: 272,
    });

    const regularWinValue = (0.35 * 600) / 272;
    expect(matrix.eA.eB).toBeCloseTo(regularWinValue + 130, 4);
  });
});

describe("computeGameBasedHeadToHead — playoff win increments", () => {
  it("takes the round-to-round increment directly from the specific opponent beaten", () => {
    // A beats X in the wild card round, advancing from wild_card(1) to divisional(2).
    const games = [
      { seasonType: "wild_card", homeTeamCode: "A", awayTeamCode: "X", winnerTeamCode: "A" },
    ];
    const teamCodeToEntryId = { A: "eA", X: "eX" };
    const teamCodeToFurthestRound = { A: "divisional", X: "wild_card" };

    // totalPlayoffPoints = divisional(2) + wild_card(1) = 3
    // playoffPoolPct*jackpot = 0.65*300=195 -> dollarsPerPoint=65
    // increment = 65 * (divisional(2) - wild_card(1)) = 65
    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId,
      teamCodeToFurthestRound,
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 300,
      totalDecidedGames: 272,
    });

    expect(matrix.eA.eX).toBeCloseTo(65, 4);
    expect(matrix.eX.eA).toBeCloseTo(-65, 4);
  });

  it("does not attribute a playoff win increment when the same bidder owns both teams", () => {
    const games = [
      { seasonType: "conference", homeTeamCode: "A", awayTeamCode: "X", winnerTeamCode: "A" },
    ];
    const matrix = computeGameBasedHeadToHead({
      games,
      teamCodeToEntryId: { A: "e1", X: "e1" },
      teamCodeToFurthestRound: { A: "super_bowl", X: "conference" },
      roundWeights,
      playoffPoolPct: 0.65,
      regularSeasonPoolPct: 0.35,
      jackpot: 300,
      totalDecidedGames: 272,
    });
    expect(Object.keys(matrix.e1)).toHaveLength(0);
  });
});
