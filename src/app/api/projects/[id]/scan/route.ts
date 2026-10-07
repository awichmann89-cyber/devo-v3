import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOrCreatePackToken } from "@/app/(app)/projects/[id]/scan-actions";

/**
 * Einstieg „Digital Packen" vom Handy: holt (bzw. erzeugt) das Pack-Token und
 * leitet direkt auf die Scan-Seite weiter. Der Button öffnet diese URL
 * synchron per window.open — so blockt der Popup-Blocker mobiler Browser den
 * neuen Tab nicht, was bei einem window.open nach dem async Token-Fetch passiert.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await props.params;
  let token: string;
  try {
    token = await getOrCreatePackToken(id);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.redirect(new URL(`/scan/${token}`, req.url));
}
