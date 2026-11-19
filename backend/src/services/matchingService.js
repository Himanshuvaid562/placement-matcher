/**
 * Weighted skill-match scoring.
 * Level evidence, strongest first:
 *   1. assessment-verified level (always wins)
 *   2. certificate-backed level (faculty-verified certificate, capped) - used when it is at least the self-reported level
 *   3. self-reported level
 * so adding evidence can raise a score or upgrade how trustworthy a row is, but never lowers it.
 * - Ratio is capped at 1.0 so an over-qualified skill cannot mask a missing one.
 * - Weights are re-normalized so an officer does not need them to sum to exactly 1.
 */
function resolveLevel(ss) {
  const verified = ss?.verifiedLevel ?? null;
  const certificate = ss?.certificateLevel ?? null;
  const self = ss?.selfReportedLevel ?? null;
  if (verified != null) return { actual: verified, source: "verified" };
  if (certificate != null && certificate >= (self ?? 0)) return { actual: certificate, source: "certificate" };
  if (self != null) return { actual: self, source: "self" };
  return { actual: 0, source: "missing" };
}

function computeMatch(requiredSkills, studentSkills) {
  const totalWeight = requiredSkills.reduce((sum, rs) => sum + (rs.weight ?? 1), 0) || 1;
  const skillMap = new Map(studentSkills.map((s) => [String(s.skillId), s]));

  let scoreSum = 0;
  const breakdown = requiredSkills.map((rs) => {
    const ss = skillMap.get(String(rs.skillId));
    const { actual, source } = resolveLevel(ss);

    const ratio = Math.min(actual / rs.minLevel, 1);
    const normalizedWeight = (rs.weight ?? 1) / totalWeight;
    const contribution = ratio * normalizedWeight;
    scoreSum += contribution;

    return {
      skillId: rs.skillId,
      required: rs.minLevel,
      actual,
      source,
      // every tier on file, so the UI can show what each claim is backed by
      evidence: {
        assessment: ss?.verifiedLevel ?? null,
        certificate: ss?.certificateLevel ?? null,
        self: ss?.selfReportedLevel ?? null,
      },
      contributionPct: Math.round(contribution * 1000) / 10,
    };
  });

  return {
    matchScore: Math.round(scoreSum * 1000) / 10,
    breakdown,
  };
}

module.exports = { computeMatch, resolveLevel };
