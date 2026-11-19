const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export default function VerificationBanner({ verification, onSubmit, busy }) {
  const status = verification?.status || "unverified";

  const styles = {
    unverified: "border-amber-300 bg-amber-50 text-amber-900",
    pending: "border-sky-300 bg-sky-50 text-sky-900",
    verified: "border-green-300 bg-green-50 text-green-900",
    rejected: "border-red-300 bg-red-50 text-red-900",
  }[status];

  return (
    <div className={`border rounded-lg p-4 text-sm ${styles}`}>
      {status === "unverified" && (
        <>
          <p className="font-medium">Your academic details are not verified yet</p>
          <p className="mt-1">
            Eligibility results are shown to you as provisional. They do not count with the Placement Team until
            the university verifies your registration number, department, batch, CGPA and backlogs.
          </p>
        </>
      )}
      {status === "pending" && (
        <>
          <p className="font-medium">Awaiting verification by the Placement Office</p>
          <p className="mt-1">Submitted on {fmt(verification.submittedAt)}. Editing academic details now will cancel this request.</p>
        </>
      )}
      {status === "verified" && (
        <>
          <p className="font-medium">Verified by the university on {fmt(verification.reviewedAt)}</p>
          <p className="mt-1">
            {verification.method === "official_record"
              ? "Checked against the university's official academic record."
              : "Checked against your documents by the Placement Office."}{" "}
            Changing any academic detail will remove this verification and you will need to resubmit.
          </p>
        </>
      )}
      {status === "rejected" && (
        <>
          <p className="font-medium">Verification was not approved</p>
          <p className="mt-1">Reason: {verification.rejectionReason || "not given"}. Correct your details and submit again.</p>
        </>
      )}

      {(status === "unverified" || status === "rejected") && (
        <button onClick={onSubmit} disabled={busy}
                className="mt-3 bg-slate-900 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Submitting…" : "Submit for verification"}
        </button>
      )}
    </div>
  );
}
