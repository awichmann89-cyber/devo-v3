import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Stellt sicher, dass die Geist-TTF-Dateien aus dem `geist`-Paket in den
  // Vercel-Server-Bundle aufgenommen werden — sonst kann fs.readFileSync
  // sie zur Laufzeit nicht finden. Wir nutzen das offizielle `geist`-Paket
  // (nicht `@fontsource/geist-sans`), weil letzteres nur WOFF/WOFF2 liefert
  // und jsPDF zwingend TTFs benötigt.
  outputFileTracingIncludes: {
    "/api/projects/**/pdf/**/*": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf",
    ],
    // Stundenzettel-Route liegt außerhalb des projects-Globs — ohne eigenen
    // Eintrag fällt sie auf Vercel still auf Helvetica zurück.
    "/api/persons/**/pdf/**/*": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf",
    ],
  },
};

export default nextConfig;
