/**
 * "What if?" simulation (pure, no database). It re-runs the SAME matching engine with some skills
 * hypothetically raised, so a student can see which skill is worth working on next.
 * It never writes anything and only ever raises levels (it answers "what if I improve", not "what if I forget").
 */
const { computeMatch, resolveLevel } = require("./matchingService");

const round1 = (n) => Math.round(n * 10) / 10;

/** overrides: [{ skillId, level }] -> a copy of the evidence list with those skills raised to at least `level` */
function applyOverrides(studentSkills, overrides) {
  const byId = new Map(studentSkills.map((s) => [String(s.skillId), { ...s }]));
  for (const o of overrides) {
    const key = String(o.skillId);
    const current = byId.get(key) || { skillId: o.skillId, selfReportedLevel: null, verifiedLevel: null, certificateLevel: null };
    const { actual } = resolveLevel(current);
    // Hypothetical level stands in for the best evidence; it can only raise the current level.
    byId.set(key, { skillId: o.skillId, selfReportedLevel: null, certificateLevel: null, verifiedLevel: Math.max(actual, o.level) });
  }
  return [...byId.values()];
}

/** One opportunity: baseline vs scenario, with a row per required skill. */
function simulate(opportunity, studentSkills, overrides) {
  const baseline = computeMatch(opportunity.requiredSkills, studentSkills);
  const scenario = computeMatch(opportunity.requiredSkills, applyOverrides(studentSkills, overrides));

  const rows = scenario.breakdown.map((after, i) => {
    const before = baseline.breakdown[i];
    return {
      skillId: after.skillId,
      required: after.required,
      before: before.actual,
      after: after.actual,
      sourceBefore: before.source,
      raised: after.actual > before.actual,
      contributionBefore: before.contributionPct,
      contributionAfter: after.contributionPct,
    };
  });

  return {
    baselineScore: baseline.matchScore,
    scenarioScore: scenario.matchScore,
    delta: round1(scenario.matchScore - baseline.matchScore),
    rows,
  };
}

/**
 * Which single skill, once raised to the level the roles need, lifts the student's match the most?
 * Only roles in `countedIds` are considered (callers pass the roles the student can actually apply to,
 * so we never advise studying for a role they are academically ineligible for).
 */
function rankNextSkills(opportunities, studentSkills, { countedIds = null, limit = 5 } = {}) {
  const counted = opportunities.filter((o) => !countedIds || countedIds.has(String(o.id)));
  const baselines = new Map(counted.map((o) => [String(o.id), computeMatch(o.requiredSkills, studentSkills)]));

  // For each skill the student is short on: the highest level any counted role asks for.
  const targets = new Map();
  for (const o of counted) {
    for (const row of baselines.get(String(o.id)).breakdown) {
      if (row.actual >= row.required) continue;
      const key = String(row.skillId);
      const t = targets.get(key) || { currentLevel: row.actual, targetLevel: 0 };
      t.targetLevel = Math.max(t.targetLevel, row.required);
      targets.set(key, t);
    }
  }

  const ranked = [];
  for (const [skillId, { currentLevel, targetLevel }] of targets) {
    const scenarioSkills = applyOverrides(studentSkills, [{ skillId, level: targetLevel }]);
    const roles = [];
    for (const o of counted) {
      if (!o.requiredSkills.some((rs) => String(rs.skillId) === skillId)) continue;
      const before = baselines.get(String(o.id)).matchScore;
      const after = computeMatch(o.requiredSkills, scenarioSkills).matchScore;
      const gain = round1(after - before);
      if (gain > 0) roles.push({ opportunityId: String(o.id), before, after, gain });
    }
    if (!roles.length) continue;
    roles.sort((a, b) => b.gain - a.gain || a.opportunityId.localeCompare(b.opportunityId));
    ranked.push({
      skillId,
      currentLevel,
      targetLevel,
      totalLift: round1(roles.reduce((sum, r) => sum + r.gain, 0)),
      rolesImproved: roles.length,
      topRoles: roles.slice(0, 3),
    });
  }

  ranked.sort((a, b) => b.totalLift - a.totalLift || b.rolesImproved - a.rolesImproved || a.skillId.localeCompare(b.skillId));
  return ranked.slice(0, limit);
}

module.exports = { applyOverrides, simulate, rankNextSkills };
