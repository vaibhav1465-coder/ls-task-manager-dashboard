import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";
export default async function Page(){ const store=await cookies(); if(!verifySessionToken(store.get(COOKIE_NAME)?.value)) redirect("/login"); return <Dashboard/>; }
