const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const {
  getMyProfile, updateMyProfile, listSkillCatalog, upsertMySkill, listMySkills,
} = require("../controllers/profileController");
const { myAttempts } = require("../controllers/assessmentController");
const { submitForVerification } = require("../controllers/verificationController");
const { listMine, createMine, deleteMine, myFile } = require("../controllers/credentialController");
const { singlePdf } = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimit");
const validate = require("../middleware/validate");
const { createCredentialSchema } = require("../validators/credential");
const { whatIfSchema } = require("../validators/whatIf");
const { nextSkills, runWhatIf } = require("../controllers/whatIfController");
const { resumeSchema, shareSchema, pdfSchema } = require("../validators/resume");
const {
  getResume, saveResume, checkResume, listShares, createShare, revokeShare, downloadPdf,
} = require("../controllers/resumeController");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

router.get("/me/profile", getMyProfile);
router.put("/me/profile", updateMyProfile);
router.get("/me/skills", listMySkills);
router.post("/me/skills", upsertMySkill);
router.get("/me/attempts", myAttempts);
router.post("/me/verification/submit", submitForVerification);

// Certificates / MOOCs. Authentication and the student role are checked (router.use above) BEFORE
// multer buffers any upload, so anonymous clients cannot push files at the server.
router.get("/me/credentials", listMine);
router.post("/me/credentials", uploadLimiter, singlePdf("certificate"), validate(createCredentialSchema), createMine);
router.delete("/me/credentials/:id", deleteMine);
router.get("/me/credentials/:id/file", myFile);

// "What if?" simulator: read-only, never changes any data
router.get("/me/what-if/next-skills", nextSkills);
router.post("/me/what-if", validate(whatIfSchema), runWhatIf);

// Resume: written by the student; academics, skills and certificates are pulled from verified data
router.get("/me/resume", getResume);
router.put("/me/resume", validate(resumeSchema), saveResume);
router.get("/me/resume/check/:opportunityId", checkResume);
router.get("/me/resume/shares", listShares);
router.post("/me/resume/shares", validate(shareSchema), createShare);
router.delete("/me/resume/shares/:id", revokeShare);
router.post("/me/resume/pdf", validate(pdfSchema), downloadPdf);
router.get("/skills-catalog", listSkillCatalog);

module.exports = router;
