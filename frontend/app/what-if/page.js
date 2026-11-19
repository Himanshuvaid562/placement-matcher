"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

const pct = (n) => `${Number(n).toFixed(1)}%`;
const sign = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default function WhatIfPage() {
  const [next, setNext] = useState(null);
  const [oppId, setOppId] = useState("");
  const [changes, setChanges] = useState({}); // skillId -> target level
  const [sim, setSim] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/students/me/what-if/next-skills")
      .then((res) => {
        setNext(res);
        const first = res.roles.find((r) => r.eligible) || res.roles[0];
        if (first) setOppId(first.id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const changeList = useMemo(
    () => Object.entries(changes).filter(([, level]) => level).map(([skillId, level]) => ({ skillId, level: Number(level) })),
    [changes]
  );

  // Re-run the simulation whenever the role or the chosen levels change
  useEffect(() => {
    if (!oppId) return;
    let cancelled = false;
    api("/students/me/what-if", { method: "POST", body: { opportunityId: oppId, changes: changeList } })
      .then((res) => { if (!cancelled) { setSim(res); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [oppId, changeList]);

  function tryIt(item) {
    setOppId(item.topRoles[0].opportunityId);
    setChanges({ [item.skillId]: item.targetLevel });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  if (error && !next) return <p className="text-red-600">{error}</p>;
  if (!next) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">What if…?</h1>
        <p className="text-sm text-slate-500 mt-1">
          See how improving a skill would change your match, before you spend weeks on it. Nothing here is saved, and it uses the same
          scoring as your readiness pages. To make an improvement real, pass the assessment or add a certificate that faculty verify.
        </p>
      </div>

      {next.provisional && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3">
          Roles you can apply to are judged on academic details the university has not verified yet, so this advice is provisional.{" "}
          <Link href="/profile" className="underline">Submit your details for verification</Link>.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your best next skills</h2>
        {next.data.length === 0 ? (
          <p className="text-sm text-slate-500">
            {next.considered === 0
              ? "You are not academically eligible for any open role right now, so there is nothing to recommend."
              : "You already meet every skill requirement for the roles you can apply to. Nicely done."}
          </p>
        ) : (
          next.data.map((r, i) => (
            <div key={r.skillId} className="border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">
                  <span className="text-slate-400 mr-2">#{i + 1}</span>
                  Reach level {r.targetLevel} in {r.skillName}
                  <span className="text-slate-400 font-normal"> (you are at {r.currentLevel})</span>
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  Lifts your match by <strong>{r.totalLift.toFixed(1)} points</strong> across {r.rolesImproved} role{r.rolesImproved > 1 ? "s" : ""}.
                </p>
                <ul className="text-xs text-slate-500 mt-1 space-y-0.5">
                  {r.topRoles.map((t) => (
                    <li key={t.opportunityId}>{t.role} · {t.company}: {pct(t.before)} → {pct(t.after)} ({sign(t.gain)})</li>
                  ))}
                </ul>
              </div>
              <button onClick={() => tryIt(r)} className="shrink-0 bg-slate-900 text-white rounded-md px-3 py-1.5 text-sm">Try it</button>
            </div>
          ))
        )}
        {next.excluded > 0 && (
          <p className="text-xs text-slate-400">
            {next.excluded} open role{next.excluded > 1 ? "s were" : " was"} left out because you do not meet the academic requirements, so we do not suggest studying for {next.excluded > 1 ? "them" : "it"}.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Try your own</h2>
        <select value={oppId} onChange={(e) => { setOppId(e.target.value); setChanges({}); }} className="border rounded-md px-3 py-2">
          {next.roles.map((r) => (
            <option key={r.id} value={r.id}>{r.role} · {r.company}{r.eligible ? "" : " (not eligible)"}</option>
          ))}
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}

        {sim && (
          <>
            <div className="border border-slate-200 rounded-lg p-4 flex items-baseline gap-4">
              <span className="text-slate-500">{pct(sim.baselineScore)}</span>
              <span className="text-slate-300">→</span>
              <span className="text-3xl font-bold">{pct(sim.scenarioScore)}</span>
              <span className={`text-sm font-medium ${sim.delta > 0 ? "text-green-600" : "text-slate-400"}`}>{sign(sim.delta)} points</span>
              <button onClick={() => setChanges({})} className="ml-auto text-xs text-slate-400 hover:text-slate-700">Reset</button>
            </div>
            {!sim.opportunity.eligible && (
              <p className="text-xs text-amber-700">You do not meet this role&apos;s academic requirements, so the skill score alone would not make you eligible.</p>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr><th className="px-4 py-2">Skill</th><th className="px-4 py-2">Needed</th><th className="px-4 py-2">Now</th><th className="px-4 py-2">If you reach…</th></tr>
                </thead>
                <tbody>
                  {sim.rows.map((r) => (
                    <tr key={r.skillId} className="border-t border-slate-100">
                      <td className="px-4 py-2">{r.skillName}</td>
                      <td className="px-4 py-2">{r.required}</td>
                      <td className="px-4 py-2">{r.before}{r.before >= r.required && <span className="text-green-600"> ✓</span>}</td>
                      <td className="px-4 py-2">
                        {r.before >= 5 ? <span className="text-slate-400">at the top</span> : (
                          <select value={changes[r.skillId] || ""} onChange={(e) => setChanges((c) => ({ ...c, [r.skillId]: e.target.value ? Number(e.target.value) : undefined }))}
                                  className="border rounded-md px-2 py-1">
                            <option value="">no change</option>
                            {[1, 2, 3, 4, 5].filter((n) => n > r.before).map((n) => <option key={n} value={n}>level {n}</option>)}
                          </select>
                        )}
                        {r.raised && <span className="text-green-600 text-xs ml-2">{sign(r.contributionAfter - r.contributionBefore)} pts</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sim.ripple.length > 1 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Effect on your other open roles</h3>
                <ul className="text-sm space-y-1">
                  {sim.ripple.filter((r) => r.opportunityId !== oppId).map((r) => (
                    <li key={r.opportunityId} className="flex justify-between border-b border-slate-100 py-1">
                      <span>{r.role} · {r.company}{!r.eligible && <span className="text-xs text-amber-700"> (not eligible)</span>}</span>
                      <span className="text-slate-500">{pct(r.baselineScore)} → {pct(r.scenarioScore)} <span className="text-green-600">({sign(r.delta)})</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
