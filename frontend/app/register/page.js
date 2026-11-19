"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";

// Mirrors the server's rules (the server is the one that actually enforces them)
const RULES = {
  student: { pattern: /^\d{8,20}$/, label: "UMS registration number", hint: "8 or more digits, e.g. 12092351" },
  officer: { pattern: /^\d{5,20}$/, label: "Faculty / employee ID", hint: "5 or more digits" },
};

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rule = RULES[role];

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!rule.pattern.test(loginId.trim())) return setError(`${rule.label}: ${rule.hint}`);
    setBusy(true);
    try {
      const user = await register(loginId.trim(), password, role, role === "officer" ? inviteCode : undefined);
      router.push(user.role === "officer" ? "/admin/verification" : "/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-xl font-semibold mb-6">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <select className="w-full border rounded-md px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="student">Student</option>
          <option value="officer">Faculty / Placement Officer</option>
        </select>

        <div>
          <input className="w-full border rounded-md px-3 py-2" placeholder={rule.label}
                 value={loginId} onChange={(e) => setLoginId(e.target.value)} inputMode="numeric" autoComplete="username" required />
          <p className="text-xs text-slate-400 mt-1">
            {rule.hint}.{role === "student" && " This becomes your permanent login and cannot be changed later."}
          </p>
        </div>

        <div>
          <input className="w-full border rounded-md px-3 py-2" placeholder="Choose a password (min 8 characters)"
                 value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} autoComplete="new-password" required />
          <p className="text-xs text-amber-700 mt-1">
            This app has its own password. Do not reuse your UMS password here.
          </p>
        </div>

        {role === "officer" && (
          <div>
            <input className="w-full border rounded-md px-3 py-2" placeholder="Officer invite code"
                   value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} type="password" required />
            <p className="text-xs text-slate-400 mt-1">Faculty accounts require an invite code from the Placement Cell.</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full bg-indigo-600 text-white rounded-md py-2 font-medium hover:bg-indigo-700 disabled:opacity-50">
          {busy ? "Creating…" : "Register"}
        </button>
      </form>
    </div>
  );
}
