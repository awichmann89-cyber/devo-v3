"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Hash } from "lucide-react";
import {
  addSerialNumber,
  deleteSerialNumber,
  updateSerialNumber,
} from "../actions";
import { toast } from "sonner";
import { InspectionResult } from "@prisma/client";
import { formatDate } from "@/lib/utils";

interface SerialNumberVM {
  id: string;
  serialNumber: string;
  barcode: string | null;
  notes: string | null;
  lastInspection: {
    date: string;
    result: InspectionResult;
  } | null;
}

interface Props {
  deviceId: string;
  stockQuantity: number;
  inspectionExempt: boolean;
  serialNumbers: SerialNumberVM[];
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

export function SerialNumbersSection({
  deviceId,
  stockQuantity,
  inspectionExempt,
  serialNumbers,
}: Props) {
  const [newSerial, setNewSerial] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    if (!newSerial.trim()) return;
    startTransition(async () => {
      try {
        await addSerialNumber(deviceId, {
          serialNumber: newSerial.trim(),
          barcode: newBarcode.trim() || null,
          notes: newNotes.trim() || null,
        });
        setNewSerial("");
        setNewBarcode("");
        setNewNotes("");
        toast.success("Seriennummer hinzugefügt");
      } catch (e) {
        toast.error("Fehler", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteSerialNumber(id);
        toast.success("Seriennummer entfernt");
      } catch (e) {
        toast.error("Fehler", {
          description: e instanceof Error ? e.message : "",
        });
      }
    });
  }

  const remaining = stockQuantity - serialNumbers.length;
  const withBarcode = serialNumbers.filter((s) => s.barcode).length;
  const inspected = serialNumbers.filter((s) => s.lastInspection).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="h-4 w-4" /> Seriennummern ({serialNumbers.length} / {stockQuantity})
          <InfoHint
            text={
              inspectionExempt
                ? "Für dieses Gerät ist keine DGUV V3 Prüfung erforderlich. Seriennummern und Barcodes können optional zur Identifikation gepflegt werden."
                : "Pro physisches Stück Seriennummer + optionalen Barcode für die DGUV V3 Prüfung pflegen. Beim Verlassen des Feldes wird automatisch gespeichert."
            }
          />
        </CardTitle>
        {/* Dynamische Status-Infos bleiben sichtbar — nur der statische Erklärtext wandert ins Info-Icon. */}
        {((!inspectionExempt && (remaining > 0 || serialNumbers.length > 0)) ||
          remaining < 0) && (
          <CardDescription>
            {!inspectionExempt && remaining > 0 && `Noch ${remaining} ohne Seriennummer. `}
            {remaining < 0 && `⚠ Mehr Seriennummern als Lagerbestand! `}
            {!inspectionExempt && serialNumbers.length > 0 && (
              <span className="text-foreground">
                {withBarcode} / {serialNumbers.length} mit Barcode · {inspected} / {serialNumbers.length} geprüft
              </span>
            )}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {serialNumbers.length > 0 && (
          <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:h-10 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Seriennummer</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Notizen</TableHead>
                {!inspectionExempt && <TableHead>Letzte Prüfung</TableHead>}
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serialNumbers.map((s, idx) => (
                <SerialRow
                  key={s.id}
                  serial={s}
                  index={idx + 1}
                  showInspection={!inspectionExempt}
                  onDelete={() => handleDelete(s.id)}
                  pending={pending}
                />
              ))}
            </TableBody>
          </Table>
        )}

        <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Neue Seriennummer</label>
            <Input
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="z.B. SN-A1234"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Barcode (optional)</label>
            <Input
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              placeholder="z.B. DV-00042"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div className="space-y-1">
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

function SerialRow({
  serial,
  index,
  showInspection,
  onDelete,
  pending,
}: {
  serial: SerialNumberVM;
  index: number;
  showInspection: boolean;
  onDelete: () => void;
  pending: boolean;
}) {
  const [sn, setSn] = useState(serial.serialNumber);
  const [bc, setBc] = useState(serial.barcode ?? "");
  const [nt, setNt] = useState(serial.notes ?? "");
  const [rowPending, startRow] = useTransition();

  function save(payload: { serialNumber: string; barcode: string | null; notes: string | null }) {
    startRow(async () => {
      try {
        await updateSerialNumber(serial.id, payload);
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
          value={sn}
          onChange={(e) => setSn(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== serial.serialNumber && e.target.value.trim()) {
              save({ serialNumber: e.target.value.trim(), barcode: bc.trim() || null, notes: nt || null });
            }
          }}
          className="h-8 font-mono text-sm"
          placeholder="Seriennummer"
        />
      </TableCell>
      <TableCell>
        <Input
          value={bc}
          onChange={(e) => setBc(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== (serial.barcode ?? "")) {
              save({ serialNumber: sn.trim(), barcode: e.target.value.trim() || null, notes: nt || null });
            }
          }}
          className="h-8 font-mono text-sm"
          placeholder="optional"
        />
      </TableCell>
      <TableCell>
        <Input
          value={nt}
          onChange={(e) => setNt(e.target.value)}
          onBlur={(e) => {
            if (e.target.value !== (serial.notes ?? "")) {
              save({ serialNumber: sn.trim(), barcode: bc.trim() || null, notes: e.target.value || null });
            }
          }}
          className="h-8 text-sm"
          placeholder="optional"
        />
      </TableCell>
      {showInspection && (
        <TableCell>
          {serial.lastInspection ? (
            <div className="flex items-center gap-2">
              <Badge variant={resultVariant[serial.lastInspection.result]} className="text-[10px]">
                {resultLabel[serial.lastInspection.result]}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(serial.lastInspection.date)}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">noch nicht geprüft</span>
          )}
          {rowPending && <Loader2 className="inline-block ml-2 h-3 w-3 animate-spin text-muted-foreground" />}
        </TableCell>
      )}
      <TableCell>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={pending || rowPending} className="h-8 w-8">
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
