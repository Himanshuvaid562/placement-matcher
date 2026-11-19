"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import VerificationBanner from "../../components/VerificationBanner";

const sameText = (a, b) => String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [completion, setCompletion] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [mySkills, setMySkills] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [p, c, s] = await Promise.all([
      api("/students/me/profile"),
      api("/students/skills-catalog"),
      api("/students/me/skills"),
    ]);
    setProfile(p.profile);
    setCompletion(p.completionPct);
    setCatalog(c.data);
    setMySkills(s.data);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    const form = new FormData(e.target);
    const next = {
      department: String(form.get("department") || "").trim(),
      batchYear: form.get("batchYear") ? Number(form.get("batchYear")) : undefined,
      cgpa: form.get("cgpa") ? Number(form.get("cgpa")) : undefined,
      backlogs: Number(form.get("backlogs") || 0),
    };

    // Warn before an edit throws away an existing submission / verification
    const status = profile.verification?.status;
    const changed =
      !sameText(next.department, profile.department) ||
      next.batchYear !== profile.batchYear ||
      next.cgpa !== profile.cgpa ||
      next.backlogs !== (profile.backlogs ?? 0);
    if (changed && (status === "verified" || status === "pending")) {
      const ok = window.confirm(
        status === "verified"
          ? "Changing academic details will remove your university verification. You will need to submit again. Continue?"
          : "Changing academic details will cancel your pending verification request. Continue?"
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = await api("/students/me/profile", { method: "PUT", body: next });
      setProfile(res.profile);
      setCompletion(res.completionPct);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitForVerification() {
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      await api("/students/me/verification/submit", { method: "POST" });
      await load();
      setMessage("Submitted. The Placement Office will review your details.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function addSkill(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    await api("/students/me/skills", {
      method: "POST",
      body: { skillId: form.get("skillId"), selfReportedLevel: Number(form.get("level")) },
    });
    const s = await api("/students/me/skills");
    setMySkills(s.data);
    e.target.reset();
  }

  if (error && !profile) return <p className="text-red-600">{error}</p>;
  if (!profile) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <div className="max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Academic Profile</h1>
          <span className="text-sm text-slate-500">{completion}% complete</span>
        </div>

        <VerificationBanner verification={profile.verification} onSubmit={submitForVerification} busy={submitting} />

        <form onSubmit={saveProfile} className="grid grid-cols-2 gap-4" key={profile.updatedAt}>
          <div className="col-span-2">
            <label className="text-xs text-slate-500">UMS registration number (your login ID, cannot be changed)</label>
            <p className="border rounded-md px-3 py-2 w-full bg-slate-50 text-slate-700 font-mono">{profile.registrationNumber}</p>
          </div>
          <input name="department" defaultValue={profile.department || ""} placeholder="Department (e.g. CSE)"
                 className="border rounded-md px-3 py-2 col-span-2" />
          <input name="batchYear" defaultValue={profile.batchYear || ""} placeholder="Batch year" type="number"
                 className="border rounded-md px-3 py-2" />
          <input name="cgpa" defaultValue={profile.cgpa ?? ""} placeholder="CGPA" type="number" step="0.01"
                 className="border rounded-md px-3 py-2" />
          <input name="backlogs" defaultValue={profile.backlogs ?? 0} placeholder="Backlogs" type="number"
                 className="border rounded-md px-3 py-2" />
          <button disabled={saving} className="col-span-2 bg-indigo-600 text-white rounded-md py-2">
            {saving ? "Saving…" : "Save Profile"}
          </button>
          {message && <p className="col-span-2 text-sm text-green-600">{message}</p>}
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-1">Skills</h2>
        <p className="text-xs text-slate-500 mb-3 max-w-lg">
          Levels you enter are self-reported. A level is only marked verified when you pass a linked assessment.
        </p>
        <form onSubmit={addSkill} className="flex gap-2 max-w-lg mb-4">
          <select name="skillId" className="border rounded-md px-3 py-2 flex-1" required>
            <option value="">Select a skill…</option>
            {catalog.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select name="level" className="border rounded-md px-3 py-2" required>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="bg-slate-800 text-white rounded-md px-4">Add</button>
        </form>
        <ul className="space-y-1">
          {mySkills.map((s) => (
            <li key={s._id} className="flex justify-between text-sm border-b border-slate-100 py-1 max-w-lg">
              <span>{s.skillId?.name}</span>
              <span className="text-slate-500">
                self: {s.selfReportedLevel ?? "–"} · verified: {s.verifiedLevel ?? "–"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
