import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { fetchDashboard } from "@/lib/google-sheets";
export const runtime="nodejs";
export async function GET(req:NextRequest){
  const store=await cookies(); if(!verifySessionToken(store.get(COOKIE_NAME)?.value)) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{ const data=await fetchDashboard(req.nextUrl.searchParams.get("force")==="1"); return NextResponse.json(data,{headers:{"cache-control":"no-store"}}); }
  catch(error){ return NextResponse.json({error:error instanceof Error?error.message:"Unable to load Task Manager data."},{status:500}); }
}
