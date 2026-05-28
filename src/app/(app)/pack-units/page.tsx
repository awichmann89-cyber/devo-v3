import { redirect } from "next/navigation";

export default function PackUnitsRedirect() {
  redirect("/material?tab=pack-units");
}
