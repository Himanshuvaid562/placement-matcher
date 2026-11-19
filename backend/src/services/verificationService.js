/**
 * Pure verification rules (no database, no Express) so they can be unit tested.
 */
const ApiError = require("../utils/ApiError");

const ACADEMIC_FIELDS = ["department", "batchYear", "cgpa", "backlogs"];
const TRACKED_FIELDS = [...ACADEMIC_FIELDS, "registrationNumber"];

const isBlank = (v) => v === undefined || v === null || v === "";

function pickAcademic(obj) {
  return {
    department: obj.department,
    batchYear: obj.batchYear,
    cgpa: obj.cgpa,
    backlogs: obj.backlogs ?? 0,
  };
}

/**
 * The academic values that eligibility must use.
 * Verified -> the frozen snapshot approved by the university.
 * Anything else -> the student's own claim, flagged verified:false (provisional only).
 */
function academicView(profile) {
  const v = profile.verification;
  if (v?.status === "verified" && v.verifiedSnapshot) {
    return { ...pickAcademic(v.verifiedSnapshot), verified: true };
  }
  return { ...pickAcademic(profile), verified: false };
}

function sameValue(a, b) {
  if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

/** Which tracked fields would actually change if `updates` were applied to `existing`? */
function changedTrackedFields(existing, updates) {
  return TRACKED_FIELDS.filter((f) => updates[f] !== undefined && !sameValue(existing[f], updates[f]));
}

/** Field-by-field claimed vs official comparison, for the officer's review screen. */
function buildComparison(claimed, official) {
  if (!official) return null;
  return ACADEMIC_FIELDS.map((field) => ({
    field,
    claimed: claimed[field] ?? null,
    official: official[field] ?? null,
    match: sameValue(claimed[field], official[field]),
  }));
}

/** Student -> "submit for verification": details must be complete and the status must allow it. */
function validateSubmission(profile) {
  const status = profile.verification?.status || "unverified";
  if (status === "pending") throw new ApiError(409, "Your details are already awaiting verification");
  if (status === "verified") throw new ApiError(409, "Your details are already verified");

  const missing = [];
  if (isBlank(profile.registrationNumber)) missing.push("registrationNumber");
  for (const f of ["department", "batchYear", "cgpa"]) if (isBlank(profile[f])) missing.push(f);
  if (missing.length) {
    throw new ApiError(422, "Complete all academic details before submitting", { missing });
  }
}

/**
 * Officer -> approve. The official record, when one exists, always wins over the student's claim.
 * With no official record the officer must explicitly confirm a manual document check.
 */
function resolveApproval(claimed, officialRecord, { manualCheck } = {}) {
  const missing = [];
  if (isBlank(claimed.registrationNumber)) missing.push("registrationNumber");
  for (const f of ["department", "batchYear", "cgpa"]) if (isBlank(claimed[f])) missing.push(f);
  if (missing.length) throw new ApiError(422, "Student has not completed all academic details", { missing });

  if (officialRecord) return { method: "official_record", snapshot: pickAcademic(officialRecord) };
  if (manualCheck === true) return { method: "manual", snapshot: pickAcademic(claimed) };
  throw new ApiError(
    422,
    "No official record on file for this registration number. If you checked the student's documents yourself, resend with manualCheck: true"
  );
}

/** What the student is allowed to see about their own verification (never the reviewer's identity). */
function publicVerification(profile) {
  const v = profile.verification || {};
  return {
    status: v.status || "unverified",
    method: v.method,
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    rejectionReason: v.rejectionReason,
  };
}

module.exports = {
  ACADEMIC_FIELDS,
  TRACKED_FIELDS,
  pickAcademic,
  academicView,
  changedTrackedFields,
  buildComparison,
  validateSubmission,
  resolveApproval,
  publicVerification,
};
