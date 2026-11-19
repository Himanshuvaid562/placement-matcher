/**
 * Paints the resume to match the placement cell's recommended format (a Word template) as closely as a
 * PDF can: A4, Arial-metric Helvetica at 10 pt, navy name, small-caps section headings with a thin rule,
 * label/value skill rows, bullets whose wrapped lines return to the bullet, dates at the right.
 *
 * Every number below was MEASURED from that template (baselines, left edges, sizes, colours, rules), not
 * guessed. Positions are driven by text BASELINES, so spacing is exact. Real selectable text, built-in
 * fonts (Latin-1 only: see pdfSafe).
 */
const PDFDocument = require("pdfkit");
const { buildResumeBlocks, pdfSafe } = require("./resumeLayout");

// ---- colours measured from the template ----
const C = {
  name: "#2D2F92", heading: "#473992", label: "#2D2F92", title: "#2C2F91",
  body: "#000000", grey: "#585858", linkA: "#00007F", linkB: "#0462C1",
};

// ---- geometry measured from the template (points, from the page's left/top edge) ----
const G = {
  nameX: 33.9, nameBase: 50,
  contactLabelX: 33.6, contactValueX: 77.5, contactRight: 561, contactPitch: 14, contactFirst: 15, // below the name's baseline
  headingX: 33.7, firstHeadingGap: 21, ruleX0: 33.5, ruleX1: 556.9, ruleWidth: 0.4, ruleBelowBase: 3.4, headingGap: 20, firstBelowRule: 11,
  skillLabelX: 35.1, skillValueX: 136.7, skillPitch: 14.5,
  titleX: 35.9, bulletX: 39.9, bulletIndent: 5.6, textRight: 566, dateRight: 563.3,
  descX: 36.0, certX: 36.0, eduX: 35.1, eduRight: 555.5,
  line: 11.56, wideLine: 13.6, // 10 pt line height of the library, and the template's 1.18 spacing for paragraphs
  bottom: 26, newPageBase: 40,
};
const ASC = 0.718; // Helvetica ascent: baseline = top + ASC * size
const topOf = (base, size) => base - ASC * size;

function renderResumePdf(data, { verifyUrl, qrPng, verificationMarks = false } = {}) {
  return new Promise((resolve, reject) => {
    // Built inside the promise so that bad input REJECTS, instead of throwing before a promise exists.
    const blocks = buildResumeBlocks(data, { verificationMarks });
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 14, bottom: 14, left: 14, right: 14 },
      info: { Title: pdfSafe(`${data.name} - Resume`), Author: pdfSafe(data.name), Creator: "LPU Placement Readiness platform" },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const FONT = { r: "Helvetica", b: "Helvetica-Bold", i: "Helvetica-Oblique" };
    let base = 0;        // baseline of the last line drawn
    let afterHeader = false;
    let fresh = true;    // the next element is the first below a heading/header: it adds no gap
    const BOTTOM = doc.page.height - G.bottom;

    const setFont = (f, size, color) => doc.font(FONT[f]).fontSize(size).fillColor(color);
    const widthOf = (str, f, size) => setFont(f, size, C.body).widthOfString(str);
    const advance = (gap) => { if (fresh) fresh = false; else base += gap; };
    const need = (h) => {
      if (base + h > BOTTOM) { doc.addPage(); base = G.newPageBase; fresh = true; }
    };

    // one line of text at a baseline
    function put(str, x, b, f, size, color, extra = {}) {
      setFont(f, size, color).text(str, x, topOf(b, size), { lineBreak: false, ...extra });
    }
    function putRight(str, right, b, f, size, color) {
      put(str, right - widthOf(str, f, size), b, f, size, color);
    }
    // wrapped paragraph: returns the baseline of its last line. `indent` indents the FIRST line only.
    function paragraph(str, x, b, width, { f = "r", size = 10, color = C.body, indent = 0, pitch = G.line } = {}) {
      setFont(f, size, color);
      const lineGap = pitch - doc.currentLineHeight(true);
      const lines = Math.max(1, Math.round(doc.heightOfString(str, { width, indent }) / doc.currentLineHeight(true)));
      doc.text(str, x, topOf(b, size), { width, indent, lineGap });
      return { last: b + (lines - 1) * pitch, lines };
    }

    // ---------------- header ----------------
    function header(b) {
      put(b.name, G.nameX, G.nameBase, "b", 20, C.name);
      base = G.nameBase;
      const rows = Math.max(b.left.length, b.right.length);
      const pair = (item, labelX, valueX, bl) => {
        put(`${item.label} `, labelX, bl, "r", 10, C.body);
        put(item.value, valueX, bl, "r", 10, item.url ? C.linkA : C.body, item.url ? { link: item.url, underline: true } : {});
      };
      b.left.forEach((item, i) => pair(item, G.contactLabelX, G.contactValueX, G.nameBase + G.contactFirst + i * G.contactPitch));
      b.right.forEach((item, i) => {
        const w = widthOf(`${item.label} ${item.value}`, "r", 10);
        const x = G.contactRight - w;
        pair(item, x, x + widthOf(`${item.label} `, "r", 10), G.nameBase + G.contactFirst + i * G.contactPitch);
      });
      if (rows) base = G.nameBase + G.contactFirst + (rows - 1) * G.contactPitch;
      fresh = false;
      afterHeader = true;
    }

    // ---------------- section heading: small caps, navy-violet, thin rule ----------------
    function heading(title) {
      need(70);
      // the template leaves one point more between the contact lines and the first heading
      if (!fresh || base === 0) base += afterHeader ? G.firstHeadingGap : G.headingGap;
      afterHeader = false;
      const first = title[0].toUpperCase();
      const rest = title.slice(1).toUpperCase();
      // Small caps: a 12 pt capital followed by 9.6 pt capitals on the same baseline. The second piece must not
      // start even a hair AFTER the first ends, or text extractors read "S KILLS" instead of "SKILLS". It overlaps by
      // 0.35 pt (invisible), which also absorbs rounding in the PDF's coordinates.
      put(first, G.headingX, base, "r", 12, C.heading);
      put(rest, G.headingX + widthOf(first, "r", 12) - 0.35, base, "r", 9.6, C.heading);
      const ruleY = base + G.ruleBelowBase;
      doc.moveTo(G.ruleX0, ruleY).lineTo(G.ruleX1, ruleY).lineWidth(G.ruleWidth).strokeColor("#000000").stroke();
      base = ruleY + G.firstBelowRule;
      fresh = true;
    }

    const paint = {
      skillRow(b) {
        need(G.skillPitch * 2);
        advance(G.skillPitch);
        const labelW = widthOf(b.label, "b", 10);
        put(b.label, G.skillLabelX, base, "b", 10, C.label);
        put(":", G.skillLabelX + labelW, base, "r", 10, C.body);
        const x = Math.max(G.skillValueX, G.skillLabelX + labelW + 12);
        base = paragraph(b.text, x, base, G.textRight - x).last;
      },

      note(b) {
        need(14);
        advance(G.line);
        put(b.text, G.titleX, base, "i", 8.5, C.grey);
      },

      // project / training entry: title + Link + date, then bullets or a paragraph, then Technologies
      entry(b) {
        const dateW = b.right ? widthOf(b.right, "r", 10) + 10 : 0;
        const linkColor = b.paragraph !== undefined ? C.linkB : C.linkA; // the template uses two blues
        need(40);
        advance(16);
        const startBase = base;
        const titleWidth = G.dateRight - G.titleX - dateW - 4;
        setFont("b", 10, C.title);
        const lh = doc.currentLineHeight(true);
        const full = b.link ? `${b.title}  Link` : b.title;
        const lines = Math.max(1, Math.round(doc.heightOfString(full, { width: titleWidth }) / lh));
        if (b.link) {
          doc.text(b.title, G.titleX, topOf(base, 10), { width: titleWidth, continued: true });
          setFont("r", 10, C.title).text("  ", { continued: true, underline: false });
          setFont("r", 10, linkColor).text("Link", { link: b.link, underline: true });
        } else {
          doc.text(b.title, G.titleX, topOf(base, 10), { width: titleWidth });
        }
        if (b.right) putRight(b.right, G.dateRight, startBase, "r", 10, C.body);
        base = startBase + (lines - 1) * G.line;

        if (b.paragraph) {
          advance(0); base += 13.5;
          base = paragraph(b.paragraph, G.descX, base, G.textRight - G.descX, { pitch: G.wideLine }).last;
        }
        b.bullets.forEach((t, i) => {
          base += i === 0 ? 13.5 : 13;
          put("\u2022", G.bulletX, base, "r", 10, C.body);
          base = paragraph(t, G.bulletX, base, G.textRight - G.bulletX, { indent: G.bulletIndent }).last;
        });
        if (b.footer) {
          base += 13;
          base = paragraph(b.footer, G.titleX, base, G.textRight - G.titleX, { f: "i", color: C.grey }).last;
        }
      },

      cert(b) {
        need(34);
        advance(G.wideLine + 0.4);
        const startBase = base;
        const dateW = b.right ? widthOf(b.right, "r", 10) + 14 : 0;
        base = paragraph(b.line, G.certX, base, G.dateRight - G.certX - dateW, { pitch: G.wideLine }).last;
        if (b.right) putRight(b.right, G.dateRight, startBase, "r", 10, C.body);
        if (b.sub || b.link) {
          base += G.wideLine;
          const sub = b.sub ? `${b.sub} ` : "";
          put(sub, G.certX, base, "r", 10, C.body);
          if (b.link) put("Link", G.certX + widthOf(sub, "r", 10), base, "r", 10, C.linkB, { link: b.link, underline: true });
        }
      },

      edu(b) {
        need(46);
        advance(17);
        put(b.institution, G.eduX, base, "b", 10, C.label);
        if (b.location) putRight(b.location, G.eduRight, base, "r", 10, C.body);
        if (b.level || b.dates) {
          base += G.line - 0.06;
          if (b.level) put(b.level, G.eduX, base, "r", 10, C.body);
          if (b.dates) putRight(b.dates, G.eduRight, base, "r", 10, C.body);
        }
        if (b.detail) { base += 12; put(b.detail, G.eduX, base, "r", 10, C.body); }
        if (b.note) { base += 11; put(b.note, G.eduX, base, "i", 8.5, C.grey); }
      },
    };

    for (const b of blocks) {
      if (b.type === "header") header(b);
      else if (b.type === "section") {
        heading(b.title);
        for (const inner of b.blocks) paint[inner.type](inner);
      }
    }

    // ---- verification footer (only when the student asks for a link + QR) ----
    if (verifyUrl) {
      need(90);
      base += 28;
      const y = topOf(base, 9);
      setFont("b", 9, C.name).text("Confirm the verified details on this resume", G.headingX, y, { width: 440, lineBreak: false });
      setFont("r", 8.5, C.grey).text("Open the link or scan the code. It shows only what the university has verified, and it expires.", G.headingX, y + 12, { width: 440 });
      setFont("r", 8.5, C.linkA).text(pdfSafe(verifyUrl), G.headingX, y + 24, { width: 440, link: verifyUrl, underline: true });
      if (qrPng) doc.image(qrPng, G.eduRight - 62, y - 4, { width: 64 });
    }

    doc.end();
  });
}

module.exports = { renderResumePdf, pdfSafe };
