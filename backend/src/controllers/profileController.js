const StudentProfile = require("../models/StudentProfile");
const StudentSkill = require("../models/StudentSkill");
const Skill = require("../models/Skill");
const VerificationLog = require("../models/VerificationLog");
const { changedTrackedFields, publicVerification } = require("../services/verificationService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// Never expose the reviewer's identity to the student.
function profileResponse(profile) {
  const obj = profile.toObject();
  obj.verification = publicVerification(profile);
  return { profile: obj, completionPct: profile.completionPct() };
}

const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Profile not found");
  res.json(profileResponse(profile));
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const { registrationNumber, department, batchYear, cgpa, backlogs, projects, certifications, internships } = req.body;

  // The registration number is the student's login ID. It is set at sign-up and cannot be changed,
  // so nobody can attach someone else's number to their own profile.
  if (registrationNumber !== undefined && String(registrationNumber).trim() !== String(req.user.loginId)) {
    throw new ApiError(422, "Your registration number is your login ID and cannot be changed");
  }

  if (cgpa !== undefined && (typeof cgpa !== "number" || cgpa < 0 || cgpa > 10)) {
    throw new ApiError(422, "cgpa must be a number between 0 and 10");
  }

  let profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) profile = new StudentProfile({ userId: req.user.id });
  if (!profile.registrationNumber) profile.registrationNumber = req.user.loginId; // backfill older profiles

  // Whitelist; only fields that were actually sent
  const updates = Object.fromEntries(
    Object.entries({ department, batchYear, cgpa, backlogs, projects, certifications, internships })
      .filter(([, v]) => v !== undefined)
  );

  // Any real change to an academic field invalidates a previous submission/verification:
  // verified values must never silently drift from what the university approved.
  const changed = changedTrackedFields(profile, updates);
  const previousStatus = profile.verification?.status || "unverified";

  profile.set(updates);

  if (changed.length && previousStatus !== "unverified") {
    profile.verification.status = "unverified";
    profile.verification.method = undefined;
    profile.verification.verifiedSnapshot = undefined;
    profile.verification.submittedAt = undefined;
    profile.verification.reviewedAt = undefined;
    profile.verification.reviewedBy = undefined;
    profile.verification.rejectionReason = undefined;
  }

  await profile.save();

  if (changed.length && previousStatus !== "unverified") {
    await VerificationLog.create({
      profileId: profile._id,
      action: "reset",
      actorUserId: req.user.id,
      details: { previousStatus, changedFields: changed },
    });
  }

  res.json(profileResponse(profile));
});

const listSkillCatalog = asyncHandler(async (req, res) => {
  const skills = await Skill.find().sort({ category: 1, name: 1 });
  res.json({ data: skills });
});

const upsertMySkill = asyncHandler(async (req, res) => {
  const { skillId, selfReportedLevel } = req.body;
  if (!skillId || selfReportedLevel < 1 || selfReportedLevel > 5) {
    throw new ApiError(422, "skillId and selfReportedLevel (1-5) are required");
  }

  const skillExists = await Skill.exists({ _id: skillId });
  if (!skillExists) throw new ApiError(404, "Skill not found in catalog");

  const profile = await StudentProfile.findOne({ userId: req.user.id });
  const studentSkill = await StudentSkill.findOneAndUpdate(
    { studentId: profile._id, skillId },
    { $set: { selfReportedLevel } },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(201).json({ studentSkill });
});

const listMySkills = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  const skills = await StudentSkill.find({ studentId: profile._id }).populate("skillId", "name category");
  res.json({ data: skills });
});

module.exports = { getMyProfile, updateMyProfile, listSkillCatalog, upsertMySkill, listMySkills };
