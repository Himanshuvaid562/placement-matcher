const StudentProfile = require("../models/StudentProfile");
const StudentSkill = require("../models/StudentSkill");
const PlacementOpportunity = require("../models/PlacementOpportunity");
const EligibilityRule = require("../models/EligibilityRule");
const AssessmentAttempt = require("../models/AssessmentAttempt");
const Credential = require("../models/Credential");
const Skill = require("../models/Skill");
const { checkEligibility } = require("../services/eligibilityService");
const { computeMatch } = require("../services/matchingService");
const { academicView } = require("../services/verificationService");
const { loadEvidenceForMany } = require("../services/evidenceLoader");
const { toCsv } = require("../utils/csv");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

async function loadOpportunity(id) {
  const opportunity = await PlacementOpportunity.findById(id);
  if (!opportunity) throw new ApiError(404, "Opportunity not found");
  return opportunity;
}

// Evaluates every student against one opportunity: eligibility + skill match.
async function buildCandidates(opportunity) {
  const rule = await EligibilityRule.findOne({ opportunityId: opportunity._id });
  const profiles = await StudentProfile.find();
  const evidence = await loadEvidenceForMany(profiles.map((p) => p._id));

  return profiles.map((p) => {
    // Only the university-verified snapshot can make a student officially eligible.
    const view = academicView(p);
    const result = rule ? checkEligibility(rule, view) : { eligible: true, checks: [] };
    const match = computeMatch(opportunity.requiredSkills, evidence.get(String(p._id)) || []);
    return {
      profile: p,
      view,
      verified: view.verified,
      passesRules: result.eligible,
      eligible: result.eligible && view.verified,
      match,
    };
  });
}

// ---- Overview: headline counts for the officer dashboard ----
const overview = asyncHandler(async (req, res) => {
  const [totalStudents, publishedOpportunities, attemptedIds, profiles] = await Promise.all([
    StudentProfile.countDocuments(),
    PlacementOpportunity.countDocuments({ status: "published" }),
    AssessmentAttempt.distinct("studentId", { status: "submitted" }),
    StudentProfile.find(),
  ]);

  const avgCompletion = profiles.length
    ? Math.round(profiles.reduce((sum, p) => sum + p.completionPct(), 0) / profiles.length)
    : 0;

  const statusRows = await StudentProfile.aggregate([{ $group: { _id: "$verification.status", n: { $sum: 1 } } }]);
  const verification = { verified: 0, pending: 0, rejected: 0, unverified: 0 };
  for (const r of statusRows) verification[r._id && verification[r._id] !== undefined ? r._id : "unverified"] += r.n;

  const pendingCredentials = await Credential.countDocuments({ status: "pending" });

  res.json({
    totalStudents,
    verification,
    pendingCredentials,
    publishedOpportunities,
    studentsWithSubmittedAssessment: attemptedIds.length,
    assessmentParticipationPct: totalStudents ? Math.round((attemptedIds.length / totalStudents) * 100) : 0,
    avgProfileCompletionPct: avgCompletion,
  });
});

// ---- Aggregates only: no individual student data ----
// Department / batch figures use ONLY university-verified academic data.
const skillDistributionByDepartment = asyncHandler(async (req, res) => {
  const [rows, excludedUnverified] = await Promise.all([
    StudentSkill.aggregate([
    { $lookup: { from: "studentprofiles", localField: "studentId", foreignField: "_id", as: "profile" } },
    { $unwind: "$profile" },
    { $match: { "profile.verification.status": "verified" } },
    {
      $group: {
        _id: { department: "$profile.verification.verifiedSnapshot.department", skillId: "$skillId" },
        avgLevel: { $avg: { $ifNull: ["$verifiedLevel", "$selfReportedLevel"] } },
        studentCount: { $sum: 1 },
      },
    },
    ]),
    StudentProfile.countDocuments({ "verification.status": { $ne: "verified" } }),
  ]);
  res.json({ data: rows, excludedUnverified });
});

// Batch-wise summary: cohort size, average CGPA, and average skill level per graduation batch
const batchSummary = asyncHandler(async (req, res) => {
  const [cohorts, skillRows, excludedUnverified] = await Promise.all([
    StudentProfile.aggregate([
      { $match: { "verification.status": "verified" } },
      {
        $group: {
          _id: "$verification.verifiedSnapshot.batchYear",
          students: { $sum: 1 },
          avgCgpa: { $avg: "$verification.verifiedSnapshot.cgpa" },
        },
      },
    ]),
    StudentSkill.aggregate([
      { $lookup: { from: "studentprofiles", localField: "studentId", foreignField: "_id", as: "p" } },
      { $unwind: "$p" },
      { $match: { "p.verification.status": "verified" } },
      {
        $group: {
          _id: "$p.verification.verifiedSnapshot.batchYear",
          avgSkillLevel: { $avg: { $ifNull: ["$verifiedLevel", "$selfReportedLevel"] } },
        },
      },
    ]),
    StudentProfile.countDocuments({ "verification.status": { $ne: "verified" } }),
  ]);

  const skillByBatch = new Map(skillRows.map((r) => [r._id, r.avgSkillLevel]));
  const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

  const data = cohorts
    .map((c) => ({
      batchYear: c._id ?? null,
      students: c.students,
      avgCgpa: round1(c.avgCgpa),
      avgSkillLevel: round1(skillByBatch.get(c._id)),
    }))
    .sort((a, b) => (a.batchYear ?? 0) - (b.batchYear ?? 0));

  res.json({ data, excludedUnverified });
});

const eligibleStudentsForOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await loadOpportunity(req.params.id);
  const candidates = await buildCandidates(opportunity);
  const eligible = candidates
    .filter((c) => c.eligible)
    .map((c) => ({
      studentId: c.profile._id,
      department: c.view.department,
      batchYear: c.view.batchYear,
      cgpa: c.view.cgpa,
      matchScore: c.match.matchScore,
    }))
    .sort((a, b) => b.matchScore - a.matchScore);

  res.json({
    data: eligible,
    totalCandidates: candidates.length,
    eligibleCount: eligible.length,
    // Would pass the rules on their own claim, but the university has not verified them yet
    awaitingVerificationCount: candidates.filter((c) => !c.verified && c.passesRules).length,
  });
});

// CSV export: verified-eligible students only (never unverified claims)
const exportEligibleStudents = asyncHandler(async (req, res) => {
  const opportunity = await loadOpportunity(req.params.id);
  const candidates = await buildCandidates(opportunity);

  const rows = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.match.matchScore - a.match.matchScore)
    .map((c) => ({
      registrationNumber: c.profile.registrationNumber,
      department: c.view.department,
      batchYear: c.view.batchYear,
      cgpa: c.view.cgpa,
      backlogs: c.view.backlogs,
      matchScorePct: c.match.matchScore,
    }));

  const csv = toCsv(
    ["registrationNumber", "department", "batchYear", "cgpa", "backlogs", "matchScorePct"],
    rows
  );
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="eligible-students-${opportunity._id}.csv"`);
  res.send(csv);
});

const commonSkillGaps = asyncHandler(async (req, res) => {
  if (!req.query.opportunityId) throw new ApiError(422, "opportunityId query parameter is required");
  const opportunity = await loadOpportunity(req.query.opportunityId);
  const candidates = await buildCandidates(opportunity);

  const gapCounts = new Map();
  for (const c of candidates) {
    for (const b of c.match.breakdown) {
      if (b.actual < b.required) {
        gapCounts.set(String(b.skillId), (gapCounts.get(String(b.skillId)) || 0) + 1);
      }
    }
  }

  const skillDocs = await Skill.find({ _id: { $in: [...gapCounts.keys()] } });
  const nameById = new Map(skillDocs.map((s) => [String(s._id), s.name]));

  const data = [...gapCounts.entries()]
    .map(([skillId, count]) => ({ skillId, skillName: nameById.get(skillId) || skillId, studentsWithGap: count }))
    .sort((a, b) => b.studentsWithGap - a.studentsWithGap);

  res.json({ data });
});

module.exports = {
  overview,
  skillDistributionByDepartment,
  batchSummary,
  eligibleStudentsForOpportunity,
  exportEligibleStudents,
  commonSkillGaps,
};
