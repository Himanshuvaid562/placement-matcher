const zlib = require("zlib");
const PDFDocument = require("pdfkit");
const { renderResumePdf, pdfSafe } = require("../src/services/pdfService");

// Reads the text runs back out of the PDF's content streams (no PDF library needed):
//   "1 0 0 1 <x> <y> Tm  /F1 <size> Tf  [<hex> kern <hex>] TJ"
function textRuns(pdf) {
  const raw = pdf.toString("latin1");
  const measure = new PDFDocument().font("Helvetica");
  const runs = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try { content = zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { continue; }
    for (const t of content.matchAll(/BT\s+1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s+\/F(\d+) ([\d.]+) Tf\s+\[(.*?)\] TJ\s+ET/g)) {
      const text = [...t[5].matchAll(/<([0-9a-f]*)>/gi)].map((h) => Buffer.from(h[1], "hex").toString("latin1")).join("");
      const size = Number(t[4]);
      runs.push({ x: Number(t[1]), baseline: 841.89 - Number(t[2]), size, text, width: measure.fontSize(size).widthOfString(text) });
    }
  }
  return runs;
}

const full = () => ({
  name: "Ananya Sharma",
  contact: { linkedin: "https://www.linkedin.com/in/ananya", github: "https://github.com/ananya", email: "ananya@example.com", phone: "+91 98765 43210" },
  skillGroups: [
    { label: "Languages", items: [{ name: "C++", evidence: "assessment" }, { name: "Python", evidence: "certificate" }, { name: "SQL", evidence: null }] },
    { label: "Web Technologies", items: ["HTML", "CSS", "React.js", "Node.js", "Express.js"].map((name) => ({ name, evidence: null })) },
    { label: "Soft Skills", items: ["Problem-Solving", "Team Player"].map((name) => ({ name, evidence: null })) },
  ],
  skills: [],
  projects: [
    { title: "Campus Planner - Event Dashboard", link: "https://github.com/a/campus-planner", date: "2026-09", bullets: ["Built a booking dashboard with login, event search and calendar views.", "Designed REST endpoints and database queries for attendance reports.", "Created a responsive interface with charts for organisers."], techStack: ["React", "Node.js", "MongoDB"] },
    { title: "Study Buddy Chatbot", link: "https://github.com/a/bot", date: "2026-05", bullets: ["Built a study-reminder chatbot with Flask and MongoDB."], techStack: ["Python", "Flask"] },
  ],
  training: [{ title: "Cloud Fundamentals", link: "https://drive.google.com/x", date: "2026-07", description: "Completed a workshop covering containers and deployment." }],
  certificates: [{ title: "Cloud Fundamentals", issuer: "Skill Development Centre", issueDate: "2026-08-10T00:00:00Z", credentialId: "100200", link: "https://drive.google.com/x" }],
  education: { institution: "Lovely Professional University", location: "Phagwara, Punjab", degree: "Bachelor of Technology", start: "2024-08", end: "present", department: "Computer Science and Engineering", cgpa: 7.85, verified: true, verifiedOn: "2026-10-01T00:00:00Z" },
  otherEducation: [{ institution: "Demo Public School", location: "Amritsar, Punjab", level: "Intermediate", start: "2023-03", end: "2024-05", detail: "PCM; Percentage: 78%" }],
});

// Count PDF objects of a kind in the raw bytes (page and annotation dictionaries are not compressed)
const count = (buf, re) => (buf.toString("latin1").match(re) || []).length;
const pages = (buf) => count(buf, /\/Type \/Page(?!s)/g);
const links = (buf) => count(buf, /\/Subtype \/Link/g);

describe("section headings (small caps) read as whole words", () => {
  // A 12 pt capital then 9.6 pt capitals. If the second piece starts even slightly AFTER the first ends,
  // text extractors read "S KILLS", which can stop a screening system recognising the section.
  test("each heading's second piece starts at, or just inside, where the first piece ends", async () => {
    const runs = textRuns(await renderResumePdf(full()));
    const firsts = runs.filter((r) => r.size === 12 && r.text.length === 1);
    expect(firsts.map((r) => r.text).join("")).toBe("SPTCE"); // Skills, Projects, Training, Certificates, Education
    for (const first of firsts) {
      const second = runs.find((r) => r.size === 9.6 && Math.abs(r.baseline - first.baseline) < 0.01 && r.x > first.x);
      expect(second).toBeDefined();
      const gap = second.x - (first.x + first.width);
      expect(gap).toBeLessThanOrEqual(0);   // never a gap
      expect(gap).toBeGreaterThan(-1);      // and never a visible overlap
    }
  });

  test("the headings spell the template's five section names, in order", async () => {
    const runs = textRuns(await renderResumePdf(full()));
    const words = runs.filter((r) => r.size === 12 && r.text.length === 1).map((first) => {
      const rest = runs.find((r) => r.size === 9.6 && Math.abs(r.baseline - first.baseline) < 0.01 && r.x > first.x);
      return first.text + rest.text;
    });
    expect(words).toEqual(["SKILLS", "PROJECTS", "TRAINING", "CERTIFICATES", "EDUCATION"]);
  });
});

describe("renderResumePdf", () => {
  test("the default output has no verification marks or notes; asking for them adds the text", async () => {
    const all = (pdf) => textRuns(pdf).map((r) => r.text).join(" ");
    const plain = all(await renderResumePdf(full()));
    const marked = all(await renderResumePdf(full(), { verificationMarks: true }));
    expect(plain).not.toMatch(/Verified by the university|verified by university faculty|assessment-verified/);
    expect(marked).toMatch(/Verified by the university/);
    expect(marked).toMatch(/verified by university faculty/);
  });

  test("measurements from the template: A4 text sizes, name 20 pt, body 10 pt", async () => {
    const runs = textRuns(await renderResumePdf(full()));
    expect(runs.find((r) => r.text === "Ananya Sharma").size).toBe(20);
    expect(runs.find((r) => r.text.startsWith("Built a booking")).size).toBe(10);
    expect(runs.find((r) => r.text.startsWith("Technologies:")).size).toBe(10);
  });

  test("produces a real PDF", async () => {
    const pdf = await renderResumePdf(full());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-8).toString()).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  test("a typical resume fits on ONE A4 page, like the recommended format", async () => {
    expect(pages(await renderResumePdf(full()))).toBe(1);
    expect(pages(await renderResumePdf(full(), { verificationMarks: false }))).toBe(1);
  });

  test("every Link in the format is a real clickable link", async () => {
    // linkedin, github, mailto, 2 projects, training, certificate = 7
    expect(links(await renderResumePdf(full(), { verificationMarks: false }))).toBeGreaterThanOrEqual(7);
  });

  test("the verification footer adds a clickable link (and an image when a QR code is given)", async () => {
    const without = await renderResumePdf(full());
    const withUrl = await renderResumePdf(full(), { verifyUrl: "http://localhost:3000/verify/abc" });
    expect(links(withUrl)).toBe(links(without) + 1);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const withQr = await renderResumePdf(full(), { verifyUrl: "http://localhost:3000/verify/abc", qrPng: png });
    // a PNG with transparency is stored as the picture plus its mask, so "at least one", not "exactly one"
    expect(count(withQr, /\/Subtype \/Image/g)).toBeGreaterThanOrEqual(1);
    expect(count(withUrl, /\/Subtype \/Image/g)).toBe(0);
  });

  test("the plain format renders too (no footer, no marks)", async () => {
    const pdf = await renderResumePdf(full(), { verificationMarks: false });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("a name-only resume still renders (the Education heading is always there)", async () => {
    const pdf = await renderResumePdf({ name: "A", contact: {}, skillGroups: [], projects: [], training: [], certificates: [], education: {}, otherEducation: [] });
    expect(pages(pdf)).toBe(1);
  });

  test("hostile and non-Latin text never breaks rendering", async () => {
    const evil = "\u0928\u092e\u0938\u094d\u0924\u0947\u0000\u202E\uD83D\uDE00 ((( \\\\ <script>";
    const d = full();
    d.name = evil; d.skillGroups[0].label = evil; d.projects[0].title = evil; d.projects[0].bullets = [evil];
    d.education.degree = evil; d.otherEducation[0].detail = evil;
    const pdf = await renderResumePdf(d, { verifyUrl: "http://localhost:3000/verify/abc" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("very long content flows onto more pages instead of being cut off or crashing", async () => {
    const d = full();
    const long = "word ".repeat(40).trim();
    d.projects = Array.from({ length: 5 }, (_, i) => ({ title: `Project ${i}`, link: "https://github.com/a/b", date: "2026-01", bullets: [long, long, long, long], techStack: ["a", "b", "c"] }));
    d.training = Array.from({ length: 3 }, (_, i) => ({ title: `Training ${i}`, date: "2026-01", description: long }));
    d.certificates = Array.from({ length: 12 }, (_, i) => ({ title: `Certificate ${i}`, issuer: "Issuer", issueDate: "2026-01-01T00:00:00Z", credentialId: String(i) }));
    const pdf = await renderResumePdf(d, { verifyUrl: "http://localhost:3000/verify/abc" });
    expect(pages(pdf)).toBeGreaterThan(1);
  });

  test("rejects (does not hang) if the PDF library fails", async () => {
    await expect(renderResumePdf(null)).rejects.toBeDefined();
  });

  test("pdfSafe is exported for callers that build their own text", () => {
    expect(pdfSafe("task \u2192 x")).toBe("task -> x");
  });
});
