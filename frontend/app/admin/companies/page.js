"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState([]);

  async function load() {
    const res = await api("/companies");
    setCompanies(res.data);
  }
  useEffect(() => { load(); }, []);

  const [error, setError] = useState("");

  async function createCompany(e) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.target);
    try {
      await api("/companies", {
        method: "POST",
        body: { name: form.get("name"), description: form.get("description"), contactEmail: form.get("contactEmail") || undefined },
      });
      e.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Companies</h1>
      <form onSubmit={createCompany} className="flex flex-wrap gap-2 max-w-2xl">
        <input name="name" placeholder="Company name" className="border rounded-md px-3 py-2 flex-1 min-w-40" required />
        <input name="description" placeholder="Description" className="border rounded-md px-3 py-2 flex-1 min-w-40" />
        <input name="contactEmail" type="email" placeholder="HR contact email (optional)" className="border rounded-md px-3 py-2 flex-1 min-w-48" />
        <button className="bg-indigo-600 text-white rounded-md px-4">Add</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">Contact emails are visible to placement staff only, never to students.</p>
      <ul className="space-y-1">
        {companies.map((c) => (
          <li key={c._id} className="border-b border-slate-100 py-2 text-sm">
            {c.name}{c.description ? ` — ${c.description}` : ""}
            {c.contactEmail && <span className="text-slate-400"> · {c.contactEmail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
