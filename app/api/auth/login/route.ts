import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_SECONDS, createSessionToken, validCredentials } from "@/lib/auth";
export const runtime="nodejs";
export async function POST(req:NextRequest){
  try{
    const form=await req.formData(); const username=String(form.get("username")||""); const password=String(form.get("password")||"");
    if(!validCredentials(username,password)) return NextResponse.redirect(new URL("/login?error=1",req.url),303);
    const res=NextResponse.redirect(new URL("/",req.url),303); res.cookies.set(COOKIE_NAME,createSessionToken(username),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:SESSION_SECONDS}); return res;
  } catch { return NextResponse.redirect(new URL("/login?error=config",req.url),303); }
}
