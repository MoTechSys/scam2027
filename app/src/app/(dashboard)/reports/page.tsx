import { redirect } from "next/navigation";

/** `/reports` → first tab (URL-addressable tabs, like /settings). */
export default function ReportsIndex() {
  redirect("/reports/overview");
}
