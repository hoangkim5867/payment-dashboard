'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const text=fs.readFileSync(path.join(__dirname,'..','site','payment.html'),'utf8');
const marker='async function readExportWatchFallback(context, markerMs, cutoffMs){';
const start=text.indexOf(marker);assert(start>=0);
const stop=text.indexOf('\nasync function loadExportWatchChanges',start);assert(stop>start);
const source=text.slice(start,stop);
const doc=(id,month,ms)=>({id,data:()=>({id,paymentMonth:month,createdAt:new Date(ms),action:'EDIT'})});
let cases=0;
async function run({monthRows,dateRows,counts,failCount=false,contextMonth='2026-10',markerMs=1000,cutoffMs=5000}){
 let fetched=0,countCalls=0,mode='';
 const context={
  activityLogsRef:'activityLogs',
  where:(name,op,val)=>({type:'where',name,op,val}),
  orderBy:(name,dir)=>({type:'orderBy',name,dir}),
  startAfter:(item)=>({type:'cursor',id:item.id}),
  limit:(n)=>({type:'limit',n}),
  query:(ref,...clauses)=>({ref,clauses}),
  getCountFromServer:async(q)=>{
   countCalls++;
   if(failCount)throw Error('count unavailable');
   return {data:()=>({count:q.clauses.some(c=>c.name==='paymentMonth')?counts[0]:counts[1]})};
  },
  getDocs:async(q)=>{
   fetched++;
   const monthConstraint=q.clauses.find(c=>c.type==='where'&&c.name==='paymentMonth');
   mode=monthConstraint?'month':'time';
   let rows=(monthConstraint?monthRows:dateRows).slice();
   if(monthConstraint)rows.sort((a,b)=>a.id.localeCompare(b.id));
   else rows.sort((a,b)=>a.data().createdAt-b.data().createdAt || a.id.localeCompare(b.id));
   const cursor=q.clauses.find(c=>c.type==='cursor');
   if(cursor){const index=rows.findIndex(d=>d.id===cursor.id);rows=rows.slice(index+1);}
   const max=q.clauses.find(c=>c.type==='limit')?.n||500;
   const docs=rows.slice(0,max);
   return {docs};
  },
  exportWatchLogDate:(log)=>log.createdAt,
  console:{warn:()=>{}}
 };
 vm.createContext(context);vm.runInContext(source,context);
 const result=await context.readExportWatchFallback({month:contextMonth},markerMs,cutoffMs);
 return {result:JSON.parse(JSON.stringify(result)),fetched,countCalls,mode};
}
(async()=>{
 // Month-based selection is smaller, preserves all valid logs and timestamp order.
 let r=await run({monthRows:[doc('d','2026-10',4100),doc('b','2026-10',900),doc('c','2026-10',1200),doc('a','2026-10',5100)],dateRows:[doc('c','2026-10',1200),doc('d','2026-10',4100)],counts:[4,800]});
 assert.strictEqual(r.mode,'month');cases++;
 assert.deepStrictEqual(r.result.map(x=>x.id),['c','d']);cases++;
 assert.strictEqual(r.countCalls,2);cases++;
 // Date selection with different month logs: same result as composite query.
 r=await run({monthRows:[doc('a','2026-10',1500),doc('b','2026-10',2500)],dateRows:[doc('a','2026-10',1500),doc('x','2026-09',2000),doc('b','2026-10',2500)],counts:[900,3]});
 assert.strictEqual(r.mode,'time');cases++;
 assert.deepStrictEqual(r.result.map(x=>x.id),['a','b']);cases++;
 // Count unavailable uses old date-based read; no accidental empty result.
 r=await run({monthRows:[],dateRows:[doc('z','2026-10',2500)],counts:[1,1],failCount:true});
 assert.strictEqual(r.mode,'time');cases++;
 assert.deepStrictEqual(r.result.map(x=>x.id),['z']);cases++;
 // A timestamp 1 nanosecond after the marker must not be lost to ms rounding.
 const edge={id:'precision',data:()=>({id:'precision',paymentMonth:'2026-10',createdAt:{seconds:1,nanoseconds:1000001}})};
 r=await run({monthRows:[edge],dateRows:[edge],counts:[1,100],markerMs:1001,cutoffMs:3000});
 assert.deepStrictEqual(r.result.map(x=>x.id),['precision']);cases++;
 // More than 500 logs: neither fallback may silently truncate.
 const big=Array.from({length:505},(_,i)=>doc('p'+String(i).padStart(4,'0'),'2026-10',1800+i));
 r=await run({monthRows:big,dateRows:big,counts:[505,700],cutoffMs:10000});
 assert.strictEqual(r.result.length,505);cases++;
 assert.strictEqual(r.fetched,2);cases++;
 console.log('PASS',cases,'adaptive Export Watch fallback assertions, including >500 documents');
})().catch(e=>{console.error(e);process.exitCode=1;});
