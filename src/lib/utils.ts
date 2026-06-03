import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ---------- Prisma Decimal Serialisierung ----------

type Decimallish = {
  toNumber: () => number;
  toFixed: (n?: number) => string;
  toString: () => string;
};

function isDecimal(v: unknown): v is Decimallish {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { toNumber?: unknown }).toNumber === "function" &&
    typeof (v as { toFixed?: unknown }).toFixed === "function"
  );
}

/**
 * Wandelt Prisma Decimal-Objekte rekursiv in plain numbers um,
 * damit das Ergebnis von Server Components an Client Components
 * übergeben werden kann. Date-Objekte bleiben erhalten.
 */
export function serialize<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (isDecimal(obj)) return obj.toNumber() as unknown as T;
  if (Array.isArray(obj)) return obj.map((item) => serialize(item)) as unknown as T;
  if (obj instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of obj) out[String(k)] = serialize(v);
    return out as unknown as T;
  }
  if (obj instanceof Set) {
    return Array.from(obj).map((item) => serialize(item)) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const key in obj as object) {
      out[key] = serialize((obj as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return obj;
}
