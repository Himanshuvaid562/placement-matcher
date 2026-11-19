export default function MatchScoreGauge({ score }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-medium text-slate-800">Skill Match Score</h3>
        <span className="text-2xl font-bold text-slate-900">{pct}%</span>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-2">
        This score reflects skill alignment only — it is not a placement guarantee.
      </p>
    </div>
  );
}
