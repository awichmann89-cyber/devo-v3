"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, Hash } from "lucide-react";
import { addSerialNumber, deleteSerialNumber, updateSerialNumber } from "../actions";
import { toast } from "sonner";

interface SerialNumber {
  id: string;
  serialNumber: string;
  notes: string | null;
}

interface Props {
  deviceId: string;
  stockQuantity: number;
  serialNumbers: SerialNumber[];
}

export function SerialNumbersSection({ deviceId, stockQuantity, serialNumbers }: Props) {
  const [newSerial, setNewSerial] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    if (!newSerial.trim()) return;
    startTransition(async () => {
      try {
        await addSerialNumber(deviceId, {
          serialNumber: newSerial.trim(),
          notes: newNotes.trim() || null,
        });
        setNewSerial("");
        setNewNotes("");
        toast.success("Seriennummer hinzugefügt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteSerialNumber(id);
        toast.success("Seriennummer entfernt");
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  function handleUpdate(item: SerialNumber, field: "serialNumber" | "notes", value: string) {
    const payload = {
      serialNumber: field === "serialNumber" ? value : item.serialNumber,
      notes: field === "notes" ? value || null : item.notes,
    };
    startTransition(async () => {
      try {
        await updateSerialNumber(item.id, payload);
      } catch (e) {
        toast.error("Fehler", { description: e instanceof Error ? e.message : "" });
      }
    });
  }

  const remaining = stockQuantity - serialNumbers.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="h-4 w-4" /> Seriennummern ({serialNumbers.length} / {stockQuantity})
        </CardTitle>
        <CardDescription>
          Optional: trage Seriennummern für die einzelnen physischen Stücke ein. Du kannst bis
          zu {stockQuantity} eintragen — eine pro Gerät, das im Lager liegt.
          {remaining > 0 && ` Noch ${remaining} ohne Seriennummer.`}
          {remaining < 0 && ` ⚠ Mehr Seriennummern als Lagerbestand!`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {serialNumbers.length > 0 && (
          <ul className="divide-y rounded-md border">
            {serialNumbers.map((s, idx) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">#{idx + 1}</span>
                <Input
                  defaultValue={s.serialNumber}
                  onBlur={(e) =>
                    e.target.value !== s.serialNumber &&
                    handleUpdate(s, "serialNumber", e.target.value)
                  }
                  className="font-mono"
                  placeholder="Seriennummer"
                />
                <Input
                  defaultValue={s.notes ?? ""}
                  onBlur={(e) =>
                    (e.target.value || null) !== s.notes &&
                    handleUpdate(s, "notes", e.target.value)
                  }
                  placeholder="Notiz (optional)"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(s.id)}
                  disabled={pending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2 rounded-md border border-dashed p-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Neue Seriennummer</label>
            <Input
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="z.B. SN-A1234"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Notiz (optional)</label>
            <Input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="z.B. Bühne links"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button onClick={handleAdd} disabled={!newSerial.trim() || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Hinzufügen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
