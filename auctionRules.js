/**
 * Auction bidding rules. Pure functions, no I/O — same philosophy as
 * scoring.js. incrementRules is an array of { threshold, increment },
 * sorted ascending by threshold. The applicable increment for a given
 * current bid is the increment of the highest threshold <= currentBid.
 *
 * Example: [{threshold:0, increment:1}, {threshold:20, increment:5}]
 * means: below $20, bids go up by $1; at $20 and above, by $5.
 */

export function validateIncrementRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error("incrementRules must be a non-empty array");
  }
  if (rules[0].threshold !== 0) {
    throw new Error("First increment rule must start at threshold 0");
  }
  for (const r of rules) {
    if (typeof r.threshold !== "number" || typeof r.increment !== "number" || r.increment <= 0) {
      throw new Error("Each rule needs a numeric threshold and a positive increment");
    }
  }
  return true;
}

/**
 * The increment that applies at a given bid level.
 */
export function incrementAt(amount, incrementRules) {
  const sorted = [...incrementRules].sort((a, b) => a.threshold - b.threshold);
  let applicable = sorted[0].increment;
  for (const rule of sorted) {
    if (amount >= rule.threshold) applicable = rule.increment;
    else break;
  }
  return applicable;
}

/**
 * The minimum a new bid must be, given the current high bid (or null if
 * no bids yet, in which case the starting bid applies).
 */
export function minimumNextBid(currentBid, startingBid, incrementRules) {
  if (currentBid === null || currentBid === undefined) {
    return startingBid;
  }
  return currentBid + incrementAt(currentBid, incrementRules);
}

/**
 * Seconds remaining until a bid deadline, floored at 0. Both args are
 * ISO timestamp strings (or Date objects) so this stays easy to test
 * without relying on the real clock.
 */
export function secondsRemaining(deadline, now) {
  if (!deadline) return null;
  const deadlineMs = new Date(deadline).getTime();
  const nowMs = new Date(now).getTime();
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function computeDeadline(timeoutSeconds, from = new Date()) {
  return new Date(from.getTime() + timeoutSeconds * 1000).toISOString();
}

/**
 * Whether a new bid keeps an entry's total spend at or under its cap.
 * cap === null/undefined means no cap — always allowed.
 */
export function isWithinBidCap(currentTotalBids, proposedAmount, cap) {
  if (cap === null || cap === undefined || cap === "") return true;
  return currentTotalBids + proposedAmount <= Number(cap);
}

/**
 * Whether a proposed bid is legal given the current state.
 */
export function isValidBid(proposedAmount, currentBid, startingBid, incrementRules) {
  const min = minimumNextBid(currentBid, startingBid, incrementRules);
  return proposedAmount >= min;
}
