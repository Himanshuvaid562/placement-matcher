import Link from "next/link";

export default function EligibilityChecklist({ eligibility }) {
  if (!eligibility) return null;
  const verified = eligibility.verified === true;

  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-slate-800">Academic Eligibility</h3>
        <span className={`text-sm font-semibold ${eligibility.eligible ? "text-green-600" : "text-red-600"}`}>
          {eligibility.eligible ? "Eligible" : "Not Eligible"}{!verified && " (provisional)"}
        </span>
      </div>

      {verified ? (
        <p className="text-xs text-green-700 mb-3">✓ Based on details verified by the university</p>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
          Provisional: based on the details you entered, which the university has not verified
          ({eligibility.verificationStatus || "unverified"}). It will not count with the Placement Team until it is.{" "}
          <Link href="/profile" className="underline">Go to your profile</Link>
        </p>
      )}

      <ul className="space-y-2">
        {eligibility.checks.map((c) => (
          <li key={c.rule} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{c.rule}</span>
            <span className={c.passed ? "text-green-600" : "text-red-500"}>
              {String(c.actual)} {c.passed ? "✓" : `(needs ${JSON.stringify(c.required)})`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
