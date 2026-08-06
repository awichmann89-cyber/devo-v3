import { prisma } from "@/lib/prisma";
import { requireRole, CAN_ADMIN } from "@/lib/auth-helpers";
import { UsersTable } from "./users-table";

export default async function UsersPage() {
  await requireRole(CAN_ADMIN);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <UsersTable
      users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
    />
  );
}
