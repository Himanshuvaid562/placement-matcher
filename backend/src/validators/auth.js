const { z } = require("zod");

// Identity rules per role. Students use their UMS registration number, faculty their employee ID.
// (Digits only; stored as strings.)  Change these two lines if LPU's numbering rules change.
const LOGIN_ID_RULES = {
  student: { pattern: /^\d{8,20}$/, message: "Registration number must be 8 or more digits" },
  officer: { pattern: /^\d{5,20}$/, message: "Faculty ID must be 5 or more digits" },
};

const password = z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters");

const registerSchema = z
  .object({
    loginId: z.string().trim().min(1, "Enter your ID"),
    password,
    role: z.enum(["student", "officer"]),
    inviteCode: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const rule = LOGIN_ID_RULES[v.role];
    if (!rule.pattern.test(v.loginId)) ctx.addIssue({ code: "custom", path: ["loginId"], message: rule.message });
  });

const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current one",
  });

module.exports = { LOGIN_ID_RULES, registerSchema, loginSchema, changePasswordSchema };
