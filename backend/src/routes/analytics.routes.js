const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const {
  overview, skillDistributionByDepartment, batchSummary,
  eligibleStudentsForOpportunity, exportEligibleStudents, commonSkillGaps,
} = require("../controllers/analyticsController");

const router = express.Router();
router.use(requireAuth, requireRole("officer"));

router.get("/overview", overview);
router.get("/departments/skill-distribution", skillDistributionByDepartment);
router.get("/batches/summary", batchSummary);
router.get("/opportunities/:id/eligible-students", eligibleStudentsForOpportunity);
router.get("/opportunities/:id/eligible-students/export", exportEligibleStudents);
router.get("/skill-gaps/common", commonSkillGaps);

module.exports = router;
