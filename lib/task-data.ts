import type { DashboardMetrics, Task } from "@/types/task";

const clean = (v: unknown) => String(v ?? "").trim();
const key = (v: string) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
const aliases: Record<string,string[]> = {
  serial:["#","srno","serial","sno"], taskType:["tasktype","type"], priority:["priorities","priority"],
  taskName:["taskname","task"], taskDescription:["taskdescription","description"], team:["team"], maker:["maker"],
  owner:["owner"], checker:["checker"], reportDate:["reportdate"], startDate:["startdate"], eta:["eta","duedate"],
  liveDate:["livedate","completeddate"], etaMissingReason:["reasonifetamissing","etamissingreason","delayreason"],
  status:["status"], comment:["commentifany","comment","comments"]
};
function parseDate(raw: string): Date | null {
  const value=clean(raw); if(!value) return null;
  const m=value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(m){ const year=Number(m[3].length===2?`20${m[3]}`:m[3]); const d=new Date(Date.UTC(year,Number(m[2])-1,Number(m[1]))); return Number.isNaN(d.getTime())?null:d; }
  const d=new Date(value); return Number.isNaN(d.getTime())?null:d;
}
const iso=(v:string)=>parseDate(v)?.toISOString()??null;
const days=(a:Date,b:Date)=>Math.max(0,Math.ceil((b.getTime()-a.getTime())/86400000));
const statusLive=(s:string)=>/^(live|completed|complete|done|closed|delivered)$/i.test(clean(s));
function findHeader(values:string[][]):number {
  let best=-1, score=0;
  values.slice(0,20).forEach((row,i)=>{ const set=new Set(row.map(key)); const current=["taskname","status","owner","eta","livedate"].filter(x=>set.has(x)).length; if(current>score){score=current;best=i;} });
  if(best<0 || score<2) throw new Error("Task Manager header row was not found. Expected columns such as Task Name, Owner, ETA, Live Date and Status.");
  return best;
}
export function rowsToTasks(values:string[][]):Task[] {
  const headerIndex=findHeader(values); const headers=values[headerIndex].map(key);
  const index=(field:string)=>{ const candidates=aliases[field].map(key); return headers.findIndex(h=>candidates.includes(h)); };
  const idx=Object.fromEntries(Object.keys(aliases).map(f=>[f,index(f)])) as Record<string,number>;
  return values.slice(headerIndex+1).map((row,n)=>{
    const get=(f:string)=>idx[f]>=0?clean(row[idx[f]]):"";
    const taskName=get("taskName"), desc=get("taskDescription");
    if(!taskName && !desc && !get("status")) return null;
    const report=get("reportDate"), start=get("startDate"), eta=get("eta"), live=get("liveDate"), status=get("status");
    const rd=parseDate(report), sd=parseDate(start), ed=parseDate(eta), ld=parseDate(live), isLive=statusLive(status)||Boolean(ld);
    const today=new Date(); today.setUTCHours(0,0,0,0);
    const isDelayed=Boolean(ed && ((ld && ld>ed)||(!isLive && today>ed)));
    const delayDays=ed ? (ld&&ld>ed?days(ed,ld):(!isLive&&today>ed?days(ed,today):0)) : 0;
    const turnaroundDays=rd && ld ? days(rd,ld) : sd && ld ? days(sd,ld) : null;
    return { rowNumber:headerIndex+n+2, serial:get("serial")||String(n+1), taskType:get("taskType"), priority:get("priority"), taskName, taskDescription:desc,
      team:get("team"), maker:get("maker"), owner:get("owner"), checker:get("checker"), reportDate:report, startDate:start, eta, liveDate:live,
      etaMissingReason:get("etaMissingReason"), status:status||"Not specified", comment:get("comment"), reportDateIso:iso(report), startDateIso:iso(start), etaIso:iso(eta), liveDateIso:iso(live),
      isLive, isOpen:!isLive, isDelayed, isMissingEta:!eta, delayDays, turnaroundDays } satisfies Task;
  }).filter((x):x is Task=>Boolean(x));
}
function countBy(tasks:Task[], field:keyof Pick<Task,"status"|"priority"|"team"|"owner"|"maker"|"checker"|"taskType"|"etaMissingReason">):Record<string,number>{
  return tasks.reduce<Record<string,number>>((acc,t)=>{ const label=clean(t[field])||"Not specified"; acc[label]=(acc[label]||0)+1; return acc; },{});
}
const pct=(n:number,d:number)=>d?Math.round((n/d)*100):0;
export function buildMetrics(tasks:Task[]):DashboardMetrics {
  const live=tasks.filter(t=>t.isLive), delayed=tasks.filter(t=>t.isDelayed), withEta=tasks.filter(t=>t.etaIso), completedWithEta=live.filter(t=>t.etaIso);
  const onTime=completedWithEta.filter(t=>!t.isDelayed).length;
  const turnarounds=live.map(t=>t.turnaroundDays).filter((n):n is number=>n!==null);
  const delays=delayed.map(t=>t.delayDays).filter(n=>n>0);
  const now=new Date(); const week=new Date(now.getTime()+7*86400000);
  const requiredValues=tasks.length*7; const present=tasks.reduce((sum,t)=>sum+[t.taskName,t.owner,t.status,t.reportDate,t.team,t.maker,t.checker].filter(Boolean).length,0);
  return {
    total:tasks.length, live:live.length, open:tasks.length-live.length, delayed:delayed.length, missingEta:tasks.filter(t=>t.isMissingEta).length,
    highPriorityOpen:tasks.filter(t=>t.isOpen&&/high|urgent|p0|p1/i.test(t.priority)).length,
    dueThisWeek:tasks.filter(t=>{const d=t.etaIso?new Date(t.etaIso):null; return t.isOpen&&d&&d>=now&&d<=week;}).length,
    etaAdherence:pct(tasks.filter(t=>t.etaIso).length,tasks.length), onTimeDelivery:pct(onTime,completedWithEta.length),
    averageTurnaround:turnarounds.length?Number((turnarounds.reduce((a,b)=>a+b,0)/turnarounds.length).toFixed(1)):0,
    averageDelay:delays.length?Number((delays.reduce((a,b)=>a+b,0)/delays.length).toFixed(1)):0,
    dataQuality:pct(present,requiredValues), byStatus:countBy(tasks,"status"), byPriority:countBy(tasks,"priority"), byTeam:countBy(tasks,"team"),
    byOwner:countBy(tasks,"owner"), byMaker:countBy(tasks,"maker"), byChecker:countBy(tasks,"checker"), byTaskType:countBy(tasks,"taskType"),
    byDelayReason:countBy(tasks.filter(t=>t.isDelayed||t.isMissingEta),"etaMissingReason"),
    lifecycle:{reported:tasks.filter(t=>t.reportDateIso).length,started:tasks.filter(t=>t.startDateIso).length,etaAssigned:withEta.length,live:live.length}
  };
}
