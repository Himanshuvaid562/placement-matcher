const mongoose = require("mongoose");

const assessmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: { type: String, enum: ["technical", "aptitude"], required: true },
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", default: null },
    durationMinutes: { type: Number, required: true, default: 30 },
    isPublished: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assessment", assessmentSchema);
