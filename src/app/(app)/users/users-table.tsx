"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmpty } from "@/components/ui/table-empty";
import { Badge } from "@/components/ui/badge";
import { ListCard } from "@/components/layout/list-card";
import { FilterResetButton, FilterSearch } from "@/components/filters/filter-controls";
import { UserDialog } from "./user-dialog";
import { UserActions } from "./user-actions";
import { roleLabel } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { Role } from "@prisma/client";

export interface UserRowVM {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

export function UsersTable({ users }: { users: UserRowVM[] }) {
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q) ||
      roleLabel(u.role).toLowerCase().includes(q)
    );
  });

  return (
    <ListCard
      title="Benutzer"
      info="Zugänge zur App. Die Rolle steuert die Schreibrechte: Administrator (alles), Disponent (Projekte und Material), Leser (nur lesen)."
      action={<UserDialog />}
      count={{ shown: filtered.length, total: users.length }}
      filters={
        <>
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="E-Mail, Name oder Rolle…"
          />
          {search && <FilterResetButton onClick={() => setSearch("")} />}
        </>
      }
    >
      <Table density="comfortable">
        <TableHeader>
          <TableRow>
            <TableHead>E-Mail</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead>Angelegt</TableHead>
            <TableHead className="w-[76px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableEmpty colSpan={5} hasData={users.length > 0} entity="Benutzer" />
          )}
          {filtered.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.email}</TableCell>
              <TableCell>{u.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={u.role === "ADMIN" ? "default" : "outline"}>
                  {roleLabel(u.role)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
              <TableCell>
                <UserActions user={u} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListCard>
  );
}
