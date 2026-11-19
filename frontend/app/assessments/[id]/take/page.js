"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/api";

export default function TakeAssessmentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [attempt, setAttempt] = useState(null); // { attemptId, expiresAt, questions }
  const [answers, setAnswers] = useState({}); // questionId -> selectedOptionIndex
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const submittedRef = useRef(false);

  useEffect(() => {
    api(`/assessments/${id}/start`, { method: "POST" })
      .then((res) => {
        setAttempt(res);
        setSecondsLeft(Math.max(0, Math.floor((new Date(res.expiresAt) - new Date()) / 1000)));
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (secondsLeft === null || result) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, result]);

  async function handleSubmit() {
    if (submittedRef.current || !attempt) return;
    submittedRef.current = true;
    const payload = Object.entries(answers).map(([questionId, selectedOptionIndex]) => ({
      questionId, selectedOptionIndex,
    }));
    try {
      const res = await api(`/assessments/attempts/${attempt.attemptId}/submit`, {
        method: "POST",
        body: { answers: payload },
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!attempt) return <p className="text-slate-500">Starting assessment…</p>;

  if (result) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-2">Score: {result.score} / {result.maxScore}</h1>
        <p className="text-slate-500 mb-6">
          If this assessment is linked to a skill, your verified level has been updated.
        </p>
        <button onClick={() => router.push("/assessments")} className="bg-indigo-600 text-white rounded-md px-4 py-2">
          Back to Assessments
        </button>
      </div>
    );
  }

  const q = attempt.questions[current];
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">Question {current + 1} of {attempt.questions.length}</span>
        <span className={`text-sm font-mono ${secondsLeft < 60 ? "text-red-600" : "text-slate-600"}`}>
          {mins}:{secs}
        </span>
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <p className="font-medium mb-4">{q.text}</p>
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={q._id} checked={answers[q._id] === i}
                     onChange={() => setAnswers((a) => ({ ...a, [q._id]: i }))} />
              {opt}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}
                className="text-sm px-4 py-2 rounded-md border disabled:opacity-40">
          Previous
        </button>
        {current < attempt.questions.length - 1 ? (
          <button onClick={() => setCurrent((c) => c + 1)} className="text-sm px-4 py-2 rounded-md bg-slate-800 text-white">
            Next
          </button>
        ) : (
          <button onClick={handleSubmit} className="text-sm px-4 py-2 rounded-md bg-indigo-600 text-white">
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
