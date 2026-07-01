import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Stellt sicher, dass die Geist-TTF-Dateien aus node_modules in den
  // Vercel-Server-Bundle aufgenommen werden — sonst kann fs.readFileSync
  // sie zur Laufzeit nicht finden.
  outputFileTracingIncludes: {
    "/api/projects/**/pdf/**/*": [
      "./node_modules/@fontsource/geist-sans/files/geist-sans-latin-400-normal.ttf",
      "./node_modules/@fontsource/geist-sans/files/geist-sans-latin-700-normal.ttf",
    ],
  },
};

export default nextConfig;
