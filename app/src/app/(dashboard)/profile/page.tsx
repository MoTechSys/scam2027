import { redirect } from "next/navigation";

/** `/profile` → first tab (URL-addressable tabs, like /settings). */
export default function ProfileIndex() {
  redirect("/profile/info");
}
