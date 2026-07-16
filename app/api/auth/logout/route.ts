import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
export async function POST(req:NextRequest){ const res=NextResponse.redirect(new URL("/login",req.url),303); res.cookies.set(COOKIE_NAME,"",{path:"/",maxAge:0}); return res; }
