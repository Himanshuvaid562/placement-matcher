"use client";
import { useEffect, useState } from "react";
import { api, apiOpenFile } from "../../../lib/api";
import { StatusPill, TypeBadge, fmtDate, fmtSize } from "../../../components/CredentialBadges";

const TABS = ["pending", "verified", "rejected", "all"];

function Item({ c, cap, onChanged }) {
  const [award, setAward] = useState(c.skillLevel || 3);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action, body) {
    setBusy(true); setError("");
    try {
      await api(`/credentials/${c.id}/${action}`, { method: "POST", body });
      setRejecting(false); setReason("");
      onChanged();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function open() {
    setError("");
    try { await apiOpenFile(`/credentials/${c.id}/file`); } catch (err) { setError(err.message); }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{c.title}</p>
          <p className="text-sm text-slate-500">
            {c.issuer}{c.issueDate ? ` · ${fmtDate(c.issueDate)}` : ""}{c.result ? ` · ${c.result}` : ""}{c.credentialId ? ` · ID ${c.credentialId}` : ""}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Student <span className="font-mono">{c.registrationNumber}</span>{c.department ? ` · ${c.department}` : ""}{c.batchYear ? ` · batch ${c.batchYear}` : ""}
          </p>
        </div>
        <div className="flex gap-2 items-center shrink-0"><TypeBadge type={c.type} /><StatusPill status={c.status} /></div>
      </div>

      {c.skill && (
        <p className="text-sm bg-sky-50 border border-sky-200 text-sky-900 rounded-md p-2">
          Student claims this is evidence for <strong>{c.skill.name}</strong> at level <strong>{c.skillLevel}</strong>.
          {c.status === "verified" && c.awardedLevel != null && <> Awarded level <strong>{c.awardedLevel}</strong>.</>}
          {" "}Certificates count towards match scores up to level {cap}.
        </p>
      )}

      {c.sharedFileWithOtherStudents > 0 && (
        <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-md p-2">
          ⚠ This exact PDF was also uploaded by {c.sharedFileWithOtherStudents} other student{c.sharedFileWithOtherStudents > 1 ? "s" : ""}. Check the name on the certificate.
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {c.hasFile && (
          <button onClick={open} className="bg-slate-900 text-white rounded-md px-4 py-1.5 text-sm">
            View certificate (PDF, {fmtSize(c.fileSize)})
          </button>
        )}
        {c.link && (
          <a href={c.link} target="_blank" rel="noopener noreferrer"
             className="border border-slate-300 rounded-md px-4 py-1.5 text-sm hover:bg-slate-50">
            Open link ↗ <span className="text-slate-500">{c.linkHost}</span>
          </a>
        )}
      </div>
      {c.link && !c.linkKnown && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
          Unrecognised website (<strong>{c.linkHost}</strong>). Check the address before opening it, and do not sign in or download anything from it.
        </p>
      )}
      {c.link && c.linkKnown && /drive\.google|docs\.google/.test(c.linkHost) && (
        <p className="text-xs text-slate-400">If Drive says &ldquo;request access&rdquo;, the student has not shared it publicly; reject it and ask them to fix the sharing setting.</p>
      )}

      {c.status === "rejected" && <p className="text-sm text-red-700">Reason given to student: {c.rejectionReason}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!rejecting && (
        <div className="flex flex-wrap gap-2 items-center">
          {c.skill && c.status !== "verified" && (
            <label className="text-sm flex items-center gap-2">
              Award level
              <select value={award} onChange={(e) => setAward(Number(e.target.value))} className="border rounded-md px-2 py-1">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          {c.status !== "verified" && (
            <button disabled={busy} onClick={() => act("approve", c.skill ? { awardedLevel: award } : {})}
                    className="bg-green-600 text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-40">Mark verified</button>
          )}
          {c.status !== "rejected" && (
            <button onClick={() => setRejecting(true)} className="border border-red-300 text-red-700 rounded-md px-4 py-1.5 text-sm">Reject…</button>
          )}
        </div>
      )}
      {rejecting && (
        <div className="space-y-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the student, min 5 characters)"
                 className="w-full border rounded-md px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={busy || reason.trim().length < 5} onClick={() => act("reject", { reason })}
                    className="bg-red-600 text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-40">Confirm reject</button>
            <button onClick={() => { setRejecting(false); setReason(""); }} className="text-sm text-slate-500">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCredentialsPage() {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [profileId, setProfileId] = useState(null);
  const [ready, setReady] = useState(false);
  const [list, setList] = useState({ data: [], total: 0, limit: 20, levelCap: 3 });
  const [error, setError] = useState("");

  // ?profile=<id> narrows the list to one student (linked from the Verification page)
  useEffect(() => {
    setProfileId(new URLSearchParams(window.location.search).get("profile"));
    setReady(true);
  }, []);

  async function load() {
    try {
      setError("");
      const q = new URLSearchParams({ status, page, limit: 20 });
      if (profileId) q.set("profileId", profileId);
      setList(await api(`/credentials?${q}`));
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { if (ready) load(); }, [status, page, profileId, ready]);

  const pages = Math.max(1, Math.ceil(list.total / list.limit));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Student Certificates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Open each student&apos;s proof in one click, then mark it verified or reject it with a reason.
          Certificates are informational: they do not change a student&apos;s eligibility or match score.
        </p>
      </div>

      {profileId && (
        <p className="text-sm bg-slate-50 border border-slate-200 rounded-md p-2">
          Showing one student only. <button onClick={() => { setProfileId(null); setPage(1); window.history.replaceState(null, "", "/admin/credentials"); }} className="underline">Show everyone</button>
        </p>
      )}

      <div className="flex gap-2">
        {TABS.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                  className={`text-sm rounded-full px-3 py-1 border ${status === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}>{s}</button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-sm text-slate-500">{list.total} certificate{list.total === 1 ? "" : "s"}</p>

      <div className="space-y-3">
        {list.data.map((c) => <Item key={c.id} c={c} cap={list.levelCap} onChanged={load} />)}
        {list.data.length === 0 && !error && <p className="text-sm text-slate-500">Nothing here.</p>}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border rounded-md px-3 py-1 disabled:opacity-40">Previous</button>
          <span className="text-slate-500">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="border rounded-md px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
