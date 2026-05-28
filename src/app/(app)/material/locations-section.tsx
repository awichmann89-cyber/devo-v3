import { LocationDialog } from "@/app/(app)/locations/location-dialog";
import { LocationsTable } from "@/app/(app)/locations/locations-table";
import type { Location } from "@prisma/client";

type LocationWithCount = Location & {
  _count: { packUnits: number };
};

export function LocationsSection({ locations }: { locations: LocationWithCount[] }) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Lagerorte für Packeinheiten und Geräte
        </p>
        <LocationDialog />
      </div>
      <LocationsTable locations={locations} />
    </>
  );
}
