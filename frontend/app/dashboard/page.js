"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function DashboardPage() {
  const [profile, setProfile] = useState(null);
  const [completion, setCompletion] = useState(0);
  const [opportunities, setOpportunities] = useState([]);

  useEffect(() => {
    api("/students/me/profile").then((res) => { setProfile(res.profile); setCompletion(res.completionPct); });
    api("/opportunities").then((res) => setOpportunities(res.data));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your Readiness Dashboard</h1>

      {profile && profile.verification?.status !== "verified" && (
        <Link href="/profile" className="block border border-amber-300 bg-amber-50 text-amber-900 rounded-lg p-3 text-sm">
          {profile.verification?.status === "pending"
            ? "Your academic details are awaiting verification by the Placement Office."
            : profile.verification?.status === "rejected"
            ? "Your verification was not approved. Open your profile to see why and resubmit."
            : "Your academic details are not verified yet. Eligibility results are provisional until the university verifies them."}
          {" "}<span className="underline">Open profile</span>
        </Link>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-500">Profile completion</p>
          <p className="text-2xl font-bold">{completion}%</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-500">Department</p>
          <p className="text-2xl font-bold">{profile?.department || "—"}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-500">CGPA</p>
          <p className="text-2xl font-bold">{profile?.cgpa ?? "—"}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Check readiness against an opportunity</h2>
        <div className="space-y-2">
          {opportunities.map((o) => (
            <Link key={o._id} href={`/opportunities/${o._id}`}
                  className="block border border-slate-200 rounded-lg p-3 hover:border-indigo-400 text-sm">
              {o.role} · {o.companyId?.name}
            </Link>
          ))}
          {opportunities.length === 0 && <p className="text-slate-500 text-sm">No opportunities published yet.</p>}
        </div>
      </div>
    </div>
  );
}
