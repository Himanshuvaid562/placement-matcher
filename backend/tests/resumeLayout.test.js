const { buildResumeBlocks, pdfSafe, monthLabel, dateLabel, rangeLabel } = require("../src/services/resumeLayout");

const full = () => ({
  name: "Ananya Sharma",
  contact: { linkedin: "https://www.linkedin.com/in/ananya", github: "https://github.com/ananya", portfolio: "https://ananya.dev", email: "ananya@example.com", phone: "+91 98765 43210" },
  skillGroups: [
    { label: "Languages", items: [{ name: "C++", evidence: "assessment" }, { name: "Python", evidence: "certificate" }, { name: "SQL", evidence: null }] },
    { label: "Soft Skills", items: [{ name: "Team Player", evidence: null }] },
  ],
  projects: [{ title: "Campus Planner", link: "https://github.com/a/campus-planner", date: "2026-09", bullets: ["Built X.", "Built Y."], techStack: ["React", "Node.js", "MongoDB"] }],
  training: [{ title: "Cloud Fundamentals", link: "https://drive.google.com/x", date: "2026-07", description: "Completed a course." }],
  certificates: [{ title: "Cloud Fundamentals", issuer: "Skill Development Centre", issueDate: "2026-08-10T00:00:00Z", credentialId: "100200", link: "https://drive.google.com/x" }],
  education: { institution: "Lovely Professional University", location: "Phagwara, Punjab", degree: "Bachelor of Technology", start: "2024-08", end: "present", department: "Computer Science and Engineering", cgpa: 7.85, verified: true, verifiedOn: "2026-10-01T00:00:00Z" },
  otherEducation: [{ institution: "Demo Public School", location: "Amritsar, Punjab", level: "Intermediate", start: "2023-03", end: "2024-05", detail: "PCM; Percentage: 78%" }],
});
const MARKS = { verificationMarks: true };
const section = (blocks, title) => blocks.find((b) => b.type === "section" && b.title === title);

describe("the recommended format: sections and order", () => {
  test("Header, then Skills, Projects, Training, Certificates, Education", () => {
    const b = buildResumeBlocks(full());
    expect(b.map((x) => x.type === "header" ? "Header" : x.title)).toEqual(["Header", "Skills", "Projects", "Training", "Certificates", "Education"]);
  });
  test("the format has no summary, experience or achievements section", () => {
    const titles = buildResumeBlocks({ ...full(), summary: "x", experience: [{}], achievements: ["y"] }).map((x) => x.title);
    for (const t of ["Summary", "Experience", "Achievements"]) expect(titles).not.toContain(t);
  });
  test("empty sections are left out, but Education always appears", () => {
    const b = buildResumeBlocks({ name: "A", contact: {}, skillGroups: [], projects: [], training: [], certificates: [], education: {}, otherEducation: [] });
    expect(b.map((x) => x.title || "Header")).toEqual(["Header", "Education"]);
  });
});

describe("header", () => {
  test("LinkedIn / Github / Portfolio on the left, Email / Mobile on the right", () => {
    const h = buildResumeBlocks(full())[0];
    expect(h.left.map((x) => x.label)).toEqual(["LinkedIn:", "Github:", "Portfolio:"]);
    expect(h.right.map((x) => x.label)).toEqual(["Email:", "Mobile:"]);
    expect(h.right[0]).toMatchObject({ value: "ananya@example.com", url: "mailto:ananya@example.com" });
    expect(h.right[1].url).toBeUndefined(); // a phone number is not a link
    expect(h.left[0].url).toBe("https://www.linkedin.com/in/ananya");
  });
  test("fields the student left blank are simply absent", () => {
    const h = buildResumeBlocks({ ...full(), contact: { github: "https://github.com/a" } })[0];
    expect(h.left.map((x) => x.label)).toEqual(["Github:"]);
    expect(h.right).toEqual([]);
  });
});

describe("the DEFAULT output is exactly the recommended format", () => {
  test("no markers, no legend, no verification notes anywhere unless asked for", () => {
    const json = JSON.stringify(buildResumeBlocks(full()));
    expect(json).not.toMatch(/\u2020|assessment-verified|verified certificate|Verified by|verified by|not yet verified/);
    expect(buildResumeBlocks(full()).flatMap((b) => b.blocks || []).some((x) => x.type === "note")).toBe(false);
    expect(section(buildResumeBlocks(full()), "Skills").blocks[0].text).toBe("C++, Python, SQL");
    expect(section(buildResumeBlocks(full()), "Education").blocks[0].note).toBe("");
  });
  test("asking for verification marks adds them (and only them)", () => {
    const plain = buildResumeBlocks(full());
    const marked = buildResumeBlocks(full(), MARKS);
    expect(JSON.stringify(marked)).toMatch(/assessment-verified/);
    expect(plain.map((b) => b.title)).toEqual(marked.map((b) => b.title)); // same sections, same order
  });
});

describe("skills: evidence markers", () => {
  test("* for assessment-verified, a dagger for certificate-backed, nothing for self-reported or non-platform skills", () => {
    const rows = section(buildResumeBlocks(full(), MARKS), "Skills").blocks;
    expect(rows[0]).toEqual({ type: "skillRow", label: "Languages", text: "C++*, Python\u2020, SQL" });
    expect(rows[1].text).toBe("Team Player");
  });
  test("the legend appears once, and names only the markers actually used", () => {
    const blocks = section(buildResumeBlocks(full(), MARKS), "Skills").blocks;
    expect(blocks.filter((x) => x.type === "note")).toEqual([{ type: "note", text: "* assessment-verified    \u2020 verified certificate" }]);
    const onlyAssessment = { ...full(), skillGroups: [{ label: "L", items: [{ name: "C", evidence: "assessment" }] }] };
    expect(section(buildResumeBlocks(onlyAssessment, MARKS), "Skills").blocks.find((x) => x.type === "note").text).toBe("* assessment-verified");
  });
  test("no markers means no legend", () => {
    const none = { ...full(), skillGroups: [{ label: "L", items: [{ name: "C", evidence: null }] }] };
    expect(section(buildResumeBlocks(none, MARKS), "Skills").blocks.some((x) => x.type === "note")).toBe(false);
  });
  test("the plain format (verificationMarks: false) has no markers and no legend", () => {
    const blocks = section(buildResumeBlocks(full(), { verificationMarks: false }), "Skills").blocks;
    expect(blocks[0].text).toBe("C++, Python, SQL");
    expect(blocks.some((x) => x.type === "note")).toBe(false);
  });
});

describe("projects, training, certificates", () => {
  test("a project: title, Link, date as Sep\u201926, bullets, and an italic Technologies line joined with ' | '", () => {
    const p = section(buildResumeBlocks(full()), "Projects").blocks[0];
    expect(p).toMatchObject({ type: "entry", title: "Campus Planner", link: "https://github.com/a/campus-planner", right: "Sep\u201926", bullets: ["Built X.", "Built Y."], footer: "Technologies: React | Node.js | MongoDB" });
  });
  test("no technologies means no Technologies line; no date means no right-hand text", () => {
    const p = section(buildResumeBlocks({ ...full(), projects: [{ title: "P", bullets: [], techStack: [] }] }), "Projects").blocks[0];
    expect(p.footer).toBe("");
    expect(p.right).toBe("");
  });
  test("training: title, Link, date and a paragraph", () => {
    expect(section(buildResumeBlocks(full()), "Training").blocks[0]).toMatchObject({ title: "Cloud Fundamentals", right: "Jul\u201926", paragraph: "Completed a course." });
  });
  test("a certificate: 'Title | Issuer', Aug\u201926, 'Cert No. ...' and its link", () => {
    const c = section(buildResumeBlocks(full()), "Certificates").blocks[0];
    expect(c).toMatchObject({ type: "cert", line: "Cloud Fundamentals | Skill Development Centre", right: "Aug\u201926", sub: "Cert No. 100200", link: "https://drive.google.com/x" });
  });
  test("the second line is 'result | Cert No. id', as in the template's 'O Grade| Cert No. ...'", () => {
    const sub = (x) => section(buildResumeBlocks({ ...full(), certificates: [{ title: "T", issuer: "I", ...x }] }), "Certificates").blocks[0].sub;
    expect(sub({ result: "O Grade", credentialId: "100200" })).toBe("O Grade | Cert No. 100200");
    expect(sub({ result: "O Grade" })).toBe("O Grade");
    expect(sub({ credentialId: "100200" })).toBe("Cert No. 100200");
    expect(sub({})).toBe("");
  });
  test("a certificate with no id and no link has no second line", () => {
    const c = section(buildResumeBlocks({ ...full(), certificates: [{ title: "T", issuer: "I" }] }), "Certificates").blocks[0];
    expect(c.sub).toBe("");
    expect(c.link).toBeUndefined();
  });
  test("the faculty-verified note is present, and absent in the plain format", () => {
    expect(section(buildResumeBlocks(full(), MARKS), "Certificates").blocks.at(-1)).toMatchObject({ type: "note", text: expect.stringMatching(/verified by university faculty/) });
    expect(section(buildResumeBlocks(full(), { verificationMarks: false }), "Certificates").blocks.some((x) => x.type === "note")).toBe(false);
  });
});

describe("education", () => {
  const edu = (blocks) => section(blocks, "Education").blocks;
  test("university entry: institution and location, degree, dates, 'Department; CGPA: x'", () => {
    expect(edu(buildResumeBlocks(full()))[0]).toMatchObject({
      institution: "Lovely Professional University", location: "Phagwara, Punjab", level: "Bachelor of Technology",
      dates: "Aug\u201924 \u2013 Present", detail: "Computer Science and Engineering; CGPA: 7.85",
    });
  });
  test("a start date with no end date reads as 'Present'; no dates at all prints no dates", () => {
    const e = (education) => edu(buildResumeBlocks({ ...full(), education: { ...full().education, ...education } }))[0].dates;
    expect(e({ start: "2024-08", end: undefined })).toBe("Aug\u201924 \u2013 Present");
    expect(e({ start: undefined, end: undefined })).toBe("");
    expect(e({ start: "2022-08", end: "2026-05" })).toBe("Aug\u201922 \u2013 May\u201926");
  });
  test("a CGPA of exactly 0 is still shown; a missing CGPA or department is omitted", () => {
    const d = (education) => edu(buildResumeBlocks({ ...full(), education: { ...full().education, ...education } }))[0].detail;
    expect(d({ cgpa: 0 })).toBe("Computer Science and Engineering; CGPA: 0");
    expect(d({ cgpa: null })).toBe("Computer Science and Engineering");
    expect(d({ department: "", cgpa: 8 })).toBe("CGPA: 8");
  });
  test("the verification note says verified (with the month) or not yet verified, and disappears in the plain format", () => {
    expect(edu(buildResumeBlocks(full(), MARKS))[0].note).toBe("Verified by the university (Oct\u201926)");
    expect(edu(buildResumeBlocks({ ...full(), education: { ...full().education, verified: false, verifiedOn: null } }, MARKS))[0].note).toBe("Academic details not yet verified by the university");
    expect(edu(buildResumeBlocks(full(), { verificationMarks: false }))[0].note).toBe("");
  });
  test("other education follows the university, with no verification note (it cannot be verified here)", () => {
    const e = edu(buildResumeBlocks(full()));
    expect(e).toHaveLength(2);
    expect(e[1]).toMatchObject({ institution: "Demo Public School", location: "Amritsar, Punjab", level: "Intermediate", dates: "Mar\u201923 \u2013 May\u201924", detail: "PCM; Percentage: 78%", note: "" });
  });
});

describe("date labels", () => {
  test.each([["2025-09", "Sep\u201925"], ["2026-01", "Jan\u201926"], ["2026-12", "Dec\u201926"], ["2025-13", ""], ["2025-00", ""], ["Sep 2025", ""], ["", ""], [undefined, ""]])(
    "monthLabel(%j) -> %j", (v, expected) => expect(monthLabel(v)).toBe(expected));
  test("dateLabel takes a Date or an ISO string, and never throws", () => {
    expect(dateLabel(new Date("2026-08-10"))).toBe("Aug\u201926");
    expect(dateLabel("2026-08-10T00:00:00Z")).toBe("Aug\u201926");
    expect(dateLabel("garbage")).toBe("");
    expect(dateLabel(null)).toBe("");
  });
  test("rangeLabel", () => {
    expect(rangeLabel("2024-08", "present")).toBe("Aug\u201924 \u2013 Present");
    expect(rangeLabel("2024-08", "PRESENT")).toBe("Aug\u201924 \u2013 Present");
    expect(rangeLabel("2024-08", undefined)).toBe("Aug\u201924");
    expect(rangeLabel(undefined, undefined)).toBe("");
  });
});

describe("pdfSafe and hostile text", () => {
  test.each([
    // kept: the template itself uses em dashes in titles and curly apostrophes in dates, and the font draws them
    ["\u201cquoted\u201d \u2018x\u2019", "\u201cquoted\u201d \u2018x\u2019"], ["a \u2013 b \u2014 c", "a \u2013 b \u2014 c"], ["wait\u2026", "wait\u2026"],
    ["\u2022 item \u00B7 item", "\u2022 item \u00B7 item"], ["caf\u00e9 na\u00efve", "caf\u00e9 na\u00efve"], ["\u20AC5 \u2122 \u2020", "\u20AC5 \u2122 \u2020"],
    // mapped, because the font has no glyph for them
    ["task \u2192 HH:MM", "task -> HH:MM"], ["a \u2190 b", "a <- b"], ["\u201Aa\u201E", ',a"'], ["\u25CF x", "\u2022 x"],
    ["\u2713 done", "? done"],
    ["\u0928\u092e\u0938\u094d\u0924\u0947", "??????"], ["a\u0000b\u0007c", "abc"], ["line1\nline2", "line1\nline2"], [null, ""], [undefined, ""], [42, "42"],
  ])("%j -> %j", (input, expected) => expect(pdfSafe(input)).toBe(expected));

  test("every user-supplied string in the layout is sanitised, so the PDF never receives a character it cannot draw", () => {
    const evil = "\u0928\u092e\u0938\u094d\u0924\u0947\u0000\u202E\uD83D\uDE00";
    const d = {
      ...full(), name: evil,
      skillGroups: [{ label: evil, items: [{ name: evil, evidence: null }] }],
      projects: [{ title: evil, bullets: [evil], techStack: [evil], date: "2026-01" }],
      training: [{ title: evil, description: evil }],
      certificates: [{ title: evil, issuer: evil, credentialId: evil }],
      education: { ...full().education, degree: evil, department: evil },
      otherEducation: [{ institution: evil, location: evil, level: evil, detail: evil }],
    };
    const json = JSON.stringify(buildResumeBlocks(d));
    expect(json).not.toMatch(/[\u0900-\u097F\u202E\uD83D]/);
    expect(json).not.toContain("\\u0000");
  });
});
