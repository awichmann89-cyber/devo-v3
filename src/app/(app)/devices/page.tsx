import { redirect } from "next/navigation";

export default function DevicesRedirect() {
  redirect("/material?tab=devices");
}
