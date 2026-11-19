"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function ReadinessTrend({ history = [] }) {
  const data = history.map((h) => ({
    date: new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: h.matchScore,
  }));

  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h3 className="font-medium text-slate-800 mb-1">Skill match over time</h3>
      {data.length < 2 ? (
        <p className="text-sm text-slate-500">
          {data.length === 0
            ? "No history yet."
            : "Your first score is recorded. Update your skills or take an assessment and your progress will appear here."}
        </p>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis domain={[0, 100]} fontSize={12} unit="%" />
              <Tooltip formatter={(v) => [`${v}%`, "Match"]} />
              <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
