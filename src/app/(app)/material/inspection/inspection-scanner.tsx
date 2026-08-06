"use client";

import { useRef, useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/ui/info-hint";
import {
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Cable as CableIcon,
  Package,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { createInspection, findInspectionTarget } from "../cables-actions";
import { InspectionResult } from "@prisma/client";
import { toastError } from "@/lib/toast";

interface InspectionTarget {
  kind: "CABLE_UNIT" | "DEVICE_SERIAL";
  id: string;
  label: string;
  subLabel: string;
  barcode: string | null;
  inspectionExempt: boolean;
  inspections: {
    id: string;
    date: string;
    result: InspectionResult;
    testerName: string | null;
    notes: string | null;
  }[];
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

export function InspectionScanner() {
  const [scanInput, setScanInput] = useState("");
  const [target, setTarget] = useState<InspectionTarget | null>(null);
  const [searchPending, startSearch] = useTransition();
  const [savePending, startSave] = useTransition();
  const [testerName, setTesterName] = useState("");
  const [notes, setNotes] = useState("");

  const scanRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<
    { label: string; result: InspectionResult; date: Date }[]
  >([]);

  function focusScan() {
    scanRef.current?.focus();
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = scanInput.trim();
    if (!q) return;
    startSearch(async () => {
      try {
        const res = await findInspectionTarget(q);
        if (!res) {
          toast.error(`Kein Treffer für „${q}"`);
          return;
        }
        setTarget(res);
        setNotes("");
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  function recordResult(result: InspectionResult) {
    if (!target) return;
    startSave(async () => {
      try {
        await createInspection(
          { kind: target.kind, id: target.id },
          {
            date: new Date(),
            result,
            testerName: testerName || null,
            notes: notes || null,
          }
        );
        toast.success(`${target.label} — ${resultLabel[result]} gespeichert`);
        setRecent((prev) =>
          [{ label: target.label, result, date: new Date() }, ...prev].slice(0, 10)
        );
        setTarget(null);
        setScanInput("");
        setNotes("");
        setTimeout(focusScan, 50);
      } catch (e) {
        toastError(e, "Speichern");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" /> Scannen
              <InfoHint text="Barcode-Scanner ins Feld richten oder manuell eingeben und Enter drücken. Kabel-Barcodes, Geräte-Barcodes und Geräte-Seriennummern funktionieren." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleScanSubmit} className="flex gap-2">
              <Input
                ref={scanRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Barcode / Seriennummer scannen…"
                autoFocus
                className="font-mono text-base"
              />
              <Button type="submit" disabled={searchPending}>
                {searchPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanLine className="h-4 w-4" />
                )}
                Suchen
              </Button>
            </form>
          </CardContent>
        </Card>

        {target && (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {target.kind === "CABLE_UNIT" ? (
                  <CableIcon className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Package className="h-5 w-5 text-muted-foreground" />
                )}
                {target.label}
              </CardTitle>
              <CardDescription>
                {target.subLabel}
                {target.barcode && (
                  <span className="ml-2 font-mono text-foreground">
                    [{target.barcode}]
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {target.inspectionExempt ? (
                <>
                  <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm">
                    <ShieldOff className="h-5 w-5 shrink-0 text-warning" />
                    <div className="space-y-1">
                      <div className="font-medium text-warning">
                        Keine DGUV V3 Prüfung erforderlich
                      </div>
                      <p className="text-xs text-warning/80">
                        {target.kind === "CABLE_UNIT"
                          ? "Dieses Kabel ist als nicht prüfpflichtig markiert."
                          : "Dieses Gerät ist als nicht prüfpflichtig markiert."}
                        {" "}Für andere Einheiten weiterscannen.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTarget(null);
                        setScanInput("");
                        setTimeout(focusScan, 50);
                      }}
                    >
                      Weiter scannen
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="tester" className="text-xs">
                        Prüfer (optional)
                      </Label>
                      <Input
                        id="tester"
                        value={testerName}
                        onChange={(e) => setTesterName(e.target.value)}
                        placeholder="z.B. Max Mustermann"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="i-notes" className="text-xs">
                        Notizen (optional)
                      </Label>
                      <Textarea
                        id="i-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={1}
                        placeholder="z.B. Sichtprüfung OK"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => recordResult("PASSED")}
                      disabled={savePending}
                      className="bg-success hover:bg-success"
                    >
                      {savePending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Bestanden
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => recordResult("PASSED_CONDITIONAL")}
                      disabled={savePending}
                      className="border-warning text-warning hover:bg-warning-subtle"
                    >
                      <AlertTriangle className="h-4 w-4" /> Mit Auflage
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => recordResult("FAILED")}
                      disabled={savePending}
                    >
                      <XCircle className="h-4 w-4" /> Durchgefallen
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTarget(null);
                        setScanInput("");
                        setTimeout(focusScan, 50);
                      }}
                      className="ml-auto"
                      disabled={savePending}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </>
              )}

              {target.inspections.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Letzte Prüfungen
                  </div>
                  <Table density="dense">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Ergebnis</TableHead>
                        <TableHead>Prüfer</TableHead>
                        <TableHead>Notiz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {target.inspections.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="text-sm">{formatDate(i.date)}</TableCell>
                          <TableCell>
                            <Badge variant={resultVariant[i.result]} size="sm">
                              {resultLabel[i.result]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{i.testerName ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {i.notes ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Diese Sitzung
              <InfoHint text="Bereits geprüfte Einheiten (nur diese Browsersitzung)." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Noch nichts geprüft.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant={resultVariant[r.result]} size="sm" className="shrink-0">
                      {resultLabel[r.result]}
                    </Badge>
                    <span className="truncate flex-1">{r.label}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.date.toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
