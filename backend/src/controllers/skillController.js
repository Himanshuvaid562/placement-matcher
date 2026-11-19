const Skill = require("../models/Skill");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const listSkills = asyncHandler(async (req, res) => {
  const skills = await Skill.find().sort({ category: 1, name: 1 });
  res.json({ data: skills });
});

const createSkill = asyncHandler(async (req, res) => {
  const { name, category } = req.body;
  if (!name) throw new ApiError(422, "name is required");

  const existing = await Skill.findOne({ name: name.trim() });
  if (existing) throw new ApiError(409, "A skill with this name already exists");

  const skill = await Skill.create({ name: name.trim(), category });
  res.status(201).json({ skill });
});

module.exports = { listSkills, createSkill };
