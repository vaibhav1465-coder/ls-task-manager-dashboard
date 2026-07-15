import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard from "../components/Dashboard";
import { COOKIE_NAME, verifySessionToken } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cookieStore = await cookies();
  if (!verifySessionToken(cookieStore.get(COOKIE_NAME)?.value)) redirect("/login");
  return <Dashboard />;
}

