const PlacementOpportunity = require("../models/PlacementOpportunity");
const EligibilityRule = require("../models/EligibilityRule");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const createOpportunity = asyncHandler(async (req, res) => {
  const { companyId, role, description, requiredSkills, eligibilityRule } = req.body;
  if (!companyId || !role) throw new ApiError(422, "companyId and role are required");

  const opportunity = await PlacementOpportunity.create({
    companyId,
    role,
    description,
    requiredSkills: requiredSkills || [],
    createdBy: req.user.id,
  });

  if (eligibilityRule) {
    await EligibilityRule.create({ opportunityId: opportunity._id, ...eligibilityRule });
  }

  res.status(201).json({ opportunity });
});

const updateOpportunity = asyncHandler(async (req, res) => {
  const { role, description, requiredSkills, eligibilityRule } = req.body;
  const opportunity = await PlacementOpportunity.findByIdAndUpdate(
    req.params.id,
    { $set: { role, description, requiredSkills } },
    { new: true, runValidators: true }
  );
  if (!opportunity) throw new ApiError(404, "Opportunity not found");

  if (eligibilityRule) {
    await EligibilityRule.findOneAndUpdate(
      { opportunityId: opportunity._id },
      { $set: eligibilityRule },
      { upsert: true }
    );
  }

  res.json({ opportunity });
});

const setStatus = (status) =>
  asyncHandler(async (req, res) => {
    const update = { status };
    if (status === "published") update.publishedAt = new Date();

    const opportunity = await PlacementOpportunity.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!opportunity) throw new ApiError(404, "Opportunity not found");
    res.json({ opportunity });
  });

const listOpportunities = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  // Students only ever see published opportunities; officers see everything.
  const filter = req.user.role === "student" ? { status: "published" } : {};

  const [data, total] = await Promise.all([
    PlacementOpportunity.find(filter)
      .populate("companyId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    PlacementOpportunity.countDocuments(filter),
  ]);

  res.json({ data, page, limit, total });
});

const getOpportunity = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role === "student") filter.status = "published";

  const opportunity = await PlacementOpportunity.findOne(filter)
    .populate("companyId", "name")
    .populate("requiredSkills.skillId", "name category");
  if (!opportunity) throw new ApiError(404, "Opportunity not found or not published");

  res.json({ opportunity });
});

module.exports = {
  createOpportunity,
  updateOpportunity,
  publishOpportunity: setStatus("published"),
  archiveOpportunity: setStatus("archived"),
  listOpportunities,
  getOpportunity,
};
