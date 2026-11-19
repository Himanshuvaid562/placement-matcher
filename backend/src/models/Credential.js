const mongoose = require("mongoose");

// A certificate or MOOC a student claims, with proof (an uploaded PDF and/or a link).
// It does not affect eligibility. If linked to a skill AND approved by faculty, it can back that skill's level
// in the match score (capped; see evidenceService).
const credentialSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true, index: true },
    type: { type: String, enum: ["certification", "mooc"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    issuer: { type: String, required: true, trim: true, maxlength: 80 }, // organisation or platform
    issueDate: Date,
    credentialId: { type: String, trim: true, maxlength: 80 },
    result: { type: String, trim: true, maxlength: 40 }, // optional grade/result shown on the resume, e.g. "O Grade"

    // Optional: the catalog skill this certificate evidences, and the level the student says it covers.
    // After faculty approval, awardedLevel (faculty's decision) is what the matcher may use (capped).
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", index: true },
    skillLevel: { type: Number, min: 1, max: 5 },
    awardedLevel: { type: Number, min: 1, max: 5 },

    link: String, // normalised https URL (validated by classifyLink)
    linkHost: String,
    linkKnown: Boolean, // is the host a recognised drive/credential site?

    // Metadata of the uploaded PDF; the bytes live in CredentialFile so lists stay small.
    file: { name: String, size: Number, sha256: { type: String, index: true } },

    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectionReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Credential", credentialSchema);
