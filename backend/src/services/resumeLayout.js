/**
 * The resume's content, in the placement cell's recommended format, as an ordered list of blocks
 * (pure, no PDF library). pdfService paints these blocks; tests read them.
 *
 *   Header -> Skills -> Projects -> Training -> Certificates -> Education
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_DASH = "\u2013";
const DAGGER = "\u2020";

// Characters outside Latin-1 that the built-in PDF font (Helvetica, WinAnsi) really draws. The template uses
// them (em dashes in titles, curly apostrophes in dates), so they are kept, not flattened to ASCII.
const WINANSI_EXTRA = "\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u2020\u20AC\u2122";
const NOT_DRAWABLE = new RegExp(`[^\\x09\\x0A\\x0D\\x20-\\x7E\\xA0-\\xFF${WINANSI_EXTRA}]`, "g");

/** Keep the PDF's fonts honest: map what we can, drop control characters, replace what the font cannot draw. */
function pdfSafe(input) {
  return String(input ?? "")
    .replace(/\u2192/g, "->").replace(/\u2190/g, "<-").replace(/\u21D2/g, "=>")
    .replace(/\u201A/g, ",").replace(/\u201E/g, '"').replace(/\u2212/g, "-")
    .replace(/[\u25CF\u25AA]/g, "\u2022")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(NOT_DRAWABLE, "?");
}

/** "2025-09" -> "Sep\u201925" (the template's date style, with a curly apostrophe) */
function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? ""));
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]}\u2019${m[1].slice(2)}` : "";
}

/** A Date (or ISO string) -> "Aug'26" */
function dateLabel(d) {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : monthLabel(t.toISOString().slice(0, 7));
}

/** ("2024-08", "present") -> "Aug'24 - Present" */
function rangeLabel(start, end) {
  const s = monthLabel(start);
  const e = /^present$/i.test(String(end ?? "")) ? "Present" : monthLabel(end);
  return s && e ? `${s} ${EN_DASH} ${e}` : s || e || "";
}

const MARKER = { assessment: "*", certificate: DAGGER };
const MARKER_MEANING = { assessment: "assessment-verified", certificate: "verified certificate" };

// verificationMarks is OPT-IN: by default the output is exactly the recommended format.
function buildResumeBlocks(data, { verificationMarks = false } = {}) {
  const marks = verificationMarks === true;
  const c = data.contact || {};
  const blocks = [];

  // ---- header: LinkedIn/GitHub on the left, email/phone on the right ----
  const left = [
    c.linkedin && { label: "LinkedIn:", value: pdfSafe(c.linkedin), url: c.linkedin },
    c.github && { label: "Github:", value: pdfSafe(c.github), url: c.github },
    c.portfolio && { label: "Portfolio:", value: pdfSafe(c.portfolio), url: c.portfolio },
  ].filter(Boolean);
  const right = [
    c.email && { label: "Email:", value: pdfSafe(c.email), url: `mailto:${c.email}` },
    c.phone && { label: "Mobile:", value: pdfSafe(c.phone) },
  ].filter(Boolean);
  blocks.push({ type: "header", name: pdfSafe(data.name), left, right });

  // ---- Skills: labelled groups; items backed by evidence carry a marker ----
  const groups = data.skillGroups || [];
  if (groups.length) {
    const used = new Set();
    const rows = groups.map((g) => ({
      type: "skillRow",
      label: pdfSafe(g.label),
      text: g.items
        .map((i) => {
          const marker = marks && i.evidence ? MARKER[i.evidence] || "" : "";
          if (marker) used.add(i.evidence);
          return `${pdfSafe(i.name)}${marker}`;
        })
        .join(", "),
    }));
    const legend = ["assessment", "certificate"].filter((k) => used.has(k)).map((k) => `${MARKER[k]} ${MARKER_MEANING[k]}`).join("    ");
    blocks.push({ type: "section", title: "Skills", blocks: [...rows, ...(legend ? [{ type: "note", text: legend }] : [])] });
  }

  // ---- Projects: title + Link + date, bullets, italic Technologies line ----
  if (data.projects?.length) {
    blocks.push({
      type: "section", title: "Projects",
      blocks: data.projects.map((p) => ({
        type: "entry", title: pdfSafe(p.title), link: p.link, right: monthLabel(p.date),
        bullets: (p.bullets || []).map(pdfSafe),
        footer: p.techStack?.length ? `Technologies: ${p.techStack.map(pdfSafe).join(" | ")}` : "",
      })),
    });
  }

  // ---- Training ----
  if (data.training?.length) {
    blocks.push({
      type: "section", title: "Training",
      blocks: data.training.map((t) => ({
        type: "entry", title: pdfSafe(t.title), link: t.link, right: monthLabel(t.date),
        paragraph: pdfSafe(t.description), bullets: [], footer: "",
      })),
    });
  }

  // ---- Certificates: faculty-verified only ----
  if (data.certificates?.length) {
    const certs = data.certificates.map((x) => ({
      type: "cert",
      line: pdfSafe(`${x.title} | ${x.issuer}`),
      right: dateLabel(x.issueDate),
      // second line, as in the template: "<result> | Cert No. <id>" then a Link
      sub: [x.result ? pdfSafe(x.result) : "", x.credentialId ? `Cert No. ${pdfSafe(x.credentialId)}` : ""].filter(Boolean).join(" | "),
      link: x.link,
    }));
    blocks.push({
      type: "section", title: "Certificates",
      blocks: [...certs, ...(marks ? [{ type: "note", text: "Each certificate listed here has been verified by university faculty." }] : [])],
    });
  }

  // ---- Education: the university entry (CGPA from the verified record), then any others ----
  const e = data.education || {};
  const detail = [e.department, e.cgpa != null ? `CGPA: ${e.cgpa}` : ""].filter(Boolean).join("; ");
  const verifiedOn = e.verifiedOn ? dateLabel(e.verifiedOn) : "";
  const note = !marks ? "" : e.verified ? `Verified by the university${verifiedOn ? ` (${verifiedOn})` : ""}` : "Academic details not yet verified by the university";
  const education = [{
    type: "edu",
    institution: pdfSafe(e.institution || "Lovely Professional University"),
    location: pdfSafe(e.location || ""),
    level: pdfSafe(e.degree || "Bachelor of Technology"),
    dates: rangeLabel(e.start, e.end || (e.start ? "present" : undefined)),
    detail: pdfSafe(detail),
    note,
  }];
  for (const o of data.otherEducation || []) {
    education.push({
      type: "edu", institution: pdfSafe(o.institution), location: pdfSafe(o.location || ""), level: pdfSafe(o.level || ""),
      dates: rangeLabel(o.start, o.end), detail: pdfSafe(o.detail || ""), note: "",
    });
  }
  blocks.push({ type: "section", title: "Education", blocks: education });

  return blocks;
}

module.exports = { buildResumeBlocks, pdfSafe, monthLabel, dateLabel, rangeLabel, MARKER, DAGGER };
