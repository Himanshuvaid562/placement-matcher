"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

export default function AdminOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [skills, setSkills] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([{ skillId: "", minLevel: 3, weight: 1 }]);

  async function load() {
    const [o, c, s] = await Promise.all([api("/opportunities"), api("/companies"), api("/skills")]);
    setOpportunities(o.data);
    setCompanies(c.data);
    setSkills(s.data);
  }

  useEffect(() => { load(); }, []);

  function updateSkillRow(i, field, value) {
    setSelectedSkills((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addSkillRow() {
    setSelectedSkills((rows) => [...rows, { skillId: "", minLevel: 3, weight: 1 }]);
  }
  function removeSkillRow(i) {
    setSelectedSkills((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function createOpportunity(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    await api("/opportunities", {
      method: "POST",
      body: {
        companyId: form.get("companyId"),
        role: form.get("role"),
        description: form.get("description"),
        requiredSkills: selectedSkills.filter((s) => s.skillId),
        eligibilityRule: {
          minCgpa: Number(form.get("minCgpa") || 0),
          eligibleDepartments: (form.get("departments") || "").split(",").map((s) => s.trim()).filter(Boolean),
          eligibleBatchYears: (form.get("batchYears") || "").split(",").map(Number).filter(Boolean),
          maxBacklogs: Number(form.get("maxBacklogs") || 0),
        },
      },
    });
    e.target.reset();
    setSelectedSkills([{ skillId: "", minLevel: 3, weight: 1 }]);
    load();
  }

  async function publish(id) {
    await api(`/opportunities/${id}/publish`, { method: "PATCH" });
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Manage Opportunities</h1>
        <Link href="/admin/skills" className="text-sm text-indigo-600">Manage skill catalog →</Link>
      </div>

      <form onSubmit={createOpportunity} className="space-y-3 max-w-xl border border-slate-200 rounded-lg p-4">
        <select name="companyId" className="w-full border rounded-md px-3 py-2" required>
          <option value="">Select company…</option>
          {companies.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <input name="role" placeholder="Role title" className="w-full border rounded-md px-3 py-2" required />
        <textarea name="description" placeholder="Description" className="w-full border rounded-md px-3 py-2" />

        <div className="grid grid-cols-3 gap-2">
          <input name="minCgpa" placeholder="Min CGPA" type="number" step="0.1" className="border rounded-md px-3 py-2" />
          <input name="departments" placeholder="Departments (CSE,IT)" className="border rounded-md px-3 py-2" />
          <input name="batchYears" placeholder="Batch years (2026,2027)" className="border rounded-md px-3 py-2" />
        </div>
        <input name="maxBacklogs" placeholder="Max backlogs" type="number" className="border rounded-md px-3 py-2 w-full" />

        <div>
          <p className="text-sm font-medium mb-2">Required skills</p>
          {skills.length === 0 && (
            <p className="text-xs text-amber-600 mb-2">
              No skills in the catalog yet — <Link href="/admin/skills" className="underline">add some first</Link>.
            </p>
          )}
          {selectedSkills.map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
              <select value={row.skillId} onChange={(e) => updateSkillRow(i, "skillId", e.target.value)}
                      className="border rounded-md px-2 py-1 text-sm col-span-2">
                <option value="">Select skill…</option>
                {skills.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <input placeholder="Min level (1-5)" type="number" min={1} max={5} value={row.minLevel}
                     onChange={(e) => updateSkillRow(i, "minLevel", Number(e.target.value))}
                     className="border rounded-md px-2 py-1 text-sm" />
              <div className="flex gap-1">
                <input placeholder="Weight" type="number" step="0.05" value={row.weight}
                       onChange={(e) => updateSkillRow(i, "weight", Number(e.target.value))}
                       className="border rounded-md px-2 py-1 text-sm flex-1" />
                {selectedSkills.length > 1 && (
                  <button type="button" onClick={() => removeSkillRow(i)} className="text-red-500 text-xs px-1">✕</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={addSkillRow} className="text-xs text-indigo-600">+ add skill</button>
        </div>

        <button className="bg-indigo-600 text-white rounded-md px-4 py-2">Create Opportunity (draft)</button>
      </form>

      <div className="space-y-2">
        {opportunities.map((o) => (
          <div key={o._id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
            <div>
              <p className="font-medium">{o.role} — {o.companyId?.name}</p>
              <p className="text-xs text-slate-400">{o.status}</p>
            </div>
            {o.status !== "published" && (
              <button onClick={() => publish(o._id)} className="text-sm bg-slate-800 text-white rounded-md px-3 py-1">
                Publish
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
