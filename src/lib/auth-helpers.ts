import { auth } from "@/auth";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(roles: Role[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role)) {
    throw new Error("Keine Berechtigung");
  }
  return session;
}

export function hasRole(currentRole: Role | undefined, roles: Role[]): boolean {
  if (!currentRole) return false;
  return roles.includes(currentRole);
}

export const CAN_WRITE: Role[] = ["ADMIN", "DISPONENT"];
export const CAN_ADMIN: Role[] = ["ADMIN"];
