const StudentProfile = require("../models/StudentProfile");
const AcademicRecord = require("../models/AcademicRecord");
const VerificationLog = require("../models/VerificationLog");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { generateTemporaryPassword } = require("../utils/password");
const {
  pickAcademic, buildComparison, validateSubmission, resolveApproval, publicVerification,
} = require("../services/verificationService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const QUEUE_STATUSES = ["pending", "verified", "rejected", "unverified"];

async function loadProfile(id) {
  const profile = await StudentProfile.findById(id);
  if (!profile) throw new ApiError(404, "Student profile not found");
  return profile;
}

// ---------------- student ----------------
const submitForVerification = asyncHandler(async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.user.id });
  if (!profile) throw new ApiError(404, "Student profile not found");

  validateSubmission(profile);

  profile.verification.status = "pending";
  profile.verification.submittedAt = new Date();
  profile.verification.rejectionReason = undefined;
  await profile.save();

  await VerificationLog.create({
    profileId: profile._id,
    action: "submitted",
    actorUserId: req.user.id,
    details: { claimed: pickAcademic(profile), registrationNumber: profile.registrationNumber },
  });

  res.json({ verification: publicVerification(profile) });
});

// ---------------- officer ----------------
const importRecords = asyncHandler(async (req, res) => {
  const { records } = req.body;
  const ops = records.map((r) => ({
    updateOne: {
      filter: { registrationNumber: r.registrationNumber },
      update: { $set: { ...r, importedBy: req.user.id } },
      upsert: true,
    },
  }));
  const result = await AcademicRecord.bulkWrite(ops, { ordered: false });

  await VerificationLog.create({
    action: "records_imported",
    actorUserId: req.user.id,
    details: { received: records.length, created: result.upsertedCount, updated: result.modifiedCount },
  });

  res.status(201).json({
    received: records.length,
    created: result.upsertedCount,
    updated: result.modifiedCount,
  });
});

const listQueue = asyncHandler(async (req, res) => {
  const status = QUEUE_STATUSES.includes(req.query.status) ? req.query.status : "pending";
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const filter =
    status === "unverified"
      ? { $or: [{ "verification.status": "unverified" }, { "verification.status": { $exists: false } }] }
      : { "verification.status": status };
  const sort = status === "pending" ? { "verification.submittedAt": 1 } : { updatedAt: -1 };

  const [profiles, total] = await Promise.all([
    StudentProfile.find(filter).populate("userId", "loginId").sort(sort).skip((page - 1) * limit).limit(limit),
    StudentProfile.countDocuments(filter),
  ]);

  const regNos = profiles.map((p) => p.registrationNumber).filter(Boolean);
  const records = await AcademicRecord.find({ registrationNumber: { $in: regNos } });
  const recordByReg = new Map(records.map((r) => [r.registrationNumber, r]));

  const data = profiles.map((p) => {
    const claimed = pickAcademic(p);
    const record = recordByReg.get(p.registrationNumber);
    const official = record ? pickAcademic(record) : null;
    return {
      profileId: p._id,
      loginId: p.userId?.loginId,
      registrationNumber: p.registrationNumber || null,
      status: p.verification?.status || "unverified",
      method: p.verification?.method,
      claimed,
      snapshot: p.verification?.status === "verified" ? pickAcademic(p.verification.verifiedSnapshot) : null,
      officialRecord: official,
      comparison: buildComparison(claimed, official),
      submittedAt: p.verification?.submittedAt,
      reviewedAt: p.verification?.reviewedAt,
      rejectionReason: p.verification?.rejectionReason,
    };
  });

  res.json({ data, page, limit, total });
});

const approve = asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.params.profileId);
  if (profile.verification.status !== "pending") {
    throw new ApiError(409, "Only submissions that are pending review can be approved");
  }

  const record = profile.registrationNumber
    ? await AcademicRecord.findOne({ registrationNumber: profile.registrationNumber })
    : null;
  const claimed = { registrationNumber: profile.registrationNumber, ...pickAcademic(profile) };
  const { method, snapshot } = resolveApproval(claimed, record && pickAcademic(record), {
    manualCheck: req.body.manualCheck,
  });

  // The student's visible details become the verified values (official data wins over the claim).
  profile.set(snapshot);
  profile.verification.status = "verified";
  profile.verification.method = method;
  profile.verification.verifiedSnapshot = snapshot;
  profile.verification.reviewedAt = new Date();
  profile.verification.reviewedBy = req.user.id;
  profile.verification.rejectionReason = undefined;

  try {
    await profile.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "This registration number is already verified for another account");
    }
    throw err;
  }

  await VerificationLog.create({
    profileId: profile._id,
    action: "approved",
    actorUserId: req.user.id,
    details: { method, claimed: pickAcademic(claimed), verified: snapshot },
  });

  res.json({ verification: publicVerification(profile), verified: snapshot });
});

// Rejects a pending submission, or revokes an already-verified profile (e.g. fraud found later).
const reject = asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.params.profileId);
  const previous = profile.verification.status;
  if (!["pending", "verified"].includes(previous)) {
    throw new ApiError(409, "Only pending or verified profiles can be rejected");
  }

  profile.verification.status = "rejected";
  profile.verification.verifiedSnapshot = undefined;
  profile.verification.method = undefined;
  profile.verification.reviewedAt = new Date();
  profile.verification.reviewedBy = req.user.id;
  profile.verification.rejectionReason = req.body.reason;
  await profile.save();

  await VerificationLog.create({
    profileId: profile._id,
    action: previous === "verified" ? "revoked" : "rejected",
    actorUserId: req.user.id,
    details: { reason: req.body.reason },
  });

  res.json({ verification: publicVerification(profile) });
});

const history = asyncHandler(async (req, res) => {
  await loadProfile(req.params.profileId);
  const logs = await VerificationLog.find({ profileId: req.params.profileId })
    .populate("actorUserId", "loginId")
    .sort({ createdAt: 1, _id: 1 });
  res.json({ data: logs });
});

// Account recovery: an officer who has confirmed the student's identity IN PERSON issues a one-time
// temporary password. This also evicts anyone who registered the number first (e.g. a squatter),
// because every existing session is invalidated.
const resetStudentPassword = asyncHandler(async (req, res) => {
  const profile = await loadProfile(req.params.profileId);
  const user = await User.findById(profile.userId);
  if (!user || user.role !== "student") throw new ApiError(404, "Student account not found");

  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await bcrypt.hash(temporaryPassword, 12);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();

  await VerificationLog.create({
    profileId: profile._id,
    action: "password_reset",
    actorUserId: req.user.id,
    details: { loginId: user.loginId }, // never the password itself
  });

  res.set("Cache-Control", "no-store");
  res.json({ loginId: user.loginId, temporaryPassword });
});

module.exports = { submitForVerification, importRecords, listQueue, approve, reject, history, resetStudentPassword };
