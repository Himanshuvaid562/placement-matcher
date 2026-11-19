"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [skills, setSkills] = useState([]);

  async function load() {
    const [a, s] = await Promise.all([api("/assessments"), api("/skills")]);
    setAssessments(a.data);
    setSkills(s.data);
  }
  useEffect(() => { load(); }, []);

  async function createAssessment(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    await api("/assessments", {
      method: "POST",
      body: {
        title: form.get("title"),
        type: form.get("type"),
        skillId: form.get("skillId") || null,
        durationMinutes: Number(form.get("durationMinutes") || 30),
      },
    });
    e.target.reset();
    load();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Assessments</h1>

      <form onSubmit={createAssessment} className="space-y-3 max-w-lg border border-slate-200 rounded-lg p-4">
        <input name="title" placeholder="Assessment title" className="w-full border rounded-md px-3 py-2" required />
        <div className="grid grid-cols-3 gap-2">
          <select name="type" className="border rounded-md px-3 py-2" required>
            <option value="technical">Technical</option>
            <option value="aptitude">Aptitude</option>
          </select>
          <select name="skillId" className="border rounded-md px-3 py-2">
            <option value="">No linked skill</option>
            {skills.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <input name="durationMinutes" type="number" placeholder="Minutes" defaultValue={30}
                 className="border rounded-md px-3 py-2" />
        </div>
        <p className="text-xs text-slate-400">
          If you link a skill, a student&apos;s score here auto-verifies their level for that skill.
        </p>
        <button className="bg-indigo-600 text-white rounded-md px-4 py-2">Create Assessment</button>
      </form>

      <div className="space-y-2">
        {assessments.map((a) => (
          <Link key={a._id} href={`/admin/assessments/${a._id}`}
                className="block border border-slate-200 rounded-lg p-3 hover:border-indigo-400">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{a.title}</span>
              <span className={a.isPublished ? "text-green-600" : "text-slate-400"}>
                {a.isPublished ? "published" : "draft"}
              </span>
            </div>
          </Link>
        ))}
        {assessments.length === 0 && <p className="text-sm text-slate-500">No assessments yet.</p>}
      </div>
    </div>
  );
}
