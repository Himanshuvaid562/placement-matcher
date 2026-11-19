const mongoose = require("mongoose");

// A revocable, expiring link a recruiter can open to confirm the university-verified facts.
// Only the SHA-256 of the token is stored, so a database leak does not expose working links.
const resumeShareSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    showCgpa: { type: Boolean, default: true },
    showRegistrationNumber: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    viewCount: { type: Number, default: 0 },
    lastViewedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ResumeShare", resumeShareSchema);
