import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

// Geist Sans (Vercel) — moderne Grotesque, sehr klare Formen und gute
// Lesbarkeit auch bei kleinen Schriftgraden. Wird als CSS-Variable
// eingebunden, sodass Tailwind sie via `font-sans` und PDF-Bausteine
// via CSS-Variablen konsistent verwenden können.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

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
    <html lang="de" className={geist.variable}>
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
