"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeviceStatus, type Category } from "@prisma/client";
import { deviceStatusLabel } from "@/lib/labels";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function DevicesFilter({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function update(key: string, value: string | null) {
    const p = new URLSearchParams(params.toString());
    if (value && value !== "all") p.set(key, value);
    else p.delete(key);
    startTransition(() => router.replace(`/devices?${p.toString()}`));
  }

  const hasFilter = params.get("q") || params.get("status") || params.get("categoryId");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Suche..."
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => update("q", e.target.value || null)}
        className="max-w-xs"
      />
      <Select
        value={params.get("status") ?? "all"}
        onValueChange={(v) => update("status", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Status</SelectItem>
          {Object.values(DeviceStatus).map((s) => (
            <SelectItem key={s} value={s}>{deviceStatusLabel(s)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.get("categoryId") ?? "all"}
        onValueChange={(v) => update("categoryId", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Kategorie" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Kategorien</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilter && (
        <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace("/devices"))}>
          <X className="h-4 w-4" /> Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}
