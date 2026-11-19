const SOURCE = {
  verified: { label: "Assessment", cls: "text-green-700 bg-green-50" },
  certificate: { label: "Certificate", cls: "text-sky-700 bg-sky-50" },
  self: { label: "Self-reported", cls: "text-amber-700 bg-amber-50" },
  missing: { label: "No evidence", cls: "text-red-700 bg-red-50" },
};

// Other evidence on file for the same skill, shown small under the level
function otherEvidence(b) {
  const e = b.evidence || {};
  const parts = [];
  if (e.assessment != null && b.source !== "verified") parts.push(`assessment ${e.assessment}`);
  if (e.certificate != null && b.source !== "certificate") parts.push(`certificate ${e.certificate}`);
  if (e.self != null && b.source !== "self") parts.push(`self-reported ${e.self}`);
  return parts.join(" · ");
}

export default function SkillBreakdownTable({ breakdown = [] }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left px-4 py-2">Skill</th>
            <th className="text-left px-4 py-2">Required</th>
            <th className="text-left px-4 py-2">Your level</th>
            <th className="text-left px-4 py-2">Backed by</th>
            <th className="text-left px-4 py-2">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b) => {
            const src = SOURCE[b.source] || SOURCE.missing;
            const other = otherEvidence(b);
            return (
              <tr key={b.skillId} className="border-t border-slate-100">
                <td className="px-4 py-2">{b.skillName || b.skillId}</td>
                <td className="px-4 py-2">{b.required}</td>
                <td className="px-4 py-2">
                  {b.actual}
                  {other && <span className="block text-xs text-slate-400">also on file: {other}</span>}
                </td>
                <td className="px-4 py-2"><span className={`text-xs rounded-full px-2 py-0.5 ${src.cls}`}>{src.label}</span></td>
                <td className="px-4 py-2">{b.contributionPct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 px-4 py-2 border-t border-slate-100">
        Strongest evidence wins: an assessment result, then a faculty-verified certificate (counts up to a limited level), then your own claim.
      </p>
    </div>
  );
}
