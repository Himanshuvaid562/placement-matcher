"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [attempts, setAttempts] = useState([]);

  useEffect(() => {
    api("/assessments").then((res) => setAssessments(res.data));
    api("/students/me/attempts").then((res) => setAttempts(res.data));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-4">Available Assessments</h1>
        <div className="space-y-2">
          {assessments.map((a) => (
            <div key={a._id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
              <div>
                <p className="font-medium">{a.title}</p>
                <p className="text-xs text-slate-400">{a.type} · {a.durationMinutes} min</p>
              </div>
              <Link href={`/assessments/${a._id}/take`} className="text-sm bg-indigo-600 text-white rounded-md px-3 py-1">
                Start
              </Link>
            </div>
          ))}
          {assessments.length === 0 && <p className="text-sm text-slate-500">No assessments published yet.</p>}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Your History</h2>
        <div className="space-y-1">
          {attempts.map((a) => (
            <div key={a._id} className="flex justify-between text-sm border-b border-slate-100 py-2">
              <span>{a.assessmentId?.title}</span>
              <span className="text-slate-500">
                {a.status === "submitted" ? `${a.score}/${a.maxScore}` : a.status}
              </span>
            </div>
          ))}
          {attempts.length === 0 && <p className="text-sm text-slate-500">No attempts yet.</p>}
        </div>
      </div>
    </div>
  );
}
