"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/layout/list-card";
import { FilterResetButton, FilterSearch } from "@/components/filters/filter-controls";
import { Boxes, Package, MapPin, Cable as CableIcon, Plus, ScanLine } from "lucide-react";
import { PackUnitsSection } from "./pack-units-section";
import { DevicesSection, type DeviceVM } from "./devices-section";
import { CablesSection, type CableVM } from "./cables-section";
import { DeviceDialog } from "@/app/(app)/devices/device-dialog";
import { CableDialog } from "./cable-dialog";
import { PackUnitDialog } from "@/app/(app)/pack-units/pack-unit-dialog";
import { LocationDialog } from "@/app/(app)/locations/location-dialog";
import { LocationsTable } from "@/app/(app)/locations/locations-table";
import type { Category, Device, Location, PackUnit, PackUnitDevice } from "@prisma/client";

type DeviceWithCategory = Device & { category: Category | null };
type PackUnitWithItems = PackUnit & {
  location: Location | null;
  category: Category | null;
  items: Array<PackUnitDevice & { device: DeviceWithCategory }>;
};
type LocationWithCount = Location & { _count: { packUnits: number } };

interface Props {
  tab: string;
  devices: DeviceVM[];
  packUnits: PackUnitWithItems[];
  cables: CableVM[];
  locations: LocationWithCount[];
  categories: Category[];
}

/**
 * Material-Bereich: vier Tabs, die sich das gleiche ListCard-Gerüst teilen.
 * Die Suche lebt hier (pro Tab ein eigener Begriff), damit die Filterleiste im
 * Card-Header sitzt und nicht in jeder Sektion neu gebaut wird.
 */
export function MaterialView({
  tab,
  devices,
  packUnits,
  cables,
  locations,
  categories,
}: Props) {
  const [deviceSearch, setDeviceSearch] = useState("");
  const [packUnitSearch, setPackUnitSearch] = useState("");
  const [cableSearch, setCableSearch] = useState("");

  const inspectionModeButton = (
    <Button variant="outline" asChild>
      <Link href="/material/inspection">
        <ScanLine className="h-4 w-4" /> Prüfungsmodus
      </Link>
    </Button>
  );

  const deviceMatches = devices.filter((d) => {
    if (!deviceSearch) return true;
    const q = deviceSearch.toLowerCase();
    return `${d.name} ${d.manufacturer ?? ""} ${d.model ?? ""}`.toLowerCase().includes(q);
  }).length;

  const packUnitMatches = packUnits.filter((pu) => {
    if (!packUnitSearch) return true;
    const q = packUnitSearch.toLowerCase();
    return `${pu.code} ${pu.name} ${pu.description ?? ""}`.toLowerCase().includes(q);
  }).length;

  const cableMatches = cables.filter((c) => {
    if (!cableSearch) return true;
    const q = cableSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.cableType ?? "").toLowerCase().includes(q) ||
      (c.connectorA ?? "").toLowerCase().includes(q) ||
      (c.connectorB ?? "").toLowerCase().includes(q)
    );
  }).length;

  return (
    <Tabs defaultValue={tab}>
      <TabsList>
        <TabsTrigger value="devices">
          <Package className="h-4 w-4" /> Geräte ({devices.length})
        </TabsTrigger>
        <TabsTrigger value="pack-units">
          <Boxes className="h-4 w-4" /> Packeinheiten ({packUnits.length})
        </TabsTrigger>
        <TabsTrigger value="cables">
          <CableIcon className="h-4 w-4" /> Kabel ({cables.length})
        </TabsTrigger>
        <TabsTrigger value="locations">
          <MapPin className="h-4 w-4" /> Lagerorte ({locations.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="devices">
        <ListCard
          title="Geräte"
          info="Geräte-Typen mit Lagerbestand, Tagespreis und DGUV-V3-Status. Der Bestand zählt Stück, nicht Seriennummern."
          secondaryAction={inspectionModeButton}
          action={<DeviceDialog categories={categories} />}
          count={{ shown: deviceMatches, total: devices.length }}
          filters={
            <>
              <FilterSearch
                value={deviceSearch}
                onChange={setDeviceSearch}
                placeholder="Name, Hersteller oder Modell…"
              />
              {deviceSearch && <FilterResetButton onClick={() => setDeviceSearch("")} />}
            </>
          }
        >
          <DevicesSection devices={devices} categories={categories} search={deviceSearch} />
        </ListCard>
      </TabsContent>

      <TabsContent value="pack-units">
        <ListCard
          title="Packeinheiten"
          info="Cases, Racks und Taschen. „Fix“ bedeutet, dass die Einheit immer komplett gebucht wird, „Variabel“ erlaubt Teilentnahmen."
          secondaryAction={inspectionModeButton}
          action={<PackUnitDialog locations={locations} categories={categories} />}
          count={{ shown: packUnitMatches, total: packUnits.length }}
          filters={
            <>
              <FilterSearch
                value={packUnitSearch}
                onChange={setPackUnitSearch}
                placeholder="Code, Name oder Beschreibung…"
              />
              {packUnitSearch && <FilterResetButton onClick={() => setPackUnitSearch("")} />}
            </>
          }
        >
          <PackUnitsSection
            packUnits={packUnits}
            categories={categories}
            locations={locations}
            search={packUnitSearch}
          />
        </ListCard>
      </TabsContent>

      <TabsContent value="cables">
        <ListCard
          title="Kabel"
          info="Kabel-Typen mit Länge und Steckern. Einzelne Kabel bekommen auf der Detailseite Barcodes für die DGUV-V3-Prüfung."
          secondaryAction={inspectionModeButton}
          action={<CableCreateButton categories={categories} />}
          count={{ shown: cableMatches, total: cables.length }}
          filters={
            <>
              <FilterSearch
                value={cableSearch}
                onChange={setCableSearch}
                placeholder="Name, Typ oder Stecker…"
              />
              {cableSearch && <FilterResetButton onClick={() => setCableSearch("")} />}
            </>
          }
        >
          <CablesSection cables={cables} categories={categories} search={cableSearch} />
        </ListCard>
      </TabsContent>

      <TabsContent value="locations">
        <ListCard
          title="Lagerorte"
          info="Lagerorte für Packeinheiten und Geräte."
          action={<LocationDialog />}
        >
          <LocationsTable locations={locations} />
        </ListCard>
      </TabsContent>
    </Tabs>
  );
}

/** „Kabel anlegen" — der CableDialog ist rein controlled, braucht also einen Trigger. */
function CableCreateButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Kabel anlegen
      </Button>
      <CableDialog open={open} onOpenChange={setOpen} cable={null} categories={categories} />
    </>
  );
}
