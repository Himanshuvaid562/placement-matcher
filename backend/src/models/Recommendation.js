const mongoose = require("mongoose");

const recommendationSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "PlacementOpportunity", required: true, index: true },
    gaps: [
      {
        skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill" },
        gapSize: Number,
      },
    ],
    suggestions: [
      {
        skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill" },
        suggestedAction: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Recommendation", recommendationSchema);
