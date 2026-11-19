"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { api, apiDownload } from "../../../lib/api";

function Stat({ label, value, suffix = "" }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold">{value}{suffix}</p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState(null);
  const [distribution, setDistribution] = useState([]);
  const [batches, setBatches] = useState([]);
  const [excluded, setExcluded] = useState(0);
  const [opportunities, setOpportunities] = useState([]);
  const [selectedOpp, setSelectedOpp] = useState("");
  const [gaps, setGaps] = useState([]);
  const [eligible, setEligible] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/analytics/overview").then(setOverview).catch((e) => setError(e.message));
    api("/analytics/departments/skill-distribution").then((res) => {
      setExcluded(res.excludedUnverified || 0);
      // Collapse per-skill rows into one average per department
      const byDept = {};
      for (const r of res.data) {
        const d = r._id.department || "Unknown";
        (byDept[d] ||= { sum: 0, n: 0 });
        byDept[d].sum += (r.avgLevel || 0) * r.studentCount;
        byDept[d].n += r.studentCount;
      }
      setDistribution(
        Object.entries(byDept).map(([label, v]) => ({ label, avgLevel: Math.round((v.sum / v.n) * 10) / 10 }))
      );
    });
    api("/analytics/batches/summary").then((res) =>
      setBatches(res.data.map((b) => ({ ...b, label: b.batchYear ?? "Unknown" })))
    );
    api("/opportunities").then((res) => setOpportunities(res.data));
  }, []);

  async function loadOpportunityAnalytics(oppId) {
    setSelectedOpp(oppId);
    setError("");
    if (!oppId) { setGaps([]); setEligible(null); return; }
    try {
      const [g, e] = await Promise.all([
        api(`/analytics/skill-gaps/common?opportunityId=${oppId}`),
        api(`/analytics/opportunities/${oppId}/eligible-students`),
      ]);
      setGaps(g.data);
      setEligible(e);
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportCsv() {
    setError("");
    try {
      await apiDownload(`/analytics/opportunities/${selectedOpp}/eligible-students/export`, "eligible-students.csv");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Placement Analytics</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Stat label="Registered students" value={overview.totalStudents} />
          <Stat label="University-verified" value={overview.verification?.verified ?? 0} suffix={` / ${overview.totalStudents}`} />
          <Stat label="Awaiting verification" value={overview.verification?.pending ?? 0} />
          <Stat label="Certificates to review" value={overview.pendingCredentials ?? 0} />
          <Stat label="Published opportunities" value={overview.publishedOpportunities} />
          <Stat label="Assessment participation" value={overview.assessmentParticipationPct} suffix="%" />
          <Stat label="Avg. profile completion" value={overview.avgProfileCompletionPct} suffix="%" />
        </div>
      )}

      {excluded > 0 && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3">
          Department and batch figures only include university-verified students. {excluded} student{excluded === 1 ? " is" : "s are"} excluded
          until their details are verified.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Average skill level by department</h2>
          <div className="border border-slate-200 rounded-lg p-4" style={{ height: 300 }}>
            {distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis domain={[0, 5]} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="avgLevel" name="Avg level (1-5)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">Not enough skill data yet.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Batch-wise summary</h2>
          <div className="border border-slate-200 rounded-lg p-4" style={{ height: 300 }}>
            {batches.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={batches}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="students" name="Students" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgSkillLevel" name="Avg skill level" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">No batch data yet.</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Per-opportunity readiness</h2>
        <select value={selectedOpp} onChange={(e) => loadOpportunityAnalytics(e.target.value)}
                className="border rounded-md px-3 py-2 mb-4">
          <option value="">Select an opportunity…</option>
          {opportunities.map((o) => (
            <option key={o._id} value={o._id}>{o.role} · {o.companyId?.name}</option>
          ))}
        </select>

        {eligible && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-500">Eligible candidates</p>
              <p className="text-2xl font-bold">
                {eligible.eligibleCount} <span className="text-sm text-slate-400 font-normal">/ {eligible.totalCandidates} students</span>
              </p>
              <p className="text-xs text-slate-500">Verified by the university and meeting every rule.</p>
              {eligible.awaitingVerificationCount > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  +{eligible.awaitingVerificationCount} more would qualify on their own claim but are not verified yet.
                </p>
              )}
              <button onClick={exportCsv} disabled={eligible.eligibleCount === 0}
                      className="mt-3 text-sm bg-slate-800 text-white rounded-md px-3 py-1 disabled:opacity-40">
                Export verified-eligible students (CSV)
              </button>
              <p className="text-xs text-slate-400 mt-2">
                The export lists registration numbers and academic details. Handle it per the placement cell&apos;s data-protection rules.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-500 mb-2">Common skill gaps (students below the required level)</p>
              {gaps.length === 0 ? (
                <p className="text-sm text-slate-500">No gaps found.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {gaps.slice(0, 5).map((g) => (
                    <li key={g.skillId} className="flex justify-between">
                      <span className="text-slate-600">{g.skillName}</span>
                      <span className="text-slate-500">{g.studentsWithGap} students</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
