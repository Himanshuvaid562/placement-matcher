"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";

const TIER = { assessment: "Assessment-verified", certificate: "Faculty-verified certificate" };
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

// Public page: a recruiter opens a student's verification link. No login, read-only.
export default function VerifyPage() {
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/public/verify/${token}`, { auth: false }).then(setView).catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-xl font-semibold mb-2">Link not valid</h1>
        <p className="text-sm text-slate-500">{error}</p>
        <p className="text-xs text-slate-400 mt-4">Ask the student for a fresh link.</p>
      </div>
    );
  }
  if (!view) return <p className="text-slate-500">Checking…</p>;
  const a = view.academic;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">University verification</p>
        <h1 className="text-2xl font-bold">{view.student.name}</h1>
        <p className="text-xs text-slate-400">Name as entered by the student. Confirm identity against their ID card.</p>
      </div>

      <section className="border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium mb-2">Academic details</h2>
        {a.status === "verified" ? (
          <>
            <p className="text-sm text-green-700 mb-2">✓ Verified by the university{a.verifiedOn ? ` on ${fmt(a.verifiedOn)}` : ""}</p>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Department</dt><dd>{a.department}</dd>
              <dt className="text-slate-500">Batch</dt><dd>{a.batchYear}</dd>
              {a.cgpa != null && (<><dt className="text-slate-500">CGPA</dt><dd>{a.cgpa}</dd></>)}
              <dt className="text-slate-500">Backlogs</dt><dd>{a.backlogs}</dd>
              {a.registrationNumber && (<><dt className="text-slate-500">Registration no.</dt><dd className="font-mono">{a.registrationNumber}</dd></>)}
            </dl>
          </>
        ) : (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">{a.note}</p>
        )}
      </section>

      <section className="border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium mb-2">Skills backed by evidence</h2>
        {view.skills.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
          <ul className="text-sm space-y-1">
            {view.skills.map((s) => (
              <li key={s.skillId} className="flex justify-between"><span>{s.name}</span><span className="text-slate-500">level {s.level}/5 · {TIER[s.evidence]}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium mb-2">Certificates verified by faculty</h2>
        {view.certificates.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
          <ul className="text-sm space-y-1">
            {view.certificates.map((c, i) => (
              <li key={i}>✓ {c.title} <span className="text-slate-400">· {c.issuer}{c.issueDate ? ` · ${fmt(c.issueDate)}` : ""}</span></li>
            ))}
          </ul>
        )}
      </section>

      <div className="text-xs text-slate-400 space-y-1">
        {view.notes.map((n) => <p key={n}>{n}</p>)}
        <p>Checked {fmt(view.asOf)} · link valid until {fmt(view.validUntil)} · issued by {view.issuer}.</p>
      </div>
    </div>
  );
}
