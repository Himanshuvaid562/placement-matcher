"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";

export default function ChangePasswordPage() {
  const { user, loading, changePassword } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!user) return <p className="text-slate-600">Please log in first.</p>;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (next !== confirm) return setError("The new passwords do not match");
    setBusy(true);
    try {
      const updated = await changePassword(current, next);
      setDone(true);
      setTimeout(() => router.push(updated.role === "officer" ? "/admin/verification" : "/dashboard"), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-xl font-semibold mb-2">Change password</h1>
      {user.mustChangePassword && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3 mb-4">
          You are using a temporary password issued by the Placement Office. Choose your own password to continue.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="w-full border rounded-md px-3 py-2" type="password" placeholder={user.mustChangePassword ? "Temporary password" : "Current password"}
               value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <input className="w-full border rounded-md px-3 py-2" type="password" placeholder="New password (min 8 characters)"
               value={next} onChange={(e) => setNext(e.target.value)} minLength={8} autoComplete="new-password" required />
        <input className="w-full border rounded-md px-3 py-2" type="password" placeholder="Repeat new password"
               value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required />
        <p className="text-xs text-slate-400">Changing your password signs you out of every other device.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-green-600">Password changed. Redirecting…</p>}
        <button disabled={busy || done} className="w-full bg-indigo-600 text-white rounded-md py-2 font-medium disabled:opacity-50">
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
