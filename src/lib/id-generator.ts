import { prisma } from "@/lib/prisma";

const PACK_UNIT_PREFIX = "PU";
const PACK_UNIT_PAD = 3;

/**
 * Liefert die nächste freie Packeinheit-Nummer im Format "PU-001".
 */
export async function generateNextPackUnitCode(): Promise<string> {
  const existing = await prisma.packUnit.findMany({
    where: { code: { startsWith: `${PACK_UNIT_PREFIX}-` } },
    select: { code: true },
  });
  const regex = new RegExp(`^${PACK_UNIT_PREFIX}-(\\d+)$`);
  let max = 0;
  for (const pu of existing) {
    const m = pu.code.match(regex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${PACK_UNIT_PREFIX}-${String(max + 1).padStart(PACK_UNIT_PAD, "0")}`;
}
