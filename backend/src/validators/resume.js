const { z } = require("zod");

const blankToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = (schema) => z.preprocess(blankToUndefined, schema.optional());
const text = (max) => z.string().trim().max(max);
const required = (max, msg) => z.string().trim().min(1, msg).max(max);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ym = z.string().regex(MONTH, "Use YYYY-MM, e.g. 2025-09");
const ymOrPresent = z.string().regex(/^(\d{4}-(0[1-9]|1[0-2])|present)$/i, "Use YYYY-MM, or 'present'");

const resumeSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  contact: z.object({
    email: optional(z.string().trim().email("Enter a valid email").max(120)),
    phone: optional(z.string().trim().regex(/^[0-9+()\-\s]{6,20}$/, "Enter a valid phone number")),
    linkedin: optional(text(300)),
    github: optional(text(300)),
    portfolio: optional(text(300)),
  }).default({}),
  skillGroups: z.array(z.object({
    label: required(30, "Each skill group needs a name"),
    items: z.array(z.string().trim().min(1).max(30)).max(15, "At most 15 skills per group"),
  })).max(6, "At most 6 skill groups").default([]),
  projects: z.array(z.object({
    title: required(80, "Each project needs a title"),
    link: optional(text(300)),
    date: optional(ym),
    bullets: z.array(z.string().trim().min(1).max(220)).max(4, "At most 4 bullet points per project").default([]),
    techStack: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  })).max(5, "At most 5 projects").default([]),
  training: z.array(z.object({
    title: required(100, "Each training entry needs a title"),
    link: optional(text(300)),
    date: optional(ym),
    description: text(400).default(""),
  })).max(3, "At most 3 training entries").default([]),
  education: z.object({
    degree: optional(text(60)),
    start: optional(ym),
    end: optional(ymOrPresent),
  }).default({}),
  otherEducation: z.array(z.object({
    institution: required(80, "Enter the school or college"),
    location: optional(text(60)),
    level: optional(text(60)),
    start: optional(ym),
    end: optional(ymOrPresent),
    detail: optional(text(120)),
  })).max(3, "At most 3 other education entries").default([]),
});

const shareSchema = z.object({
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  showCgpa: z.boolean().default(true),
  showRegistrationNumber: z.boolean().default(false),
});

const pdfSchema = z.object({
  shareToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid link").optional(),
  // OFF by default: the output is exactly the recommended format. true adds verification marks and notes.
  verificationMarks: z.boolean().default(false),
});

module.exports = { resumeSchema, shareSchema, pdfSchema };
