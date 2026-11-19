const {
  skillEntries, buildResumeData, skillMentioned, resumeCheck, buildPublicView,
  newToken, hashToken, isTokenShape, isShareActive, departmentName, evidenceForItem, bulletsOf,
} = require("../src/services/resumeService");

const names = new Map([["node", "Node.js"], ["mongo", "MongoDB"], ["ds", "Data Structures"], ["react", "React"]]);
const evidence = [
  { skillId: "ds", verifiedLevel: 4, selfReportedLevel: null, certificateLevel: null },
  { skillId: "node", verifiedLevel: null, selfReportedLevel: 2, certificateLevel: 3 },
  { skillId: "react", verifiedLevel: null, selfReportedLevel: 3, certificateLevel: null },
  { skillId: "ghost", selfReportedLevel: 5 }, // not in the catalogue
  { skillId: "mongo", selfReportedLevel: null }, // no level at all
];
const verifiedProfile = {
  registrationNumber: "12000001", department: "ECE", batchYear: 2041, cgpa: 9.9, backlogs: 0,
  verification: { status: "verified", reviewedAt: new Date("2026-10-01"), verifiedSnapshot: { department: "CSE", batchYear: 2026, cgpa: 8.2, backlogs: 0 } },
};
const unverifiedProfile = { ...verifiedProfile, verification: { status: "pending" } };
const credentials = [
  { status: "verified", title: "Server-side NodeJS", issuer: "Coursera", issueDate: new Date("2025-06-15"), type: "mooc", reviewedAt: new Date("2026-09-01") },
  { status: "pending", title: "Not yet checked", issuer: "X", type: "certification" },
  { status: "rejected", title: "Rejected one", issuer: "Y", type: "certification" },
];
const resume = {
  fullName: "Ananya Sharma", contact: { email: "anu@example.com", phone: "+91 98765 43210" },
  skillGroups: [
    { label: "Languages", items: ["JavaScript", "Data Structures"] },
    { label: "Web Technologies", items: ["Node.js (learning)", "React.js", "Express.js"] },
    { label: "Soft Skills", items: ["Team Player"] },
  ],
  projects: [{ title: "Placement Matcher", date: "2026-09", bullets: ["Built with Express and MongoDB."], techStack: ["Node.js"] }],
  training: [{ title: "Cloud Fundamentals", date: "2026-07", description: "Covered CI/CD pipelines." }],
  education: { degree: "Bachelor of Technology", start: "2024-08", end: "present" },
  otherEducation: [{ institution: "Demo Public School", location: "Amritsar, Punjab", level: "Intermediate", start: "2023-03", end: "2024-05", detail: "PCM; Percentage: 78%" }],
};

describe("skillEntries", () => {
  test("names, tiers, and order: assessment, then certificate, then self; levels high to low", () => {
    const out = skillEntries(evidence, names);
    expect(out.map((s) => [s.name, s.level, s.evidence])).toEqual([
      ["Data Structures", 4, "assessment"],
      ["Node.js", 3, "certificate"],
      ["React", 3, "self"],
    ]);
  });
  test("skips skills with no level or no catalogue name", () => {
    expect(skillEntries(evidence, names).map((s) => s.skillId)).not.toContain("ghost");
    expect(skillEntries(evidence, names).map((s) => s.skillId)).not.toContain("mongo");
  });
});

describe("buildResumeData", () => {
  test("academic details come from the VERIFIED snapshot, not from what the profile currently says", () => {
    const d = buildResumeData({ profile: verifiedProfile, resume, evidence, names, credentials });
    // the profile says ECE / 9.9; the verified snapshot says CSE / 8.2, and the snapshot wins
    expect(d.education).toMatchObject({ department: "Computer Science and Engineering", departmentCode: "CSE", batchYear: 2026, cgpa: 8.2, verified: true, registrationNumber: "12000001" });
    expect(d.education.verifiedOn).toEqual(new Date("2026-10-01"));
  });
  test("unverified details are shown but flagged", () => {
    const d = buildResumeData({ profile: unverifiedProfile, resume, evidence, names, credentials });
    expect(d.education).toMatchObject({ verified: false, verifiedOn: null, cgpa: 9.9 });
  });
  test("only faculty-verified certificates appear", () => {
    const d = buildResumeData({ profile: verifiedProfile, resume, evidence, names, credentials });
    expect(d.certificates.map((c) => c.title)).toEqual(["Server-side NodeJS"]);
  });
  test("a student with no saved resume still gets a data object", () => {
    const d = buildResumeData({ profile: verifiedProfile, resume: null, evidence, names, credentials });
    expect(d).toMatchObject({ name: "", projects: [], training: [], skillGroups: [], otherEducation: [] });
  });

  test("the university entry: fixed institution, full department name from the verified record, typed degree and dates", () => {
    const e = buildResumeData({ profile: verifiedProfile, resume, evidence, names, credentials }).education;
    expect(e).toMatchObject({
      institution: "Lovely Professional University", location: "Phagwara, Punjab",
      degree: "Bachelor of Technology", start: "2024-08", end: "present",
      department: "Computer Science and Engineering", departmentCode: "CSE", cgpa: 8.2,
    });
  });

  test("the degree defaults to Bachelor of Technology when the student has not typed one", () => {
    const d = buildResumeData({ profile: verifiedProfile, resume: { fullName: "A" }, evidence, names, credentials });
    expect(d.education.degree).toBe("Bachelor of Technology");
  });

  test("typed skills get an evidence marker only when an assessment or a verified certificate backs them", () => {
    const d = buildResumeData({ profile: verifiedProfile, resume, evidence, names, credentials });
    const all = Object.fromEntries(d.skillGroups.flatMap((g) => g.items).map((i) => [i.name, i.evidence]));
    expect(all["Data Structures"]).toBe("assessment");
    expect(all["Node.js (learning)"]).toBe("certificate");
    expect(all["React.js"]).toBeNull(); // self-reported only: no marker
    expect(all["Team Player"]).toBeNull(); // not a platform skill at all
  });

  test("groups keep the student's own labels and order; empty groups are dropped", () => {
    const d = buildResumeData({
      profile: verifiedProfile, evidence, names, credentials,
      resume: { fullName: "A", skillGroups: [{ label: "Tools", items: ["Git"] }, { label: "Empty", items: [] }, { label: "Languages", items: ["C"] }] },
    });
    expect(d.skillGroups.map((g) => g.label)).toEqual(["Tools", "Languages"]);
  });

  test("projects carry date, bullets and technologies; an older single description becomes one bullet", () => {
    const d = buildResumeData({
      profile: verifiedProfile, evidence, names, credentials,
      resume: { fullName: "A", projects: [{ title: "Old", description: "One long paragraph.", techStack: ["Node.js"] }, { title: "New", date: "2026-01", bullets: ["a", "b"] }] },
    });
    expect(d.projects[0]).toMatchObject({ title: "Old", bullets: ["One long paragraph."], techStack: ["Node.js"] });
    expect(d.projects[1]).toMatchObject({ title: "New", date: "2026-01", bullets: ["a", "b"] });
  });

  test("training, other education and certificate details (id, link) are carried through", () => {
    const d = buildResumeData({
      profile: verifiedProfile, resume, evidence, names,
      credentials: [{ status: "verified", title: "T", issuer: "I", credentialId: "100200", result: "O Grade", link: "https://drive.google.com/x", type: "mooc" }],
    });
    expect(d.training[0]).toMatchObject({ title: "Cloud Fundamentals", date: "2026-07" });
    expect(d.otherEducation[0]).toMatchObject({ institution: "Demo Public School", detail: "PCM; Percentage: 78%" });
    expect(d.certificates[0]).toMatchObject({ credentialId: "100200", result: "O Grade", link: "https://drive.google.com/x" });
  });
});

describe("departmentName / evidenceForItem / bulletsOf", () => {
  test.each([["CSE", "Computer Science and Engineering"], ["cse", "Computer Science and Engineering"], ["IT", "Information Technology"],
    ["ECE", "Electronics and Communication Engineering"], ["Biotechnology", "Biotechnology"], ["", ""], [undefined, ""]])(
    "%j -> %j", (code, expected) => expect(departmentName(code)).toBe(expected));

  test("the strongest evidence wins, self-reported never earns a marker, and C is not C++", () => {
    const skills = [{ name: "React", evidence: "certificate" }, { name: "React", evidence: "assessment" }, { name: "C", evidence: "assessment" }, { name: "Go", evidence: "self" }];
    expect(evidenceForItem("React.js", skills)).toBe("assessment");
    expect(evidenceForItem("Go", skills)).toBeNull();
    expect(evidenceForItem("C++", skills)).toBeNull();
    expect(evidenceForItem("C", skills)).toBe("assessment");
  });

  test("bulletsOf prefers bullets, falls back to the legacy description, else empty", () => {
    expect(bulletsOf({ bullets: ["a"], description: "old" })).toEqual(["a"]);
    expect(bulletsOf({ bullets: [], description: "old" })).toEqual(["old"]);
    expect(bulletsOf({})).toEqual([]);
  });
});

describe("skillMentioned: whole-word, tolerant of how people write skill names", () => {
  test.each([
    ["Node.js", "Built APIs with Node.js", true], ["Node.js", "used nodejs daily", true], ["Node.js", "Node JS backend", true],
    ["Node.js", "node-js service", true], ["Node.js", "NODE.JS", true], ["Node.js", "ran on Node", true], ["Node.js", "used nodemon", false],
    ["JavaScript", "wrote JavaScript", true], ["JavaScript", "plain JS", true],
    ["Java", "I know JavaScript", false], ["Java", "Java and Spring", true],
    ["C", "C programming", true], ["C", "C++ templates", false], ["C", "wrote C# code", false], ["C", "an abc service", false],
    ["C++", "C++ templates", true], ["C++", "used cpp", true],
    ["React", "React.js app", true], ["React", "reactjs", true], ["React", "reactive programming", false],
    ["SQL", "NoSQL stores", false], ["SQL", "MySQL tuning", false], ["SQL", "wrote SQL queries", true],
    ["Go", "going to the market", false], ["Go", "services in Go", true],
    ["MongoDB", "stored in mongo", true], ["MongoDB", "MongoDB Atlas", true],
    ["Data Structures", "DSA practice", true], ["Data Structures", "data structures and algorithms", true],
    ["Machine Learning", "ML pipeline", true], ["Artificial Intelligence", "AI project", true], ["Artificial Intelligence", "aim high", false],
    ["Kubernetes", "k8s cluster", true],
  ])("%s in %j -> %s", (skill, text, expected) => expect(skillMentioned(text, skill)).toBe(expected));

  test("empty text or name never matches, and regex characters in names are safe", () => {
    expect(skillMentioned("", "React")).toBe(false);
    expect(skillMentioned("anything", "")).toBe(false);
    expect(() => skillMentioned("x (y) [z] + * ? ^ $", "C++ (beta) [x]")).not.toThrow();
  });

  test("a long text with a pathological name returns quickly (no catastrophic backtracking)", () => {
    const text = "a".repeat(20000) + " node node node ".repeat(500);
    const t = Date.now();
    skillMentioned(text, "N.o.d.e.-.j.s");
    expect(Date.now() - t).toBeLessThan(500);
  });
});

describe("resumeCheck", () => {
  const data = buildResumeData({ profile: verifiedProfile, resume, evidence, names, credentials });
  const required = [
    { skillId: "node", name: "Node.js", minLevel: 4, weight: 0.5 },
    { skillId: "mongo", name: "MongoDB", minLevel: 3, weight: 0.25 }, // named in a project, but not in the Skills section
    { skillId: "gcp", name: "Kubernetes", minLevel: 2, weight: 0.25 }, // nowhere
  ];

  test("listed vs mentioned-only vs absent, with a weighted coverage figure", () => {
    const r = resumeCheck(data, required);
    expect(Object.fromEntries(r.rows.map((x) => [x.name, x.status]))).toEqual({ "Node.js": "listed", MongoDB: "mentioned", Kubernetes: "absent" });
    expect(r.counts).toEqual({ listed: 1, mentionedOnly: 1, absent: 1 });
    expect(r.coveragePct).toBe(75); // 0.5 + 0.25
  });

  test("advice is specific to each situation", () => {
    const rows = Object.fromEntries(resumeCheck(data, required).rows.map((x) => [x.name, x]));
    expect(rows["Node.js"].advice).toMatch(/recorded at level 3; this role asks for 4/);
    expect(rows.MongoDB.advice).toMatch(/not in your Skills section/);
    expect(rows.Kubernetes.advice).toMatch(/does not appear anywhere/);
  });

  test("a listed skill that meets the level but is only self-reported is flagged", () => {
    const r = resumeCheck(data, [{ skillId: "react", name: "React", minLevel: 3, weight: 1 }]);
    expect(r.rows[0]).toMatchObject({ status: "listed", evidence: "self", meetsLevel: true });
    expect(r.rows[0].advice).toMatch(/only self-reported/);
  });

  test("a fully backed skill needs no advice", () => {
    const r = resumeCheck(data, [{ skillId: "ds", name: "Data Structures", minLevel: 3, weight: 1 }]);
    expect(r.rows[0].advice).toBeNull();
    expect(r.coveragePct).toBe(100);
  });

  test("a skill typed into the Skills section but never recorded on the platform is flagged", () => {
    const r = resumeCheck(data, [{ skillId: "git", name: "Git", minLevel: 2, weight: 1 }]);
    expect(r.rows[0].status).toBe("absent"); // Git is in no group of this fixture
    const withGit = buildResumeData({ profile: verifiedProfile, evidence, names, credentials, resume: { fullName: "A", skillGroups: [{ label: "Tools", items: ["Git"] }] } });
    const row = resumeCheck(withGit, [{ skillId: "git", name: "Git", minLevel: 2, weight: 1 }]).rows[0];
    expect(row).toMatchObject({ status: "listed", level: null, evidence: null });
    expect(row.advice).toMatch(/not recorded on the platform/);
  });

  test("text in Training and Education details also counts as 'mentioned'", () => {
    const r = resumeCheck(data, [{ skillId: "ci", name: "CI/CD", minLevel: 2, weight: 1 }]);
    expect(r.rows[0].status).toBe("mentioned"); // "Covered CI/CD pipelines." in the training description
  });

  test("it is honest that this is a keyword check", () => {
    expect(resumeCheck(data, required).disclaimer).toMatch(/keyword check, not a prediction/);
  });

  test("a role with no required skills does not divide by zero", () => {
    expect(resumeCheck(data, []).coveragePct).toBe(0);
  });
});

describe("buildPublicView: what a recruiter may see", () => {
  const share = { showCgpa: true, showRegistrationNumber: false, expiresAt: new Date("2030-01-01") };
  const view = (p = verifiedProfile, s = share) => buildPublicView({ profile: p, resume, evidence, names, credentials, share: s, now: new Date("2026-10-27") });

  test("verified facts only: academics, evidenced skills, faculty-verified certificates", () => {
    const v = view();
    expect(v.academic).toMatchObject({ status: "verified", department: "CSE", batchYear: 2026, backlogs: 0, cgpa: 8.2 });
    expect(v.skills.map((s) => s.name)).toEqual(["Data Structures", "Node.js"]); // React is self-reported: excluded
    expect(v.certificates.map((c) => c.title)).toEqual(["Server-side NodeJS"]);
    expect(v.validUntil).toEqual(share.expiresAt);
  });

  test("the student decides about CGPA and registration number", () => {
    expect(view(verifiedProfile, { ...share, showCgpa: false }).academic).not.toHaveProperty("cgpa");
    expect(view().academic).not.toHaveProperty("registrationNumber");
    expect(view(verifiedProfile, { ...share, showRegistrationNumber: true }).academic.registrationNumber).toBe("12000001");
  });

  test("unverified academics reveal NO figures at all", () => {
    const json = JSON.stringify(view(unverifiedProfile));
    expect(view(unverifiedProfile).academic).toEqual({ status: "unverified", note: expect.stringMatching(/not verified/) });
    expect(json).not.toMatch(/9\.9|12000001|ECE|2041/);
  });

  test("never exposes contact details, projects, training, schools, typed skills, or pending/rejected certificates", () => {
    const json = JSON.stringify(view());
    expect(json).not.toMatch(/anu@example|98765|Placement Matcher|Cloud Fundamentals|Demo Public School|Team Player|Languages|Not yet checked|Rejected one/);
  });

  test("states plainly that the name is the student's own entry", () => {
    expect(view().student).toEqual({ name: "Ananya Sharma", nameIsSelfEntered: true });
    expect(view().notes.join(" ")).toMatch(/ID card/);
  });
});

describe("share tokens", () => {
  test("43 url-safe characters (256 bits), never repeated", () => {
    const set = new Set(Array.from({ length: 300 }, () => newToken()));
    expect(set.size).toBe(300);
    for (const t of set) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  test("only a one-way hash is derived for storage", () => {
    const t = newToken();
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).not.toBe(hashToken(newToken()));
  });
  test.each([["x", false], ["", false], ["a".repeat(42), false], ["a".repeat(44), false], ["a".repeat(42) + "!", false], ["a".repeat(43), true]])(
    "isTokenShape(%j) -> %s", (t, expected) => expect(isTokenShape(t)).toBe(expected)
  );
  test("a share is active only if not revoked and not expired", () => {
    const now = new Date("2026-10-27");
    expect(isShareActive({ expiresAt: new Date("2026-11-01") }, now)).toBe(true);
    expect(isShareActive({ expiresAt: new Date("2026-10-01") }, now)).toBe(false);
    expect(isShareActive({ expiresAt: new Date("2026-11-01"), revokedAt: new Date() }, now)).toBe(false);
    expect(isShareActive(null, now)).toBe(false);
  });
});
