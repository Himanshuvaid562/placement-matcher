"use client";
import { useEffect, useRef, useState } from "react";
import { api, apiUpload, apiOpenFile } from "../../lib/api";
import { StatusPill, TypeBadge, fmtDate, fmtSize } from "../../components/CredentialBadges";

const MAX_BYTES = 3 * 1024 * 1024;

export default function CredentialsPage() {
  const [items, setItems] = useState([]);
  const [limit, setLimit] = useState(25);
  const [cap, setCap] = useState(3);
  const [skills, setSkills] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  async function load() {
    const res = await api("/students/me/credentials");
    setItems(res.data);
    setLimit(res.limit);
    setCap(res.levelCap);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api("/students/skills-catalog").then((r) => setSkills(r.data)).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(""); setMessage("");
    const form = new FormData(e.target);
    const file = form.get("certificate");
    const link = String(form.get("link") || "").trim();
    const hasFile = file && file.size > 0;

    if (!hasFile && !link) return setError("Add a PDF, a link, or both as proof.");
    if (hasFile && file.size > MAX_BYTES) return setError(`That PDF is ${fmtSize(file.size)}. The maximum is 3 MB.`);
    if (hasFile && !/\.pdf$/i.test(file.name)) return setError("Only PDF files can be uploaded. For anything else, use a link.");
    if (!hasFile) form.delete("certificate"); // an empty file part would confuse the server
    if (!form.get("skillId")) { form.delete("skillId"); form.delete("skillLevel"); }
    else if (!form.get("skillLevel")) return setError("Choose the level this certificate covers.");

    setBusy(true);
    try {
      await apiUpload("/students/me/credentials", form);
      formRef.current.reset();
      setMessage("Added. A faculty member will review it.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this certificate? This also removes the uploaded PDF.")) return;
    setError("");
    try {
      await api(`/students/me/credentials/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function open(id) {
    setError("");
    try { await apiOpenFile(`/students/me/credentials/${id}/file`); } catch (err) { setError(err.message); }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Certificates &amp; MOOCs</h1>
        <p className="text-sm text-slate-500 mt-1">
          Add the courses and certifications you have completed, with proof. Faculty can open your proof and mark it verified.
          These are shown to the placement team; they do not change your eligibility or skill-match score.
        </p>
      </div>

      <form ref={formRef} onSubmit={submit} className="border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
        <select name="type" className="border rounded-md px-3 py-2" defaultValue="mooc" required>
          <option value="mooc">MOOC / online course</option>
          <option value="certification">Certification</option>
        </select>
        <input name="issuer" placeholder="Platform or organisation (e.g. NPTEL, Coursera)" className="border rounded-md px-3 py-2" required />
        <input name="title" placeholder="Course / certificate title" className="border rounded-md px-3 py-2 col-span-2" required />
        <div>
          <label className="text-xs text-slate-500">Date completed (optional)</label>
          <input name="issueDate" type="date" className="border rounded-md px-3 py-2 w-full" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Credential / certificate ID (optional)</label>
          <input name="credentialId" className="border rounded-md px-3 py-2 w-full" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Grade / result (optional, printed on your resume, e.g. O Grade or Elite + Gold)</label>
          <input name="result" maxLength={40} className="border rounded-md px-3 py-2 w-full" />
        </div>

        <div className="col-span-2 border-t border-slate-100 pt-3">
          <p className="text-sm font-medium mb-2">Proof (a PDF, a link, or both)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Upload PDF (max 3 MB)</label>
              <input name="certificate" type="file" accept="application/pdf,.pdf" className="text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Drive / certificate link (https://…)</label>
              <input name="link" placeholder="https://drive.google.com/…" className="border rounded-md px-3 py-2 w-full" />
            </div>
          </div>
          <p className="text-xs text-amber-700 mt-2">
            For Google Drive, set sharing to <strong>&ldquo;Anyone with the link can view&rdquo;</strong>; otherwise faculty will see
            &ldquo;request access&rdquo; and cannot open it.
          </p>
        </div>

        <div className="col-span-2 border-t border-slate-100 pt-3">
          <p className="text-sm font-medium mb-1">Count it as evidence for a skill (optional)</p>
          <p className="text-xs text-slate-500 mb-2">
            Once faculty verify it, this certificate can back your level in that skill in your match scores. Certificates show
            exposure rather than mastery, so a certificate counts up to <strong>level {cap}</strong>; an assessment can take you higher.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <select name="skillId" className="border rounded-md px-3 py-2" defaultValue="">
              <option value="">No skill</option>
              {skills.map((sk) => <option key={sk._id} value={sk._id}>{sk.name}</option>)}
            </select>
            <select name="skillLevel" className="border rounded-md px-3 py-2" defaultValue="">
              <option value="">Level it covers…</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        {message && <p className="col-span-2 text-sm text-green-600">{message}</p>}
        <button disabled={busy || items.length >= limit} className="col-span-2 bg-indigo-600 text-white rounded-md py-2 disabled:opacity-50">
          {busy ? "Uploading…" : "Add certificate"}
        </button>
      </form>

      <div className="space-y-3">
        <p className="text-sm text-slate-500">{items.length} of {limit} used</p>
        {items.map((c) => (
          <div key={c.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="text-sm text-slate-500">
                  {c.issuer}{c.issueDate ? ` · ${fmtDate(c.issueDate)}` : ""}{c.result ? ` · ${c.result}` : ""}{c.credentialId ? ` · ID ${c.credentialId}` : ""}
                </p>
              </div>
              <div className="flex gap-2 items-center shrink-0"><TypeBadge type={c.type} /><StatusPill status={c.status} /></div>
            </div>

            {c.skill && (
              <p className="text-xs text-slate-600">
                Evidence for <strong>{c.skill.name}</strong>, you claimed level {c.skillLevel}.{" "}
                {c.status === "verified" && c.awardedLevel != null && (
                  <span className="text-green-700">
                    Faculty awarded level {c.awardedLevel}{c.awardedLevel > cap ? `; it counts up to level ${cap}` : ""}.
                  </span>
                )}
                {c.status === "pending" && <span className="text-slate-400">It counts once faculty verify it.</span>}
              </p>
            )}

            <div className="flex flex-wrap gap-3 items-center text-sm">
              {c.hasFile && (
                <button onClick={() => open(c.id)} className="text-indigo-600 hover:underline">
                  View PDF ({c.fileName}, {fmtSize(c.fileSize)})
                </button>
              )}
              {c.link && (
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Open link ↗ <span className="text-slate-400">({c.linkHost})</span>
                </a>
              )}
              <button onClick={() => remove(c.id)} className="ml-auto text-xs text-slate-400 hover:text-red-600">Delete</button>
            </div>

            {c.status === "rejected" && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                Not accepted: {c.rejectionReason}. Delete it and add it again with corrected proof.
              </p>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">Nothing added yet.</p>}
      </div>
    </div>
  );
}
