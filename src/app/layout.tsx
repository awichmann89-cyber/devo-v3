import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

// Outfit — geometrische Sans aus dem Redesign (Brand-Font-Substitution).
// JetBrains Mono für Zahlen-, Datums- und Nummernspalten.
// Die PDF-Ausgabe verwendet weiterhin Geist (siehe src/lib/pdf-fonts.ts).
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "cratel | Materialverwaltung",
  description: "Veranstaltungstechnik Materialverwaltung",
  icons: {
    icon: [
      { url: "/cratel_icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/cratel_icon.svg",
    // iOS/macOS-Safari ignoriert SVG für „Zum Home-Bildschirm“/„Zum Dock“ —
    // braucht ein PNG ohne Transparenz (Ecken rundet das System selbst ab).
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  // Kurzer Name unter dem Icon. capable: false — Next würde sonst den
  // Vollbild-Modus (ohne Browser-Leiste) aktivieren.
  appleWebApp: {
    title: "cratel",
    capable: false,
  },
};

// Setzt die Theme-Klasse vor dem ersten Paint (kein Flash of wrong theme).
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${outfit.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
