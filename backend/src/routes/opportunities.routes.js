const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const {
  createOpportunity, updateOpportunity, publishOpportunity, archiveOpportunity,
  listOpportunities, getOpportunity,
} = require("../controllers/opportunityController");
const { getEligibility, getMatch, getRecommendations, getReadiness, getReadinessHistory } = require("../controllers/eligibilityController");

const router = express.Router();
router.use(requireAuth);

router.get("/", listOpportunities);
router.get("/:id", getOpportunity);
router.get("/:id/eligibility", requireRole("student"), getEligibility);
router.get("/:id/match", requireRole("student"), getMatch);
router.get("/:id/recommendations", requireRole("student"), getRecommendations);
router.get("/:id/readiness", requireRole("student"), getReadiness);
router.get("/:id/readiness-history", requireRole("student"), getReadinessHistory);

router.post("/", requireRole("officer"), createOpportunity);
router.patch("/:id", requireRole("officer"), updateOpportunity);
router.patch("/:id/publish", requireRole("officer"), publishOpportunity);
router.patch("/:id/archive", requireRole("officer"), archiveOpportunity);

module.exports = router;
