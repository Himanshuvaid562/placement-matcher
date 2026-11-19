"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(loginId.trim(), password);
      if (user.mustChangePassword) return router.push("/change-password");
      router.push(user.role === "officer" ? "/admin/verification" : "/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-xl font-semibold mb-1">Log in</h1>
      <p className="text-sm text-slate-500 mb-6">
        Students: your UMS registration number. Faculty: your employee ID.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input className="w-full border rounded-md px-3 py-2" placeholder="Registration no. / Faculty ID"
               value={loginId} onChange={(e) => setLoginId(e.target.value)} inputMode="numeric" autoComplete="username" required />
        <input className="w-full border rounded-md px-3 py-2" placeholder="Password"
               value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full bg-indigo-600 text-white rounded-md py-2 font-medium hover:bg-indigo-700 disabled:opacity-50">
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-xs text-slate-400 mt-4">
        Forgot your password? Visit the Placement Office with your ID card; they can issue a temporary one.
      </p>
    </div>
  );
}
