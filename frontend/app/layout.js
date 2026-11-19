import "./globals.css";
import { AuthProvider } from "../lib/authContext";
import Navbar from "../components/Navbar";

export const metadata = { title: "P06 · Placement Readiness Analyser" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
