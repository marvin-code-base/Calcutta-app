import { describe, it, expect } from "vitest";
import { incrementAt, minimumNextBid, isValidBid } from "./auctionRules.js";

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
