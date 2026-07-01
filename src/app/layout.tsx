import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

// Geist Sans (Vercel) — moderne Grotesque, sehr klare Formen und gute
// Lesbarkeit auch bei kleinen Schriftgraden. Wir binden über das offizielle
// `geist`-Paket ein (statt `next/font/google`), weil wir dasselbe Paket
// serverseitig für die PDF-Ausgabe brauchen — so ist garantiert, dass Web
// und PDF exakt dieselbe Schriftversion verwenden.
export const metadata: Metadata = {
  title: "cratel | Materialverwaltung",
  description: "Veranstaltungstechnik Materialverwaltung",
  icons: {
    icon: [
      { url: "/cratel_icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/cratel_icon.svg",
    apple: "/cratel_icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={GeistSans.variable}>
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
