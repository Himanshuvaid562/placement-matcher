const Company = require("../models/Company");
const PlacementOpportunity = require("../models/PlacementOpportunity");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createCompany = asyncHandler(async (req, res) => {
  const { name, description, website, contactEmail } = req.body;
  if (!name) throw new ApiError(422, "name is required");
  if (contactEmail && !EMAIL_RE.test(contactEmail)) throw new ApiError(422, "contactEmail is not a valid email address");
  const company = await Company.create({ name, description, website, contactEmail: contactEmail || undefined });
  res.status(201).json({ company });
});

const listCompanies = asyncHandler(async (req, res) => {
  if (req.user.role === "student") {
    // Students only see companies that currently have a published opportunity, and never contact details.
    const ids = await PlacementOpportunity.distinct("companyId", { status: "published" });
    const companies = await Company.find({ _id: { $in: ids } }).select("name description website").sort({ name: 1 });
    return res.json({ data: companies });
  }
  const companies = await Company.find().sort({ name: 1 });
  res.json({ data: companies });
});

module.exports = { createCompany, listCompanies };
