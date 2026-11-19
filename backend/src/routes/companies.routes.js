const express = require("express");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/rbac");
const { createCompany, listCompanies } = require("../controllers/companyController");

const router = express.Router();
router.get("/", requireAuth, listCompanies);
router.post("/", requireAuth, requireRole("officer"), createCompany);

module.exports = router;
