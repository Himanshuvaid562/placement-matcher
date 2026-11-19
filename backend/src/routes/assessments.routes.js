const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const {
  listAssessments, createAssessment, addQuestion, listQuestionsForOfficer, publishAssessment,
  startAttempt, submitAttempt,
} = require("../controllers/assessmentController");

const router = express.Router();
router.use(requireAuth);

router.get("/", listAssessments);
router.post("/", requireRole("officer"), createAssessment);
router.post("/:id/questions", requireRole("officer"), addQuestion);
router.get("/:id/questions", requireRole("officer"), listQuestionsForOfficer);
router.patch("/:id/publish", requireRole("officer"), publishAssessment);

router.post("/:id/start", requireRole("student"), startAttempt);
router.post("/attempts/:id/submit", requireRole("student"), submitAttempt);

module.exports = router;
