"use client";
import Link from "next/link";
import { useAuth } from "../lib/authContext";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
      <Link href="/" className="font-semibold text-slate-800">P06 · Placement Readiness</Link>
      <div className="flex items-center gap-4 text-sm">
        {user?.role === "student" && (
          <>
            <Link href="/dashboard" className="hover:text-indigo-600">Dashboard</Link>
            <Link href="/profile" className="hover:text-indigo-600">Profile</Link>
            <Link href="/opportunities" className="hover:text-indigo-600">Opportunities</Link>
            <Link href="/credentials" className="hover:text-indigo-600">Certificates</Link>
            <Link href="/assessments" className="hover:text-indigo-600">Assessments</Link>
            <Link href="/what-if" className="hover:text-indigo-600">What-if</Link>
            <Link href="/resume" className="hover:text-indigo-600">Resume</Link>
          </>
        )}
        {user?.role === "officer" && (
          <>
            <Link href="/admin/verification" className="hover:text-indigo-600">Verification</Link>
            <Link href="/admin/credentials" className="hover:text-indigo-600">Certificates</Link>
            <Link href="/admin/opportunities" className="hover:text-indigo-600">Opportunities</Link>
            <Link href="/admin/companies" className="hover:text-indigo-600">Companies</Link>
            <Link href="/admin/skills" className="hover:text-indigo-600">Skills</Link>
            <Link href="/admin/assessments" className="hover:text-indigo-600">Assessments</Link>
            <Link href="/admin/analytics" className="hover:text-indigo-600">Analytics</Link>
          </>
        )}
        {user ? (
          <>
            <span className="text-xs text-slate-400" title={user.role === "officer" ? "Faculty ID" : "Registration number"}>{user.loginId}</span>
            <Link href="/change-password" className="text-slate-500 hover:text-indigo-600">Password</Link>
            <button onClick={logout} className="text-slate-500 hover:text-red-600">Logout</button>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:text-indigo-600">Login</Link>
            <Link href="/register" className="hover:text-indigo-600">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
