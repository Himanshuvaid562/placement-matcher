const ReadinessResult = require("../models/ReadinessResult");

const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most one unchanged snapshot per 6 hours

/**
 * Pure decision: should we store a new snapshot?
 * Store when there is no previous snapshot, the score/eligibility changed, or the last one is stale.
 * This keeps page refreshes from flooding the history with identical points.
 */
function shouldRecord(last, current, now = new Date()) {
  if (!last) return true;
  if (last.matchScore !== current.matchScore) return true;
  if (last.eligible !== current.eligible) return true;
  return now.getTime() - new Date(last.createdAt).getTime() >= MIN_INTERVAL_MS;
}

async function recordSnapshot({ studentId, opportunityId, eligibility, match }) {
  const last = await ReadinessResult.findOne({ studentId, opportunityId }).sort({ createdAt: -1 });
  const current = { matchScore: match.matchScore, eligible: eligibility.eligible };
  if (!shouldRecord(last, current)) return null;

  return ReadinessResult.create({
    studentId,
    opportunityId,
    eligible: eligibility.eligible,
    matchScore: match.matchScore,
    breakdown: match.breakdown.map((b) => ({
      skillId: b.skillId, required: b.required, actual: b.actual, source: b.source,
    })),
  });
}

module.exports = { recordSnapshot, shouldRecord, MIN_INTERVAL_MS };
