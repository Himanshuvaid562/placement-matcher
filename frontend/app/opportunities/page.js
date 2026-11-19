"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState([]);

  useEffect(() => {
    api("/opportunities").then((res) => setOpportunities(res.data));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Published Opportunities</h1>
      <div className="space-y-3">
        {opportunities.map((o) => (
          <Link key={o._id} href={`/opportunities/${o._id}`}
                className="block border border-slate-200 rounded-lg p-4 hover:border-indigo-400">
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{o.role}</p>
                <p className="text-sm text-slate-500">{o.companyId?.name}</p>
              </div>
              <span className="text-xs text-slate-400 self-center">{o.requiredSkills?.length || 0} skills required</span>
            </div>
          </Link>
        ))}
        {opportunities.length === 0 && <p className="text-slate-500">No opportunities published yet.</p>}
      </div>
    </div>
  );
}
