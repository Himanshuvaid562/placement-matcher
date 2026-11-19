"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await api("/skills");
    setSkills(res.data);
  }
  useEffect(() => { load(); }, []);

  async function addSkill(e) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.target);
    try {
      await api("/skills", { method: "POST", body: { name: form.get("name"), category: form.get("category") } });
      e.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const byCategory = skills.reduce((acc, s) => {
    const cat = s.category || "Uncategorized";
    (acc[cat] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Skill Catalog</h1>
      <p className="text-sm text-slate-500">
        Skills added here become available to students for self-reporting and to you when
        building an opportunity&apos;s required-skills list.
      </p>

      <form onSubmit={addSkill} className="flex gap-2 max-w-lg">
        <input name="name" placeholder="Skill name (e.g. Node.js)" className="border rounded-md px-3 py-2 flex-1" required />
        <input name="category" placeholder="Category (e.g. Framework)" className="border rounded-md px-3 py-2 flex-1" />
        <button className="bg-indigo-600 text-white rounded-md px-4">Add</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        {Object.entries(byCategory).map(([cat, list]) => (
          <div key={cat}>
            <h3 className="text-sm font-medium text-slate-500 mb-1">{cat}</h3>
            <div className="flex flex-wrap gap-2">
              {list.map((s) => (
                <span key={s._id} className="text-sm bg-slate-100 rounded-full px-3 py-1">{s.name}</span>
              ))}
            </div>
          </div>
        ))}
        {skills.length === 0 && <p className="text-sm text-slate-500">No skills yet — add the first one above.</p>}
      </div>
    </div>
  );
}
