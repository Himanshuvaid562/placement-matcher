"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";

export default function AdminAssessmentDetailPage() {
  const { id } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState("");

  async function load() {
    const [a, q] = await Promise.all([api("/assessments"), api(`/assessments/${id}/questions`)]);
    setAssessment(a.data.find((x) => x._id === id));
    setQuestions(q.data);
  }
  useEffect(() => { load(); }, [id]);

  async function addQuestion(e) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.target);
    try {
      await api(`/assessments/${id}/questions`, {
        method: "POST",
        body: {
          text: form.get("text"),
          options: options.filter((o) => o.trim()),
          correctOptionIndex: Number(form.get("correctOptionIndex")),
          marks: Number(form.get("marks") || 1),
        },
      });
      e.target.reset();
      setOptions(["", ""]);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function publish() {
    setError("");
    try {
      await api(`/assessments/${id}/publish`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!assessment) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{assessment.title}</h1>
          <p className="text-sm text-slate-500">{assessment.type} · {assessment.durationMinutes} min</p>
        </div>
        {!assessment.isPublished && (
          <button onClick={publish} className="bg-slate-800 text-white rounded-md px-4 py-2 text-sm">
            Publish ({questions.length} question{questions.length === 1 ? "" : "s"})
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!assessment.isPublished && (
        <form onSubmit={addQuestion} className="space-y-3 max-w-lg border border-slate-200 rounded-lg p-4">
          <textarea name="text" placeholder="Question text" className="w-full border rounded-md px-3 py-2" required />
          {options.map((opt, i) => (
            <input key={i} value={opt}
                   onChange={(e) => setOptions((o) => o.map((x, idx) => (idx === i ? e.target.value : x)))}
                   placeholder={`Option ${i + 1}`} className="w-full border rounded-md px-3 py-2 text-sm" />
          ))}
          <button type="button" onClick={() => setOptions((o) => [...o, ""])} className="text-xs text-indigo-600">
            + add option
          </button>
          <div className="grid grid-cols-2 gap-2">
            <select name="correctOptionIndex" className="border rounded-md px-3 py-2" required>
              <option value="">Correct option…</option>
              {options.map((_, i) => <option key={i} value={i}>Option {i + 1}</option>)}
            </select>
            <input name="marks" type="number" placeholder="Marks" defaultValue={1} className="border rounded-md px-3 py-2" />
          </div>
          <button className="bg-indigo-600 text-white rounded-md px-4 py-2">Add Question</button>
        </form>
      )}

      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={q._id} className="border border-slate-200 rounded-lg p-3 text-sm">
            <p className="font-medium">{i + 1}. {q.text}</p>
            <ul className="mt-1 text-slate-500">
              {q.options.map((o, idx) => (
                <li key={idx} className={idx === q.correctOptionIndex ? "text-green-600 font-medium" : ""}>
                  {o} {idx === q.correctOptionIndex ? "(correct)" : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
