const mongoose = require("mongoose");

const requiredSkillSchema = new mongoose.Schema(
  {
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", required: true },
    minLevel: { type: Number, min: 1, max: 5, required: true },
    weight: { type: Number, min: 0, max: 1, default: 1 },
  },
  { _id: false }
);

const opportunitySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    role: { type: String, required: true, trim: true },
    description: String,
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    requiredSkills: [requiredSkillSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlacementOpportunity", opportunitySchema);
