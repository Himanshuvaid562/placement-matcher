const mongoose = require("mongoose");

// The university's own record of a student. Imported by the Placement Office from official data;
// when present it is the source of truth that overrides whatever the student typed.
const academicRecordSchema = new mongoose.Schema(
  {
    registrationNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    department: { type: String, required: true, trim: true },
    batchYear: { type: Number, required: true },
    cgpa: { type: Number, required: true, min: 0, max: 10 },
    backlogs: { type: Number, default: 0, min: 0 },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AcademicRecord", academicRecordSchema);
