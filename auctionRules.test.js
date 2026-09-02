import { describe, it, expect } from "vitest";
import { incrementAt, minimumNextBid, isValidBid, secondsRemaining, computeDeadline, isWithinBidCap } from "./auctionRules.js";

const rules = [
  { threshold: 0, increment: 1 },
  { threshold: 20, increment: 5 },
  { threshold: 100, increment: 10 },
];

describe("incrementAt", () => {
  it("uses the base increment below the first threshold", () => {
    expect(incrementAt(5, rules)).toBe(1);
  });
  it("switches increment exactly at a threshold", () => {
    expect(incrementAt(20, rules)).toBe(5);
    expect(incrementAt(19, rules)).toBe(1);
  });
  it("uses the top increment above the highest threshold", () => {
    expect(incrementAt(150, rules)).toBe(10);
  });
});

describe("minimumNextBid", () => {
  it("returns the starting bid when there's no current bid", () => {
    expect(minimumNextBid(null, 10, rules)).toBe(10);
  });
  it("adds the applicable increment to the current bid", () => {
    expect(minimumNextBid(18, 10, rules)).toBe(19); // still under 20 -> +1
    expect(minimumNextBid(20, 10, rules)).toBe(25); // at 20 -> +5
  });
});

describe("isValidBid", () => {
  it("rejects a bid below the minimum", () => {
    expect(isValidBid(18, 18, 10, rules)).toBe(false);
  });
  it("accepts a bid at or above the minimum", () => {
    expect(isValidBid(19, 18, 10, rules)).toBe(true);
    expect(isValidBid(25, 18, 10, rules)).toBe(true);
  });
});

describe("secondsRemaining", () => {
  it("returns null when there's no deadline", () => {
    expect(secondsRemaining(null, new Date())).toBe(null);
  });
  it("counts down toward zero", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const deadline = new Date("2026-01-01T00:00:20Z").toISOString();
    expect(secondsRemaining(deadline, now)).toBe(20);
  });
  it("floors at zero once the deadline has passed", () => {
    const now = new Date("2026-01-01T00:01:00Z");
    const deadline = new Date("2026-01-01T00:00:20Z").toISOString();
    expect(secondsRemaining(deadline, now)).toBe(0);
  });
});

describe("computeDeadline", () => {
  it("adds the timeout in seconds to the given time", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(computeDeadline(30, from)).toBe("2026-01-01T00:00:30.000Z");
  });
});

describe("isWithinBidCap", () => {
  it("allows anything when there's no cap", () => {
    expect(isWithinBidCap(500, 100, null)).toBe(true);
    expect(isWithinBidCap(500, 100, undefined)).toBe(true);
    expect(isWithinBidCap(500, 100, "")).toBe(true);
  });
  it("blocks a bid that would push total spend over the cap", () => {
    expect(isWithinBidCap(80, 30, 100)).toBe(false);
  });
  it("allows a bid that lands exactly at the cap", () => {
    expect(isWithinBidCap(70, 30, 100)).toBe(true);
  });
});
