import { LocationDialog } from "@/app/(app)/locations/location-dialog";
import { LocationsTable } from "@/app/(app)/locations/locations-table";
import { InfoHint } from "@/components/ui/info-hint";
import type { Location } from "@prisma/client";

type LocationWithCount = Location & {
  _count: { packUnits: number };
};

export function LocationsSection({ locations }: { locations: LocationWithCount[] }) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          Lagerorte
          <InfoHint text="Lagerorte für Packeinheiten und Geräte." />
        </div>
        <LocationDialog />
      </div>
      <LocationsTable locations={locations} />
    </>
  );
}
