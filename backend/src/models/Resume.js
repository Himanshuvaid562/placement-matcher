const mongoose = require("mongoose");

// What the STUDENT writes, in the placement cell's recommended format (Skills, Projects, Training,
// Certificates, Education). Academic figures, evidence markers and certificates are NOT typed here:
// they come from the verified record at render time, so a resume cannot misstate them.
const resumeSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    contact: { email: String, phone: String, linkedin: String, github: String, portfolio: String },
    skillGroups: [{ label: String, items: [String] }],
    projects: [{
      title: String, link: String, date: String, // date = YYYY-MM
      bullets: [String], techStack: [String],
      description: String, // legacy single paragraph (older resumes); shown as one bullet when there are no bullets
    }],
    training: [{ title: String, link: String, date: String, description: String }],
    // Only the university entry's degree and dates are typed. Department and CGPA come from the verified record.
    education: { degree: String, start: String, end: String },
    otherEducation: [{ institution: String, location: String, level: String, start: String, end: String, detail: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resume", resumeSchema);
