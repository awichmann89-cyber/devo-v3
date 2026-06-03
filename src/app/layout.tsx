import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devo — Materialverwaltung",
  description: "Veranstaltungstechnik Materialverwaltung",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
