const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const { listSkills, createSkill } = require("../controllers/skillController");

const router = express.Router();
router.use(requireAuth);

router.get("/", listSkills);                       // both roles can read the catalog
router.post("/", requireRole("officer"), createSkill); // only officers can add new skills

module.exports = router;
