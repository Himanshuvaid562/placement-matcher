const mongoose = require("mongoose");

const eligibilityRuleSchema = new mongoose.Schema(
  {
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "PlacementOpportunity", required: true, unique: true, index: true },
    minCgpa: { type: Number, min: 0, max: 10, default: 0 },
    eligibleDepartments: [{ type: String }],
    eligibleBatchYears: [{ type: Number }],
    maxBacklogs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EligibilityRule", eligibilityRuleSchema);
