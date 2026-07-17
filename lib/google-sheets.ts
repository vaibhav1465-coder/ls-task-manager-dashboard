import { SignJWT, importPKCS8 } from "jose";
import { buildMetrics, rowsToTasks } from "@/lib/task-data";
import type { TaskApiResponse } from "@/types/task";
let cache:{expires:number,data:TaskApiResponse}|null=null;
type Credentials={client_email:string;private_key:string;token_uri?:string};
function credentials():Credentials {
  const encoded=process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if(!encoded) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.");
  try { const c=JSON.parse(Buffer.from(encoded,"base64").toString("utf8")) as Credentials; if(!c.client_email||!c.private_key) throw new Error(); return c; }
  catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid service-account JSON."); }
}
async function accessToken():Promise<string>{
  const c=credentials(); const now=Math.floor(Date.now()/1000); const key=await importPKCS8(c.private_key,"RS256");
  const assertion=await new SignJWT({scope:"https://www.googleapis.com/auth/spreadsheets"}).setProtectedHeader({alg:"RS256",typ:"JWT"}).setIssuer(c.client_email).setSubject(c.client_email).setAudience(c.token_uri||"https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now+3600).sign(key);
  const body=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion});
  const r=await fetch(c.token_uri||"https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,cache:"no-store"});
  const j=await r.json() as {access_token?:string;error_description?:string}; if(!r.ok||!j.access_token) throw new Error(j.error_description||"Google authentication failed."); return j.access_token;
}
async function googleJson(url:string,token:string){ const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"}); const j=await r.json(); if(!r.ok) throw new Error((j as any)?.error?.message||"Google Sheets API request failed."); return j; }
export async function fetchDashboard(force=false):Promise<TaskApiResponse>{
  const ttl=Number(process.env.GOOGLE_SHEETS_CACHE_TTL_MS||30000); if(!force&&cache&&cache.expires>Date.now()) return {...cache.data,meta:{...cache.data.meta,cacheState:"hit"}};
  const spreadsheetId=process.env.GOOGLE_SPREADSHEET_ID||""; const gid=Number(process.env.GOOGLE_SHEET_GID||0); if(!spreadsheetId) throw new Error("Missing GOOGLE_SPREADSHEET_ID.");
  const token=await accessToken(); const meta=await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,token) as any;
  const sheet=meta.sheets?.find((s:any)=>s.properties?.sheetId===gid); const title=sheet?.properties?.title; if(!title) throw new Error(`No sheet tab found for gid ${gid}.`);
  const range=encodeURIComponent(`'${String(title).replace(/'/g,"''")}'!A:AZ`); const valuesJson=await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,token) as any;
  const tasks=rowsToTasks((valuesJson.values||[]) as string[][]); const data:TaskApiResponse={tasks,metrics:buildMetrics(tasks),meta:{sheetTitle:title,rowCount:tasks.length,fetchedAt:new Date().toISOString(),cacheState:"miss",readOnly:false}}; cache={expires:Date.now()+ttl,data}; return data;
}
