"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import EligibilityChecklist from "../../../components/EligibilityChecklist";
import MatchScoreGauge from "../../../components/MatchScoreGauge";
import SkillBreakdownTable from "../../../components/SkillBreakdownTable";
import ReadinessTrend from "../../../components/ReadinessTrend";

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const [opportunity, setOpportunity] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/opportunities/${id}`).then((res) => setOpportunity(res.opportunity)).catch((e) => setError(e.message));
    // Fetch readiness first: it records today's snapshot, then history includes it.
    api(`/opportunities/${id}/readiness`)
      .then((r) => { setReadiness(r); return api(`/opportunities/${id}/readiness-history`); })
      .then((h) => setHistory(h.data))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!opportunity) return <p className="text-slate-500">Loading…</p>;

  // enrich breakdown with skill names for display
  const breakdown = (readiness?.match?.breakdown || []).map((b) => {
    const rs = opportunity.requiredSkills.find((r) => String(r.skillId._id) === String(b.skillId));
    return { ...b, skillName: rs?.skillId?.name };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{opportunity.role}</h1>
        <p className="text-slate-500">{opportunity.companyId?.name}</p>
        <p className="text-sm text-slate-600 mt-2">{opportunity.description}</p>
      </div>

      {readiness && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <EligibilityChecklist eligibility={readiness.eligibility} />
            <MatchScoreGauge score={readiness.match.matchScore} />
          </div>

          <SkillBreakdownTable breakdown={breakdown} />

          <ReadinessTrend history={history} />

          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-medium text-slate-800 mb-2">Recommendations</h3>
            {readiness.recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">No gaps identified — you meet every required skill level.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {readiness.recommendations.map((r, i) => (
                  <li key={i} className="text-slate-600">• {r.suggestedAction}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
