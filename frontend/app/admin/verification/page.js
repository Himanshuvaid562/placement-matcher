"use client";
import { useEffect, useState } from "react";
import Papa from "papaparse";
import { api } from "../../../lib/api";

const FIELD_LABELS = { department: "Department", batchYear: "Batch year", cgpa: "CGPA", backlogs: "Backlogs" };
const STATUS_TABS = ["pending", "verified", "rejected", "unverified"];
const fmt = (d) => (d ? new Date(d).toLocaleString() : "");

// ---------- bulk import of the university's official records ----------
function ImportRecords({ onDone }) {
  const [rows, setRows] = useState([]);
  const [invalid, setInvalid] = useState(0);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  function onFile(e) {
    const file = e.target.files?.[0];
    setResult(""); setError(""); setRows([]); setInvalid(0);
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: ({ data }) => {
        const good = [];
        let bad = 0;
        for (const r of data) {
          const rec = {
            registrationNumber: String(r.registrationNumber ?? "").trim(),
            department: String(r.department ?? "").trim(),
            batchYear: Number(r.batchYear),
            cgpa: Number(r.cgpa),
            backlogs: r.backlogs === undefined || r.backlogs === "" ? 0 : Number(r.backlogs),
          };
          const ok = rec.registrationNumber && rec.department && Number.isInteger(rec.batchYear) &&
            Number.isFinite(rec.cgpa) && rec.cgpa >= 0 && rec.cgpa <= 10 && Number.isInteger(rec.backlogs) && rec.backlogs >= 0;
          ok ? good.push(rec) : bad++;
        }
        setRows(good);
        setInvalid(bad);
      },
      error: (err) => setError(err.message),
    });
  }

  async function runImport() {
    setBusy(true); setError(""); setResult("");
    try {
      let created = 0, updated = 0;
      for (let i = 0; i < rows.length; i += 1000) {
        const res = await api("/verification/records/import", { method: "POST", body: { records: rows.slice(i, i + 1000) } });
        created += res.created; updated += res.updated;
      }
      setResult(`Imported ${rows.length} records: ${created} new, ${updated} updated.`);
      setRows([]); setFileName("");
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div>
        <h2 className="font-medium">Import official academic records</h2>
        <p className="text-xs text-slate-500 mt-1">
          CSV with the header <code className="bg-slate-100 px-1 rounded">registrationNumber,department,batchYear,cgpa,backlogs</code>,
          exported from the university&apos;s own records. When a record exists, approving a student stores the
          official values, whatever the student typed.
        </p>
      </div>
      <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
      {fileName && (
        <p className="text-sm text-slate-600">
          {rows.length} valid row{rows.length === 1 ? "" : "s"}
          {invalid > 0 && <span className="text-red-600"> · {invalid} invalid row{invalid === 1 ? "" : "s"} skipped</span>}
        </p>
      )}
      <button onClick={runImport} disabled={busy || rows.length === 0}
              className="bg-slate-900 text-white rounded-md px-4 py-2 text-sm disabled:opacity-40">
        {busy ? "Importing…" : `Import ${rows.length || ""} records`}
      </button>
      {result && <p className="text-sm text-green-600">{result}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------- one student in the review queue ----------
function QueueItem({ item, onChanged }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [manualCheck, setManualCheck] = useState(false);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState(null);

  const hasOfficial = Boolean(item.officialRecord);
  const mismatches = (item.comparison || []).filter((c) => !c.match).length;

  async function act(path, body) {
    setBusy(true); setError("");
    try {
      await api(`/verification/${item.profileId}/${path}`, { method: "POST", body });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const ok = window.confirm(
      `Issue a temporary password for ${item.registrationNumber || item.loginId}?\n\n` +
      "Only do this after checking the student's ID card in person. It signs the account out everywhere, " +
      "including anyone else who may have registered this number."
    );
    if (!ok) return;
    setBusy(true); setError("");
    try {
      const res = await api(`/verification/${item.profileId}/reset-password`, { method: "POST" });
      setTempPassword(res.temporaryPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory() {
    if (history) return setHistory(null);
    const res = await api(`/verification/${item.profileId}/history`);
    setHistory(res.data);
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium font-mono">{item.registrationNumber || item.loginId}</p>
          <p className="text-sm text-slate-500">UMS registration number (login ID)</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          {item.status === "pending" && <>submitted {fmt(item.submittedAt)}</>}
          {item.status === "verified" && <>verified {fmt(item.reviewedAt)} ({item.method === "official_record" ? "official record" : "manual check"})</>}
          {item.status === "rejected" && <>rejected {fmt(item.reviewedAt)}</>}
        </div>
      </div>

      {item.status === "verified" ? (
        <p className="text-sm text-slate-600">
          Verified values: {item.snapshot.department}, batch {item.snapshot.batchYear}, CGPA {item.snapshot.cgpa}, backlogs {item.snapshot.backlogs}
        </p>
      ) : hasOfficial ? (
        <table className="w-full text-sm border border-slate-100 rounded-md overflow-hidden">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr><th className="px-3 py-1">Field</th><th className="px-3 py-1">Student entered</th><th className="px-3 py-1">Official record</th><th className="px-3 py-1" /></tr>
          </thead>
          <tbody>
            {item.comparison.map((c) => (
              <tr key={c.field} className={`border-t border-slate-100 ${c.match ? "" : "bg-red-50"}`}>
                <td className="px-3 py-1">{FIELD_LABELS[c.field]}</td>
                <td className="px-3 py-1">{String(c.claimed ?? "—")}</td>
                <td className="px-3 py-1">{String(c.official ?? "—")}</td>
                <td className="px-3 py-1">{c.match ? <span className="text-green-600">✓</span> : <span className="text-red-600 font-medium">differs</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3">
          No official record on file for this registration number. Student entered: {item.claimed.department || "—"}, batch {item.claimed.batchYear ?? "—"},
          CGPA {item.claimed.cgpa ?? "—"}, backlogs {item.claimed.backlogs}.
        </div>
      )}

      {item.status === "rejected" && item.rejectionReason && (
        <p className="text-sm text-red-700">Reason given to student: {item.rejectionReason}</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {item.status === "pending" && !rejecting && (
        <div className="space-y-2">
          {hasOfficial ? (
            <p className="text-xs text-slate-500">
              Approving stores the <strong>official</strong> values{mismatches > 0 ? ` (${mismatches} field${mismatches > 1 ? "s" : ""} differ from what the student entered)` : ""}.
              Approve only after confirming this account really belongs to this registration number.
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={manualCheck} onChange={(e) => setManualCheck(e.target.checked)} className="mt-1" />
              <span>I have checked this student&apos;s identity and documents myself and these values are correct.</span>
            </label>
          )}
          <div className="flex gap-2">
            <button disabled={busy || (!hasOfficial && !manualCheck)}
                    onClick={() => act("approve", hasOfficial ? {} : { manualCheck: true })}
                    className="bg-green-600 text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-40">
              {hasOfficial ? "Approve (use official values)" : "Approve after manual check"}
            </button>
            <button onClick={() => setRejecting(true)} className="border border-red-300 text-red-700 rounded-md px-4 py-1.5 text-sm">Reject…</button>
          </div>
        </div>
      )}

      {item.status === "verified" && !rejecting && (
        <button onClick={() => setRejecting(true)} className="border border-red-300 text-red-700 rounded-md px-4 py-1.5 text-sm">
          Revoke verification…
        </button>
      )}

      {rejecting && (
        <div className="space-y-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the student, min 5 characters)"
                 className="w-full border rounded-md px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={busy || reason.trim().length < 5} onClick={() => act("reject", { reason })}
                    className="bg-red-600 text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-40">
              {item.status === "verified" ? "Confirm revoke" : "Confirm reject"}
            </button>
            <button onClick={() => { setRejecting(false); setReason(""); }} className="text-sm text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {tempPassword && (
        <div className="border border-amber-300 bg-amber-50 rounded-md p-3 text-sm space-y-1">
          <p className="font-medium text-amber-900">Temporary password (shown once)</p>
          <p className="font-mono text-lg tracking-wide select-all">{tempPassword}</p>
          <p className="text-xs text-amber-800">
            Give it to the student in person. They will be required to choose their own password at first login.
            Closing or reloading this page hides it permanently; issue a new one if lost.
          </p>
          <button onClick={() => setTempPassword(null)} className="text-xs underline text-amber-900">I have given it to the student; hide</button>
        </div>
      )}

      <div className="flex gap-4">
        <button onClick={toggleHistory} className="text-xs text-indigo-600">{history ? "Hide" : "Show"} audit trail</button>
        <a href={`/admin/credentials?profile=${item.profileId}`} className="text-xs text-indigo-600">View certificates</a>
        <button onClick={resetPassword} disabled={busy} className="text-xs text-slate-500 hover:text-red-600 disabled:opacity-40">Reset password…</button>
      </div>
      {history && (
        <ul className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-2">
          {history.length === 0 && <li>No events yet.</li>}
          {history.map((h) => (
            <li key={h._id}>{fmt(h.createdAt)} · <strong>{h.action}</strong> · {h.actorUserId?.loginId || "system"}{h.details?.reason ? ` · "${h.details.reason}"` : ""}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminVerificationPage() {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState({ data: [], total: 0, limit: 20 });
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setQueue(await api(`/verification/queue?status=${status}&page=${page}&limit=20`));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, [status, page]);

  const pages = Math.max(1, Math.ceil(queue.total / queue.limit));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Student Verification</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Students enter their own academic details. Only details you approve here count towards eligibility and
          department/batch analytics. Every decision is recorded in an audit trail.
        </p>
      </div>

      <ImportRecords onDone={load} />

      <div>
        <div className="flex gap-2 mb-4">
          {STATUS_TABS.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                    className={`text-sm rounded-full px-3 py-1 border ${status === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600"}`}>
              {s}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <p className="text-sm text-slate-500 mb-3">{queue.total} {status} student{queue.total === 1 ? "" : "s"}</p>

        <div className="space-y-3">
          {queue.data.map((item) => <QueueItem key={item.profileId} item={item} onChanged={load} />)}
          {queue.data.length === 0 && !error && <p className="text-sm text-slate-500">Nothing here.</p>}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-3 mt-4 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border rounded-md px-3 py-1 disabled:opacity-40">Previous</button>
            <span className="text-slate-500">Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="border rounded-md px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
