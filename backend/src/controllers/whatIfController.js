const StudentProfile = require("../models/StudentProfile");
const PlacementOpportunity = require("../models/PlacementOpportunity");
const EligibilityRule = require("../models/EligibilityRule");
const Skill = require("../models/Skill");
const { computeMatch } = require("../services/matchingService");
const { checkEligibility } = require("../services/eligibilityService");
const { academicView } = require("../services/verificationService");
const { loadEvidence } = require("../services/evidenceLoader");
const { simulate, rankNextSkills } = require("../services/simulatorService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// Everything a what-if needs, loaded once: published roles, the student's evidence, skill names.
async function loadContext(userId) {
  const profile = await StudentProfile.findOne({ userId });
  if (!profile) throw new ApiError(404, "Student profile not found");

  const opps = await PlacementOpportunity.find({ status: "published" }).populate("companyId", "name").limit(200);
  const rules = await EligibilityRule.find({ opportunityId: { $in: opps.map((o) => o._id) } });
  const ruleBy = new Map(rules.map((r) => [String(r.opportunityId), r]));
  const evidence = await loadEvidence(profile._id);
  const view = academicView(profile);

  const skillIds = new Set();
  for (const o of opps) for (const rs of o.requiredSkills) skillIds.add(String(rs.skillId));
  const skills = skillIds.size ? await Skill.find({ _id: { $in: [...skillIds] } }) : [];
  const names = new Map(skills.map((s) => [String(s._id), s.name]));

  const items = opps.map((o) => {
    const rule = ruleBy.get(String(o._id));
    return {
      id: String(o._id),
      role: o.role,
      company: o.companyId?.name,
      requiredSkills: o.requiredSkills.map((rs) => ({ skillId: String(rs.skillId), minLevel: rs.minLevel, weight: rs.weight })),
      eligible: rule ? checkEligibility(rule, view).eligible : true,
    };
  });

  return { evidence, view, names, items };
}

const nextSkills = asyncHandler(async (req, res) => {
  const { evidence, view, names, items } = await loadContext(req.user.id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const countedIds = new Set(items.filter((i) => i.eligible).map((i) => i.id));

  const ranked = rankNextSkills(items, evidence, { countedIds, limit: 5 });

  res.json({
    data: ranked.map((r) => ({
      ...r,
      skillName: names.get(r.skillId) || r.skillId,
      topRoles: r.topRoles.map((t) => ({ ...t, role: byId.get(t.opportunityId)?.role, company: byId.get(t.opportunityId)?.company })),
    })),
    considered: countedIds.size,
    excluded: items.length - countedIds.size, // roles the student is academically ineligible for
    provisional: !view.verified, // based on unverified academic details
    roles: items.map((i) => ({
      id: i.id, role: i.role, company: i.company, eligible: i.eligible,
      score: computeMatch(i.requiredSkills, evidence).matchScore,
    })),
  });
});

const runWhatIf = asyncHandler(async (req, res) => {
  const { opportunityId, changes } = req.body;
  const { evidence, view, names, items } = await loadContext(req.user.id);

  const target = items.find((i) => i.id === opportunityId);
  if (!target) throw new ApiError(404, "Opportunity not found or not published");

  const main = simulate(target, evidence, changes);

  // Ripple effect: the same improvement applied to every other open role.
  const ripple = items
    .map((i) => {
      const r = simulate(i, evidence, changes);
      return { opportunityId: i.id, role: i.role, company: i.company, eligible: i.eligible, baselineScore: r.baselineScore, scenarioScore: r.scenarioScore, delta: r.delta };
    })
    .filter((r) => r.opportunityId === opportunityId || r.delta !== 0)
    .sort((a, b) => b.delta - a.delta);

  res.json({
    opportunity: { id: target.id, role: target.role, company: target.company, eligible: target.eligible },
    provisional: !view.verified,
    baselineScore: main.baselineScore,
    scenarioScore: main.scenarioScore,
    delta: main.delta,
    rows: main.rows.map((row) => ({ ...row, skillName: names.get(String(row.skillId)) || String(row.skillId) })),
    ripple,
  });
});

module.exports = { nextSkills, runWhatIf };
