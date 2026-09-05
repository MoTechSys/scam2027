import { redirect } from "next/navigation";

/** `/academic` → default tab. Tabs are URL segments so each is deep-linkable (FR-ACD-001..004). */
export default function AcademicIndexPage() {
  redirect("/academic/years");
}
