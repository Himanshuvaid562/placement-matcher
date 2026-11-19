"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, apiDownload } from "../../lib/api";

const TIER = {
  assessment: { label: "Assessment-verified", cls: "bg-green-50 text-green-700" },
  certificate: { label: "Certificate-backed", cls: "bg-sky-50 text-sky-700" },
  self: { label: "Self-reported", cls: "bg-amber-50 text-amber-700" },
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

// The group names the placement cell's format uses; students can rename, remove or add (up to 6)
const DEFAULT_GROUPS = ["Languages", "Web Technologies", "Database & Tools", "Soft Skills"].map((label) => ({ label, itemsText: "" }));

const emptyForm = {
  fullName: "",
  contact: { email: "", phone: "", linkedin: "", github: "", portfolio: "" },
  skillGroups: DEFAULT_GROUPS,
  projects: [],
  training: [],
  education: { degree: "Bachelor of Technology", start: "", end: "", present: true },
  otherEducation: [],
};

const toForm = (r) => ({
  fullName: r.fullName || "",
  contact: { ...emptyForm.contact, ...(r.contact || {}) },
  skillGroups: r.skillGroups?.length ? r.skillGroups.map((g) => ({ label: g.label, itemsText: (g.items || []).join(", ") })) : DEFAULT_GROUPS,
  projects: (r.projects || []).map((p) => ({ title: p.title || "", link: p.link || "", date: p.date || "", bulletsText: (p.bullets || []).join("\n"), techText: (p.techStack || []).join(", ") })),
  training: (r.training || []).map((t) => ({ title: t.title || "", link: t.link || "", date: t.date || "", description: t.description || "" })),
  education: {
    degree: r.education?.degree || "Bachelor of Technology",
    start: r.education?.start || "",
    end: /^present$/i.test(r.education?.end || "") ? "" : r.education?.end || "",
    present: !r.education?.end || /^present$/i.test(r.education?.end),
  },
  otherEducation: (r.otherEducation || []).map((e) => ({
    institution: e.institution || "", location: e.location || "", level: e.level || "", start: e.start || "",
    end: /^present$/i.test(e.end || "") ? "" : e.end || "", present: /^present$/i.test(e.end || ""), detail: e.detail || "",
  })),
});

const blank = (v) => (String(v ?? "").trim() === "" ? undefined : String(v).trim());

// Split on commas that are NOT inside brackets, so "Linux (Arch, Kali, Ubuntu), Vercel" is two items
function splitItems(text) {
  const items = [];
  let depth = 0, cur = "";
  for (const ch of String(text)) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === "\n") && depth === 0) { items.push(cur); cur = ""; } else cur += ch;
  }
  items.push(cur);
  return items.map((s) => s.trim()).filter(Boolean);
}

function toPayload(f) {
  const range = (o) => ({ start: blank(o.start), end: o.present ? "present" : blank(o.end) });
  return {
    fullName: f.fullName.trim(),
    contact: Object.fromEntries(Object.entries(f.contact).map(([k, v]) => [k, blank(v)]).filter(([, v]) => v !== undefined)),
    skillGroups: f.skillGroups.map((g) => ({ label: g.label.trim(), items: splitItems(g.itemsText) })).filter((g) => g.label && g.items.length),
    projects: f.projects.filter((p) => p.title.trim()).map((p) => ({
      title: p.title.trim(), link: blank(p.link), date: blank(p.date),
      bullets: p.bulletsText.split("\n").map((b) => b.trim()).filter(Boolean), techStack: splitItems(p.techText),
    })),
    training: f.training.filter((t) => t.title.trim()).map((t) => ({ title: t.title.trim(), link: blank(t.link), date: blank(t.date), description: t.description.trim() })),
    education: { degree: blank(f.education.degree), ...(f.education.start || f.education.end || f.education.present ? range(f.education) : {}) },
    otherEducation: f.otherEducation.filter((e) => e.institution.trim()).map((e) => ({
      institution: e.institution.trim(), location: blank(e.location), level: blank(e.level), ...range(e), detail: blank(e.detail),
    })),
  };
}

const input = "border rounded-md px-3 py-2 w-full";
const small = "text-xs text-slate-400";

function Section({ title, hint, action, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-medium">{title}</h3>{hint && <p className={small}>{hint}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
const Add = ({ onClick, children }) => <button type="button" onClick={onClick} className="text-xs text-indigo-600 whitespace-nowrap">{children}</button>;
const Remove = ({ onClick }) => <button type="button" onClick={onClick} className="text-xs text-slate-400 hover:text-red-600">Remove</button>;

export default function ResumePage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [roles, setRoles] = useState([]);
  const [shares, setShares] = useState([]);
  const [created, setCreated] = useState(null); // { url, token, qr }
  const [opts, setOpts] = useState({ expiresInDays: 30, showCgpa: true, showRegistrationNumber: false });
  const [marks, setMarks] = useState(false); // OFF by default: the PDF is exactly the recommended format
  const [check, setCheck] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const [r, s, o] = await Promise.all([api("/students/me/resume"), api("/students/me/resume/shares"), api("/opportunities")]);
    setData(r);
    setForm(r.saved ? toForm(r.resume) : emptyForm);
    setShares(s.data);
    setRoles(o.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setContact = (k, v) => setForm((f) => ({ ...f, contact: { ...f.contact, [k]: v } }));
  const setEdu = (patch) => setForm((f) => ({ ...f, education: { ...f.education, ...patch } }));
  const setItem = (list, i, patch) => setForm((f) => ({ ...f, [list]: f[list].map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }));
  const addItem = (list, item) => setForm((f) => ({ ...f, [list]: [...f[list], item] }));
  const removeItem = (list, i) => setForm((f) => ({ ...f, [list]: f[list].filter((_, idx) => idx !== i) }));

  async function run(name, fn) {
    setBusy(name); setError(""); setMessage("");
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  const save = () => run("save", async () => {
    const res = await api("/students/me/resume", { method: "PUT", body: toPayload(form) });
    setData(res);
    setForm(toForm(res.resume));
    setMessage("Resume saved.");
  });

  const createLink = () => run("link", async () => {
    const res = await api("/students/me/resume/shares", { method: "POST", body: opts });
    setCreated({ url: res.url, token: res.token, qr: await QRCode.toDataURL(res.url, { margin: 1, width: 220 }) });
    setShares((await api("/students/me/resume/shares")).data);
  });

  const pdf = (withLink) => run("pdf", () =>
    apiDownload("/students/me/resume/pdf", "resume.pdf", { method: "POST", body: { verificationMarks: marks, ...(withLink ? { shareToken: created.token } : {}) } }));

  const revoke = (id) => run("revoke", async () => {
    await api(`/students/me/resume/shares/${id}`, { method: "DELETE" });
    setShares((await api("/students/me/resume/shares")).data);
    if (created) setCreated(null);
  });

  const runCheck = (id) => run("check", async () => setCheck(id ? await api(`/students/me/resume/check/${id}`) : null));

  if (error && !data) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const { preview } = data;
  const edu = preview.education;

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Resume</h1>
        <p className="text-sm text-slate-500 mt-1">
          The PDF is produced in the placement cell&apos;s recommended format: Skills, Projects, Training, Certificates, Education.
          You write the personal parts; your department, CGPA and certificates come from verified records, so the resume cannot overstate them.
          A recruiter can confirm them through a link or QR code, without a login.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      {/* ---------- pulled from verified data ---------- */}
      <section className="border border-slate-200 rounded-lg p-4 space-y-3">
        <h2 className="font-medium">Filled in automatically</h2>
        <div className="text-sm">
          <p className="font-medium">{edu.institution}{edu.location ? `, ${edu.location}` : ""}</p>
          <p>{edu.department || "Department not set"}{edu.cgpa != null ? `; CGPA: ${edu.cgpa}` : ""}</p>
          {edu.verified
            ? <p className="text-green-700 text-xs">✓ Verified by the university{edu.verifiedOn ? ` on ${fmt(edu.verifiedOn)}` : ""}</p>
            : <p className="text-amber-700 text-xs">Not verified yet. The resume will say so, and recruiters will see no academic figures. Verify on your Profile page.</p>}
        </div>
        <div>
          <p className={`${small} mb-1`}>Skills the platform can back. Any of these you list below get a mark in the PDF: * assessment-verified, † verified certificate.</p>
          <div className="flex flex-wrap gap-2">
            {preview.skills.map((s) => (
              <span key={s.skillId} className={`text-xs rounded-full px-2 py-1 ${TIER[s.evidence].cls}`} title={TIER[s.evidence].label}>{s.name} · {s.level}/5</span>
            ))}
            {preview.skills.length === 0 && <span className="text-xs text-slate-400">No skills recorded yet. Add some on your Profile page.</span>}
          </div>
        </div>
        <div className="text-sm">
          {preview.certificates.map((c) => <p key={c.title + c.issuer}>✓ {c.title} <span className="text-slate-400">· {c.issuer}</span></p>)}
          {data.pendingCertificates > 0 && (
            <p className="text-xs text-slate-400 mt-1">{data.pendingCertificates} certificate{data.pendingCertificates > 1 ? "s are" : " is"} waiting for faculty and will appear in Certificates once verified.</p>
          )}
        </div>
      </section>

      {/* ---------- what you write ---------- */}
      <section className="space-y-7">
        <Section title="Header" hint="Contact details appear on your PDF only. They are never shown on the recruiter verification page.">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input className={input} placeholder="Full name (English letters, as on your ID)" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
              <p className={`${small} mt-1`}>PDF fonts cover Latin letters only; other scripts print as “?”.</p>
            </div>
            {[["linkedin", "LinkedIn link (https://…)"], ["github", "GitHub link (https://…)"], ["email", "Email"], ["phone", "Mobile"], ["portfolio", "Portfolio link (optional)"]].map(([k, ph]) => (
              <input key={k} className={input} placeholder={ph} value={form.contact[k]} onChange={(e) => setContact(k, e.target.value)} />
            ))}
          </div>
        </Section>

        <Section title="Skills" hint="Group them as you like, separated by commas. Skills backed by an assessment or a verified certificate are marked automatically."
          action={form.skillGroups.length < 6 && <Add onClick={() => addItem("skillGroups", { label: "", itemsText: "" })}>+ add group</Add>}>
          {form.skillGroups.map((g, i) => (
            <div key={i} className="grid grid-cols-[170px_1fr_auto] gap-2 items-start">
              <input className={input} placeholder="Group (e.g. Languages)" value={g.label} onChange={(e) => setItem("skillGroups", i, { label: e.target.value })} />
              <textarea className={input} rows={2} placeholder="C++, Python, SQL" value={g.itemsText} onChange={(e) => setItem("skillGroups", i, { itemsText: e.target.value })} />
              <Remove onClick={() => removeItem("skillGroups", i)} />
            </div>
          ))}
        </Section>

        <Section title="Projects" hint="Up to 5. Three bullet points per project reads best."
          action={form.projects.length < 5 && <Add onClick={() => addItem("projects", { title: "", link: "", date: "", bulletsText: "", techText: "" })}>+ add project</Add>}>
          {form.projects.map((p, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2">
              <input className={input} placeholder="Project title" value={p.title} onChange={(e) => setItem("projects", i, { title: e.target.value })} />
              <div className="flex gap-2">
                <input className={input} type="month" title="Month completed" value={p.date} onChange={(e) => setItem("projects", i, { date: e.target.value })} />
              </div>
              <input className={`${input} col-span-2`} placeholder="Link (optional, https://…)" value={p.link} onChange={(e) => setItem("projects", i, { link: e.target.value })} />
              <div className="col-span-2">
                <textarea className={input} rows={4} placeholder={"What you built, one bullet per line (max 4, 220 characters each)"} value={p.bulletsText} onChange={(e) => setItem("projects", i, { bulletsText: e.target.value })} />
                <p className={small}>{p.bulletsText.split("\n").filter((b) => b.trim()).length}/4 bullets</p>
              </div>
              <input className={`${input} col-span-2`} placeholder="Technologies, comma separated (React, Node.js, MongoDB)" value={p.techText} onChange={(e) => setItem("projects", i, { techText: e.target.value })} />
              <div className="col-span-2 text-right"><Remove onClick={() => removeItem("projects", i)} /></div>
            </div>
          ))}
        </Section>

        <Section title="Training" hint="Courses, bootcamps or internships you completed. Up to 3."
          action={form.training.length < 3 && <Add onClick={() => addItem("training", { title: "", link: "", date: "", description: "" })}>+ add training</Add>}>
          {form.training.map((t, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2">
              <input className={input} placeholder="Training title" value={t.title} onChange={(e) => setItem("training", i, { title: e.target.value })} />
              <input className={input} type="month" title="Month completed" value={t.date} onChange={(e) => setItem("training", i, { date: e.target.value })} />
              <input className={`${input} col-span-2`} placeholder="Link (optional, https://…)" value={t.link} onChange={(e) => setItem("training", i, { link: e.target.value })} />
              <textarea className={`${input} col-span-2`} rows={3} maxLength={400} placeholder="What it covered (max 400 characters)" value={t.description} onChange={(e) => setItem("training", i, { description: e.target.value })} />
              <div className="col-span-2 text-right"><Remove onClick={() => removeItem("training", i)} /></div>
            </div>
          ))}
        </Section>

        <Section title="Certificates" hint="Filled in automatically from your faculty-verified certificates (see Filled in automatically above). Add certificates on the Certificates page." />

        <Section title="Education" hint="Your university entry's department and CGPA come from your verified record. Only the degree and dates are typed.">
          <div className="border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-2 items-end">
            <div className="col-span-3 text-sm text-slate-600">{edu.institution}, {edu.location}</div>
            <div className="col-span-3"><input className={input} placeholder="Degree" value={form.education.degree} onChange={(e) => setEdu({ degree: e.target.value })} /></div>
            <div><label className={small}>Started</label><input className={input} type="month" value={form.education.start} onChange={(e) => setEdu({ start: e.target.value })} /></div>
            <div><label className={small}>Ended</label><input className={input} type="month" disabled={form.education.present} value={form.education.end} onChange={(e) => setEdu({ end: e.target.value })} /></div>
            <label className="text-xs flex items-center gap-1 pb-2"><input type="checkbox" checked={form.education.present} onChange={(e) => setEdu({ present: e.target.checked })} /> Present</label>
          </div>
        </Section>

        <Section title="Other education" hint="School or earlier studies (up to 3). Not verified by the platform, so no verification note is printed for these."
          action={form.otherEducation.length < 3 && <Add onClick={() => addItem("otherEducation", { institution: "", location: "", level: "", start: "", end: "", present: false, detail: "" })}>+ add</Add>}>
          {form.otherEducation.map((e, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2">
              <input className={input} placeholder="School / college" value={e.institution} onChange={(ev) => setItem("otherEducation", i, { institution: ev.target.value })} />
              <input className={input} placeholder="Location (e.g. Amritsar, Punjab)" value={e.location} onChange={(ev) => setItem("otherEducation", i, { location: ev.target.value })} />
              <input className={input} placeholder="Level (e.g. Intermediate)" value={e.level} onChange={(ev) => setItem("otherEducation", i, { level: ev.target.value })} />
              <input className={input} placeholder="Details (e.g. PCM; Percentage: 78%)" value={e.detail} onChange={(ev) => setItem("otherEducation", i, { detail: ev.target.value })} />
              <div><label className={small}>Started</label><input className={input} type="month" value={e.start} onChange={(ev) => setItem("otherEducation", i, { start: ev.target.value })} /></div>
              <div><label className={small}>Ended</label><input className={input} type="month" disabled={e.present} value={e.end} onChange={(ev) => setItem("otherEducation", i, { end: ev.target.value })} />
                <label className="text-xs flex items-center gap-1 mt-1"><input type="checkbox" checked={e.present} onChange={(ev) => setItem("otherEducation", i, { present: ev.target.checked })} /> Present</label></div>
              <div className="col-span-2 text-right"><Remove onClick={() => removeItem("otherEducation", i)} /></div>
            </div>
          ))}
        </Section>

        <button onClick={save} disabled={busy === "save" || form.fullName.trim().length < 2} className="bg-indigo-600 text-white rounded-md px-5 py-2 disabled:opacity-50">
          {busy === "save" ? "Saving…" : "Save resume"}
        </button>
      </section>

      {/* ---------- export + verification link ---------- */}
      <section className="space-y-4 border-t border-slate-200 pt-6">
        <h2 className="font-medium">Download and share</h2>
        {!data.saved ? <p className="text-sm text-slate-500">Save your resume first.</p> : (
          <>
            <div className="space-y-2">
              <button onClick={() => pdf(false)} disabled={busy === "pdf"} className="border border-slate-300 rounded-md px-4 py-2 text-sm">Download PDF</button>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
                <span>Add verification marks and notes to the PDF (* † next to evidence-backed skills, and a line under Education and Certificates).
                  <span className={`block ${small}`}>Off by default: the PDF is exactly the placement cell&apos;s recommended format. Turn this on to show recruiters what is university-verified.</span></span>
              </label>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium">Verification link for recruiters</h3>
              <p className="text-xs text-slate-500">
                Anyone with the link sees only university-verified facts: academic status, skills backed by an assessment or verified certificate,
                and verified certificates. Never your contact details. The link expires, and you can revoke it any time.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <select value={opts.expiresInDays} onChange={(e) => setOpts({ ...opts, expiresInDays: Number(e.target.value) })} className="border rounded-md px-2 py-1">
                  <option value={7}>expires in 7 days</option><option value={30}>expires in 30 days</option><option value={90}>expires in 90 days</option>
                </select>
                <label className="flex items-center gap-1"><input type="checkbox" checked={opts.showCgpa} onChange={(e) => setOpts({ ...opts, showCgpa: e.target.checked })} /> show CGPA</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={opts.showRegistrationNumber} onChange={(e) => setOpts({ ...opts, showRegistrationNumber: e.target.checked })} /> show registration number</label>
                <button onClick={createLink} disabled={busy === "link"} className="bg-slate-900 text-white rounded-md px-4 py-1.5">Create link</button>
              </div>

              {created && (
                <div className="border border-green-200 bg-green-50 rounded-md p-3 flex gap-4 items-start">
                  <img src={created.qr} alt="QR code for the verification link" width={110} height={110} className="bg-white" />
                  <div className="text-sm space-y-2 min-w-0">
                    <p className="font-medium text-green-900">Link created. Copy it now: it cannot be shown again.</p>
                    <p className="font-mono text-xs break-all">{created.url}</p>
                    <div className="flex gap-2">
                      <button onClick={() => navigator.clipboard.writeText(created.url).then(() => setMessage("Link copied."))} className="border border-green-300 rounded-md px-3 py-1 text-xs">Copy</button>
                      <button onClick={() => pdf(true)} disabled={busy === "pdf"} className="bg-green-700 text-white rounded-md px-3 py-1 text-xs">Download PDF with this link + QR</button>
                    </div>
                  </div>
                </div>
              )}

              <ul className="text-sm divide-y divide-slate-100">
                {shares.map((s) => (
                  <li key={s.id} className="py-2 flex items-center justify-between gap-3">
                    <span>
                      <span className={s.active ? "text-green-700" : "text-slate-400"}>{s.active ? "Active" : s.revokedAt ? "Revoked" : "Expired"}</span>
                      <span className="text-slate-500"> · created {fmt(s.createdAt)} · expires {fmt(s.expiresAt)} · {s.viewCount} view{s.viewCount === 1 ? "" : "s"}</span>
                    </span>
                    {s.active && <button onClick={() => revoke(s.id)} className="text-xs text-red-600">Revoke</button>}
                  </li>
                ))}
                {shares.length === 0 && <li className="py-2 text-slate-400">No links yet.</li>}
              </ul>
            </div>
          </>
        )}
      </section>

      {/* ---------- role check ---------- */}
      <section className="space-y-3 border-t border-slate-200 pt-6">
        <h2 className="font-medium">Check your resume against a role</h2>
        {!data.saved ? <p className="text-sm text-slate-500">Save your resume first.</p> : (
          <>
            <select onChange={(e) => runCheck(e.target.value)} className="border rounded-md px-3 py-2" defaultValue="">
              <option value="">Choose a role…</option>
              {roles.map((r) => <option key={r._id} value={r._id}>{r.role} · {r.companyId?.name}</option>)}
            </select>
            {check && (
              <div className="space-y-3">
                <p className="text-sm"><strong>{check.coveragePct}%</strong> of this role&apos;s required skills (weighted) appear on your resume.
                  {" "}<span className="text-slate-400">{check.counts.listed} in Skills · {check.counts.mentionedOnly} in projects/training only · {check.counts.absent} missing</span></p>
                <ul className="space-y-2">
                  {check.rows.map((r) => (
                    <li key={r.skillId} className="border border-slate-200 rounded-md p-3 text-sm">
                      <p className="font-medium">{r.name}
                        <span className={`ml-2 text-xs rounded-full px-2 py-0.5 ${r.status === "listed" ? "bg-green-50 text-green-700" : r.status === "mentioned" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                          {r.status === "listed" ? "in your Skills section" : r.status === "mentioned" ? "in projects/training only" : "missing"}</span></p>
                      {r.advice && <p className="text-xs text-slate-600 mt-1">{r.advice}</p>}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-400">{check.disclaimer}</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
