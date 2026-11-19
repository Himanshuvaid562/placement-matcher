require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const AcademicRecord = require("../models/AcademicRecord");
const VerificationLog = require("../models/VerificationLog");
const Skill = require("../models/Skill");
const StudentSkill = require("../models/StudentSkill");
const Company = require("../models/Company");
const PlacementOpportunity = require("../models/PlacementOpportunity");
const EligibilityRule = require("../models/EligibilityRule");
const Credential = require("../models/Credential");
const CredentialFile = require("../models/CredentialFile");
const Resume = require("../models/Resume");
const ResumeShare = require("../models/ResumeShare");
const { newToken, hashToken } = require("../services/resumeService");
const { sha256 } = require("../services/credentialService");

// A tiny but structurally valid one-page PDF (real xref table) so "View certificate" works in the demo.
function buildDemoPdf(text) {
  const stream = `BT /F1 16 Tf 30 110 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 220] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += `${String(o).padStart(10, "0")} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function seed() {
  // This script DELETES every collection it touches. Refuse to run against production by accident.
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    console.error("[seed] refusing to run with NODE_ENV=production (set SEED_FORCE=1 to override). This wipes all data.");
    process.exit(1);
  }
  await connectDB(process.env.MONGO_URI);
  // Drop indexes left over from older schemas (e.g. the unique index on User.email)
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  console.log("[seed] clearing existing demo data...");
  await Promise.all([
    User.deleteMany({}), StudentProfile.deleteMany({}), Skill.deleteMany({}),
    StudentSkill.deleteMany({}), Company.deleteMany({}),
    PlacementOpportunity.deleteMany({}), EligibilityRule.deleteMany({}),
    AcademicRecord.deleteMany({}), VerificationLog.deleteMany({}),
    Credential.deleteMany({}), CredentialFile.deleteMany({}), Resume.deleteMany({}), ResumeShare.deleteMany({}),
  ]);

  const officer = await User.create({
    loginId: "10001", passwordHash: await bcrypt.hash("Officer@123", 12), role: "officer",
  });

  // The university's own records (what an official export would contain)
  await AcademicRecord.insertMany([
    { registrationNumber: "12000001", department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0, importedBy: officer._id },
    { registrationNumber: "12000002", department: "CSE", batchYear: 2026, cgpa: 7.4, backlogs: 1, importedBy: officer._id },
  ]);

  // Student 1: already verified by the university
  const studentUser = await User.create({
    loginId: "12000001", passwordHash: await bcrypt.hash("Student@123", 12), role: "student",
  });
  const verifiedAt = new Date();
  const studentProfile = await StudentProfile.create({
    userId: studentUser._id, registrationNumber: "12000001",
    department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0,
    projects: [{ title: "Placement Matcher", description: "This very app", techStack: ["MERN"] }],
    verification: {
      status: "verified", method: "official_record",
      verifiedSnapshot: { department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 },
      submittedAt: verifiedAt, reviewedAt: verifiedAt, reviewedBy: officer._id,
    },
  });

  // Student 2: submitted for verification but CLAIMS better numbers than the university's record
  const pendingUser = await User.create({
    loginId: "12000002", passwordHash: await bcrypt.hash("Student@123", 12), role: "student",
  });
  const pendingProfile = await StudentProfile.create({
    userId: pendingUser._id, registrationNumber: "12000002",
    department: "CSE", batchYear: 2026, cgpa: 9.1, backlogs: 0,
    verification: { status: "pending", submittedAt: new Date() },
  });

  const skillNames = [
    ["JavaScript", "Language"], ["Node.js", "Framework"], ["React", "Framework"],
    ["MongoDB", "Database"], ["Data Structures", "Core CS"], ["System Design", "Core CS"],
  ];
  const skills = await Skill.insertMany(skillNames.map(([name, category]) => ({ name, category })));
  const byName = Object.fromEntries(skills.map((s) => [s.name, s]));

  await StudentSkill.insertMany([
    { studentId: studentProfile._id, skillId: byName["JavaScript"]._id, selfReportedLevel: 4 },
    { studentId: studentProfile._id, skillId: byName["Node.js"]._id, selfReportedLevel: 3 },
    { studentId: studentProfile._id, skillId: byName["React"]._id, selfReportedLevel: 3 },
    { studentId: studentProfile._id, skillId: byName["Data Structures"]._id, verifiedLevel: 4 },
  ]);

  // Demo certificates, linked to skills so they act as evidence once faculty verify them.
  const demoPdf = buildDemoPdf("DEMO CERTIFICATE - Server-side Development with NodeJS (Coursera)");
  async function addCredential(profile, fields, pdf, status = "pending") {
    const c = await Credential.create({
      studentId: profile._id, ...fields, status,
      ...(status !== "pending" ? { reviewedAt: new Date(), reviewedBy: officer._id } : {}),
      ...(pdf ? { file: { name: "certificate.pdf", size: pdf.length, sha256: sha256(pdf) } } : {}),
    });
    if (pdf) await CredentialFile.create({ credentialId: c._id, data: pdf });
  }
  // 12000001: a VERIFIED Node.js certificate (counts as evidence, capped at level 3) ...
  await addCredential(studentProfile, {
    type: "mooc", result: "O Grade", title: "Server-side Development with NodeJS", issuer: "Coursera", issueDate: new Date("2025-06-15"),
    skillId: byName["Node.js"]._id, skillLevel: 4, awardedLevel: 4,
    link: "https://www.coursera.org/account/accomplishments/verify/DEMO123", linkHost: "www.coursera.org", linkKnown: true,
  }, demoPdf, "verified");
  // ... and a PENDING MongoDB one. Approve it as faculty and watch this student's match jump (46.2% -> 71.2%).
  await addCredential(studentProfile, {
    type: "certification", title: "MongoDB Basics for Developers", issuer: "MongoDB University", issueDate: new Date("2025-09-10"),
    skillId: byName["MongoDB"]._id, skillLevel: 3,
    link: "https://learn.mongodb.com/c/demo-basics", linkHost: "learn.mongodb.com", linkKnown: true,
  });
  // 12000002: the SAME PDF as 12000001's (duplicate warning), a link to an unrecognised site, an NPTEL link
  await addCredential(pendingProfile, {
    type: "mooc", result: "O Grade", title: "Server-side Development with NodeJS", issuer: "Coursera", issueDate: new Date("2025-07-02"),
    skillId: byName["Node.js"]._id, skillLevel: 5,
  }, demoPdf);
  await addCredential(pendingProfile, {
    type: "certification", title: "Data Structures and Algorithms", issuer: "NPTEL",
    link: "https://onlinecourses.nptel.ac.in/noc25_cs01/preview", linkHost: "onlinecourses.nptel.ac.in", linkKnown: true,
  });
  await addCredential(pendingProfile, {
    type: "certification", title: "Web Development Bootcamp", issuer: "Some Academy",
    link: "https://certs.some-small-academy.com/verify/777", linkHost: "certs.some-small-academy.com", linkKnown: false,
  });

  // A saved resume and a live verification link for the verified demo student
  await Resume.create({
    studentId: studentProfile._id, fullName: "Demo Student",
    contact: { email: "demo.student@example.com", phone: "+91 90000 00000", linkedin: "https://www.linkedin.com/in/demo-student", github: "https://github.com/demo-student" },
    skillGroups: [
      { label: "Languages", items: ["C++", "JavaScript", "SQL", "Data Structures"] },
      { label: "Web Technologies", items: ["HTML", "CSS", "React.js (learning)", "Node.js", "Express.js"] },
      { label: "Database & Tools", items: ["MongoDB", "Git", "GitHub", "Postman", "Docker", "Linux (Ubuntu)"] },
      { label: "Soft Skills", items: ["Problem-Solving", "Team Player", "Adaptability"] },
    ],
    projects: [{
      title: "Placement Matcher", link: "https://github.com/demo-student/placement-matcher", date: "2026-09",
      bullets: [
        "Built a placement-readiness platform with a transparent, weighted skill-matching engine and university-verified student data.",
        "Engineered an Express/Mongoose backend with role-based access, JWT sessions and aggregation pipelines for cohort analytics.",
        "Developed a Next.js frontend with Tailwind CSS and Recharts, including a what-if simulator and a verified resume export.",
      ],
      techStack: ["Next.js", "Tailwind CSS", "Node.js", "Express", "MongoDB"],
    }],
    training: [{
      title: "Cloud Fundamentals Workshop", link: "https://drive.google.com/file/d/demo/view", date: "2026-07",
      description: "Completed a short workshop covering cloud basics, containers and deployment.",
    }],
    education: { degree: "Bachelor of Technology", start: "2022-08", end: "present" },
    otherEducation: [{ institution: "Demo Public School", location: "Amritsar, Punjab", level: "Intermediate", start: "2021-03", end: "2022-05", detail: "PCM; Percentage: 78%" }],
  });
  const demoToken = newToken();
  await ResumeShare.create({
    studentId: studentProfile._id, tokenHash: hashToken(demoToken), showCgpa: true, showRegistrationNumber: false,
    expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
  });
  const appUrl = (process.env.PUBLIC_APP_URL || (process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0]).trim().replace(/\/$/, "");

  const company = await Company.create({ name: "Acme Corp", description: "Demo hiring partner", contactEmail: "hr@acme.example" });
  const opportunity = await PlacementOpportunity.create({
    companyId: company._id,
    role: "Backend Engineer Intern",
    description: "Node.js/MongoDB backend internship",
    status: "published",
    publishedAt: new Date(),
    createdBy: officer._id,
    requiredSkills: [
      { skillId: byName["Node.js"]._id, minLevel: 4, weight: 0.35 },
      { skillId: byName["MongoDB"]._id, minLevel: 3, weight: 0.25 },
      { skillId: byName["System Design"]._id, minLevel: 3, weight: 0.2 },
      { skillId: byName["Data Structures"]._id, minLevel: 3, weight: 0.2 },
    ],
  });
  await EligibilityRule.create({
    opportunityId: opportunity._id, minCgpa: 7.0,
    eligibleDepartments: ["CSE", "IT"], eligibleBatchYears: [2026, 2027], maxBacklogs: 0,
  });

  console.log("[seed] done.");
  console.log("  faculty/officer:   10001     / Officer@123");
  console.log("  verified student:  12000001  / Student@123");
  console.log("  demo certificates: 12000001 has a verified Node.js one and a PENDING MongoDB one (approve it as faculty: match 46.2% -> 71.2%);");
  console.log("                     12000002 has three pending (one is the same PDF as 12000001's, one links to an unrecognised site)");
  console.log(`  demo verification link (recruiter view, no login): ${appUrl}/verify/${demoToken}`);
  console.log("  pending student:   12000002  / Student@123   (claims CGPA 9.1; official record says 7.4 with 1 backlog)");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
