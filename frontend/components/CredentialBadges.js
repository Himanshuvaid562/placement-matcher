export function StatusPill({ status }) {
  const style = {
    pending: "bg-sky-100 text-sky-800",
    verified: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  }[status] || "bg-slate-100 text-slate-700";
  const label = { pending: "Pending review", verified: "Verified by faculty", rejected: "Rejected" }[status] || status;
  return <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${style}`}>{label}</span>;
}

export function TypeBadge({ type }) {
  return (
    <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
      {type === "mooc" ? "MOOC" : "Certificate"}
    </span>
  );
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
export const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
