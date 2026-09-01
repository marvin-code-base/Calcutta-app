import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  computePlayoffShares,
  computeRegularSeasonShares,
  computeEntryPayout,
  validateConfig,
} from "./scoring.js";

describe("validateConfig", () => {
  it("accepts the default config", () => {
    expect(validateConfig(DEFAULT_CONFIG)).toBe(true);
  });

  it("rejects pool percentages that don't sum to 1", () => {
    const bad = { ...DEFAULT_CONFIG, regularSeasonPoolPct: 0.5 };
    expect(() => validateConfig(bad)).toThrow(/sum to 1/);
  });
});

describe("computeRegularSeasonShares", () => {
  it("matches the worked example: 58 wins / 271 decided games ≈ 21.4%", () => {
    const teams = [{ id: "teamA", wins: 58 }];
    const shares = computeRegularSeasonShares(teams, 271);
    expect(shares.teamA).toBeCloseTo(58 / 271, 5);
  });
});

describe("computePlayoffShares — bye vs. wild-card-win equalization", () => {
  it("gives identical points to a bye team and a Wild Card winner once both reach Divisional", () => {
    const teams = [
      { id: "byeTeam", furthestRound: "divisional" }, // had a bye
      { id: "wcWinner", furthestRound: "divisional" }, // won Wild Card game
    ];
    const points = teams.map((t) =>
      DEFAULT_CONFIG.roundWeights[t.furthestRound]
    );
    expect(points[0]).toBe(points[1]);

    const shares = computePlayoffShares(teams, DEFAULT_CONFIG.roundWeights);
    expect(shares.byeTeam).toBeCloseTo(shares.wcWinner, 10);
  });

  it("teams that missed the playoffs get a 0 share", () => {
    const teams = [
      { id: "missed", furthestRound: "none" },
      { id: "champ", furthestRound: "won_super_bowl" },
    ];
    const shares = computePlayoffShares(teams, DEFAULT_CONFIG.roundWeights);
    expect(shares.missed).toBe(0);
    expect(shares.champ).toBe(1);
  });
});

describe("computeEntryPayout", () => {
  it("combines regular-season and playoff pools correctly", () => {
    const config = DEFAULT_CONFIG;
    const jackpot = 10000;
    const entry = { teamIds: ["teamA"] };
    const playoffShares = { teamA: 0.5 }; // owns 50% of playoff points
    const regularSeasonShares = { teamA: 0.2 }; // owns 20% of decided games

    const result = computeEntryPayout(
      entry,
      playoffShares,
      regularSeasonShares,
      config,
      jackpot
    );

    expect(result.playoffPayout).toBeCloseTo(0.5 * 0.65 * 10000, 5); // 3250
    expect(result.regularSeasonPayout).toBeCloseTo(0.2 * 0.35 * 10000, 5); // 700
    expect(result.totalPayout).toBeCloseTo(3950, 5);
  });
});
