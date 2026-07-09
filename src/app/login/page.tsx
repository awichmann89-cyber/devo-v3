import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { CratelMark } from "@/components/layout/sidebar";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-stretch">
      {/* Formular-Spalte */}
      <div className="flex flex-1 items-center justify-center bg-card p-8">
        <div className="w-full max-w-[340px]">
          <div className="mb-7 flex items-center gap-2.5">
            <CratelMark className="h-[27px] w-[30px]" />
            <span className="text-2xl font-extrabold tracking-tight text-foreground">Cratel</span>
          </div>
          <h1 className="mb-1 text-[22px] font-extrabold tracking-tight text-foreground">
            Anmelden
          </h1>
          <p className="mb-6 text-[13px] text-muted-foreground">
            Materialverwaltung für Veranstaltungstechnik
          </p>
          <Suspense
            fallback={
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
          <p className="mt-5 text-center text-[11px] text-faint">
            © {new Date().getFullYear()} Cratel · Alle Rechte vorbehalten
          </p>
        </div>
      </div>

      {/* Marken-Panel — nur auf großen Screens */}
      <div className="relative hidden flex-[1.15] items-center justify-center overflow-hidden bg-gradient-to-br from-[#1B242B] to-[#11171B] lg:flex">
        {/* Dezentes Raster */}
        <div
          className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:34px_34px]"
          aria-hidden
        />
        <div className="relative p-10 text-center">
          <svg
            viewBox="8 12 84 76"
            fill="none"
            className="mx-auto mb-5 h-[78px] w-[86px]"
            aria-hidden
          >
            <g stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="16" y="20" width="68" height="60" rx="11" />
              <line x1="16" y1="40" x2="84" y2="40" />
              <rect x="37" y="57" width="26" height="10" rx="5" />
            </g>
            <g stroke="hsl(15 90% 56%)" strokeWidth="6" strokeLinecap="round">
              <line x1="30" y1="34" x2="30" y2="46" />
              <line x1="70" y1="34" x2="70" y2="46" />
            </g>
          </svg>
          <div className="mx-auto max-w-[360px] text-[26px] font-extrabold leading-[1.15] tracking-tight text-white">
            Jedes Case am richtigen Ort.
          </div>
          <div className="mx-auto mt-3 max-w-[340px] text-sm leading-normal text-white/60">
            Geräte, Packeinheiten und Projekte — zentral geplant und kalkuliert.
          </div>
        </div>
      </div>
    </div>
  );
}
