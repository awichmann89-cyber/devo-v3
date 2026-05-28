import { redirect } from "next/navigation";

export default function LocationsRedirect() {
  redirect("/material?tab=locations");
}
