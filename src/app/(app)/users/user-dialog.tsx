"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { createUser, updateUser } from "./actions";
import { toast } from "sonner";
import { Role } from "@prisma/client";
import { roleLabel } from "@/lib/labels";
import { toastError } from "@/lib/toast";

interface UserVM {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

interface Props {
  user?: UserVM;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UserDialog({ user, open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState({
    email: user?.email ?? "",
    name: user?.name ?? "",
    password: "",
    role: user?.role ?? Role.READER,
  });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        if (user) {
          await updateUser(user.id, form);
          toast.success("Benutzer aktualisiert");
        } else {
          await createUser(form);
          toast.success("Benutzer angelegt");
        }
        setOpen(false);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!user && (
        <DialogTrigger asChild>
          <Button><Plus className="h-4 w-4" /> Benutzer anlegen</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Benutzer bearbeiten" : "Benutzer anlegen"}</DialogTitle>
          <DialogDescription>
            Die Rolle steuert die Schreibrechte: Administrator (alles), Disponent
            (Projekte und Material), Leser (nur lesen).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Passwort {user && <span className="text-muted-foreground">(leer = unverändert)</span>}</Label>
            <Input
              id="pw"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!user}
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Rolle</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(Role).map((r) => (
                  <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {user ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
