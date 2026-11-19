const PlacementOpportunity = require("../models/PlacementOpportunity");
const EligibilityRule = require("../models/EligibilityRule");
const StudentProfile = require("../models/StudentProfile");
const StudentSkill = require("../models/StudentSkill");
const { checkEligibility } = require("../services/eligibilityService");
const { computeMatch } = require("../services/matchingService");
const { generateRecommendations } = require("../services/recommendationService");
const { recordSnapshot } = require("../services/readinessHistoryService");
const { academicView } = require("../services/verificationService");
const { loadEvidence } = require("../services/evidenceLoader");
const ReadinessResult = require("../models/ReadinessResult");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

async function loadContext(req) {
  const opportunity = await PlacementOpportunity.findOne({ _id: req.params.id, status: "published" });
  if (!opportunity) throw new ApiError(404, "Opportunity not found or not published");

  const rule = await EligibilityRule.findOne({ opportunityId: opportunity._id });
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");

  return { opportunity, rule, profile };
}

// Eligibility is evaluated on the university-verified snapshot when there is one.
// Otherwise it is provisional (based on the student's own claim) and clearly flagged as such.
function evaluateEligibility(rule, profile) {
  const view = academicView(profile);
  const base = rule ? checkEligibility(rule, view) : { eligible: true, checks: [] };
  return { ...base, verified: view.verified, verificationStatus: profile.verification?.status || "unverified" };
}

const getEligibility = asyncHandler(async (req, res) => {
  const { rule, profile } = await loadContext(req);
  res.json(evaluateEligibility(rule, profile));
});

const getMatch = asyncHandler(async (req, res) => {
  const { opportunity, profile } = await loadContext(req);
  const studentSkills = await loadEvidence(profile._id);
  const result = computeMatch(opportunity.requiredSkills, studentSkills);
  res.json(result);
});

const getRecommendations = asyncHandler(async (req, res) => {
  const { opportunity, profile } = await loadContext(req);
  const studentSkills = await loadEvidence(profile._id);
  const { breakdown } = computeMatch(opportunity.requiredSkills, studentSkills);
  const recommendations = generateRecommendations(breakdown);
  res.json({ data: recommendations });
});

// One combined endpoint the dashboard/opportunity page uses to avoid 3 round trips
const getReadiness = asyncHandler(async (req, res) => {
  const { opportunity, rule, profile } = await loadContext(req);
  const studentSkills = await loadEvidence(profile._id);

  const eligibility = evaluateEligibility(rule, profile);
  const match = computeMatch(opportunity.requiredSkills, studentSkills);
  const recommendations = generateRecommendations(match.breakdown);

  // History is best-effort: a failed snapshot must never break the readiness response.
  try {
    await recordSnapshot({ studentId: profile._id, opportunityId: opportunity._id, eligibility, match });
  } catch (err) {
    console.error("[readiness] snapshot failed", err.message);
  }

  res.json({ eligibility, match, recommendations });
});

const getReadinessHistory = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");

  const data = await ReadinessResult.find({ studentId: profile._id, opportunityId: req.params.id })
    .sort({ createdAt: 1, _id: 1 })
    .limit(100)
    .select("matchScore eligible createdAt -_id");
  res.json({ data });
});

module.exports = { getEligibility, getMatch, getRecommendations, getReadiness, getReadinessHistory };
