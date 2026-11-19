const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    website: String,
    // HR contact for the placement team. Never returned to students.
    contactEmail: { type: String, trim: true, lowercase: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);
