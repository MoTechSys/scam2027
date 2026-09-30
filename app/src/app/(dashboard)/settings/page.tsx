import { redirect } from "next/navigation";

/** `/settings` → first tab (URL-addressable tabs, like /academic). */
export default function SettingsIndex() {
  redirect("/settings/general");
}
