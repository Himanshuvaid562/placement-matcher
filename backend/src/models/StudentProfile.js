const mongoose = require("mongoose");

// University verification of the academic fields. `verifiedSnapshot` is what eligibility actually uses;
// the student-entered values are only a claim until a Placement Officer approves them.
const verificationSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ["unverified", "pending", "verified", "rejected"], default: "unverified" },
    method: { type: String, enum: ["official_record", "manual"] },
    verifiedSnapshot: {
      department: String,
      batchYear: Number,
      cgpa: Number,
      backlogs: Number,
    },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectionReason: String,
  },
  { _id: false }
);

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    registrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9\-\/]{4,20}$/, "registrationNumber must be 4-20 letters, digits, - or /"],
    },
    department: { type: String, trim: true },
    batchYear: { type: Number },
    cgpa: { type: Number, min: 0, max: 10 },
    backlogs: { type: Number, min: 0, default: 0 },
    verification: { type: verificationSchema, default: () => ({}) },
    projects: [{ title: String, description: String, techStack: [String], link: String }],
    certifications: [{ name: String, issuer: String, year: Number }],
    internships: [{ company: String, role: String, duration: String, description: String }],
  },
  { timestamps: true }
);

// A registration number can be VERIFIED for only one account. (Unverified claims may overlap;
// the officer decides which account really owns it, and the second approval is then refused.)
studentProfileSchema.index(
  { registrationNumber: 1 },
  { unique: true, partialFilterExpression: { "verification.status": "verified" } }
);
studentProfileSchema.index({ "verification.status": 1 });

// Rough, transparent completion metric — used on the dashboard, never in matching.
studentProfileSchema.methods.completionPct = function () {
  const fields = [this.department, this.batchYear, this.cgpa, this.backlogs !== undefined];
  const filled = fields.filter(Boolean).length;
  const hasExtras = (this.projects?.length ? 1 : 0) + (this.certifications?.length ? 1 : 0);
  return Math.round(((filled + hasExtras) / (fields.length + 2)) * 100);
};

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
