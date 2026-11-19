const mongoose = require("mongoose");

// Point-in-time snapshot of a student's readiness for one opportunity.
// Used for the "readiness over time" trend; never presented as a placement prediction.
const readinessResultSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "PlacementOpportunity", required: true },
    eligible: { type: Boolean, required: true },
    matchScore: { type: Number, required: true },
    breakdown: [
      {
        _id: false,
        skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill" },
        required: Number,
        actual: Number,
        source: { type: String, enum: ["verified", "certificate", "self", "missing"] },
      },
    ],
  },
  { timestamps: true }
);

readinessResultSchema.index({ studentId: 1, opportunityId: 1, createdAt: -1 });

module.exports = mongoose.model("ReadinessResult", readinessResultSchema);
