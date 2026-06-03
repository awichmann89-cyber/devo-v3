"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { updateCableUnit } from "../../cables-actions";
import { InspectionResult } from "@prisma/client";

export interface CableUnitVM {
  id: string;
  barcode: string | null;
  notes: string | null;
  lastInspection: {
    date: string;
    result: InspectionResult;
  } | null;
}

const resultLabel: Record<InspectionResult, string> = {
  PASSED: "Bestanden",
  PASSED_CONDITIONAL: "Mit Auflage",
  FAILED: "Durchgefallen",
};

const resultVariant: Record<
  InspectionResult,
  "success" | "warning" | "destructive"
> = {
  PASSED: "success",
  PASSED_CONDITIONAL: "warning",
  FAILED: "destructive",
};

export function CableUnitsEditor({ units }: { units: CableUnitVM[] }) {
  return (
    <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">#</TableHead>
          <TableHead>Barcode</TableHead>
          <TableHead>Notizen</TableHead>
          <TableHead>Letzte Prüfung</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.map((u, i) => (
          <UnitRow key={u.id} unit={u} index={i + 1} />
        ))}
      </TableBody>
    </Table>
  );
}

function UnitRow({ unit, index }: { unit: CableUnitVM; index: number }) {
  const [barcode, setBarcode] = useState(unit.barcode ?? "");
  const [notes, setNotes] = useState(unit.notes ?? "");
  const [pending, startTransition] = useTransition();

  function save(field: "barcode" | "notes", value: string) {
    const payload = {
      barcode: field === "barcode" ? value : barcode,
      notes: field === "notes" ? value : notes,
    };
    startTransition(async () => {
      try {
        await updateCableUnit(unit.id, payload);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground">{index}</TableCell>
      <TableCell>
        <Input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== (unit.barcode ?? "")) save("barcode", e.target.value);
          }}
          placeholder="z.B. CB-00042"
          className="h-8 font-mono text-sm"
        />
      </TableCell>
      <TableCell>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== (unit.notes ?? "")) save("notes", e.target.value);
          }}
          placeholder="optional"
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell>
        {unit.lastInspection ? (
          <div className="flex items-center gap-2">
            <Badge
              variant={resultVariant[unit.lastInspection.result]}
              className="text-[10px]"
            >
              {resultLabel[unit.lastInspection.result]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(unit.lastInspection.date)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            noch nicht geprüft
          </span>
        )}
        {pending && (
          <Loader2 className="inline-block ml-2 h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </TableCell>
    </TableRow>
  );
}
