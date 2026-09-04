import { redirect } from "next/navigation";

/** Root: the proxy already redirects anonymous users to /login; signed-in users land on the dashboard. */
export default function RootPage() {
  redirect("/dashboard");
}
