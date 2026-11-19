const mongoose = require("mongoose");

const studentSkillSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true, index: true },
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", required: true, index: true },
    selfReportedLevel: { type: Number, min: 1, max: 5, default: null },
    verifiedLevel: { type: Number, min: 1, max: 5, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AssessmentAttempt", default: null },
  },
  { timestamps: true }
);

studentSkillSchema.index({ studentId: 1, skillId: 1 }, { unique: true });

module.exports = mongoose.model("StudentSkill", studentSkillSchema);
