// The link's secret token lives in the URL, so this page must never be indexed by search engines
// and must not leak the URL (and token) to other sites through the Referer header.
export const metadata = {
  title: "Verify a student's details",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function VerifyLayout({ children }) {
  return children;
}
