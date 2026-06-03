import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { LetterheadKind } from "@prisma/client";

export async function GET(
  _req: Request,
  props: { params: Promise<{ kind: string }> }
) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { kind } = await props.params;
  const k = kind as LetterheadKind;
  if (k !== "FIRST_PAGE" && k !== "FOLLOWING_PAGES") {
    return new NextResponse("Invalid kind", { status: 400 });
  }
  const tpl = await prisma.letterheadTemplate.findUnique({ where: { kind: k } });
  if (!tpl) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(tpl.data), {
    headers: {
      "Content-Type": tpl.mimeType,
      "Content-Disposition": `inline; filename="${tpl.fileName}"`,
    },
  });
}
