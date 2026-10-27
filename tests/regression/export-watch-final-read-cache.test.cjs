'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.resolve(__dirname,'../../site/payment.html'),'utf8');
const helper=src.match(/function exportWatchLogCanChangeSnapshot\(action, changes = \[\]\)\{[\s\S]*?\n\}/);
assert.ok(helper,'Export Watch change guard must exist');
const guard=vm.runInNewContext(helper[0]+'\nexportWatchLogCanChangeSnapshot');
test('ordinary process, paper, bank and status ticks do not re-read history',()=>{
 for(const field of ['processPaper','processPlatformPlan','processApproval','processBanking','processActualAmount','processPaymentDate','remark','paymentStatus'])
  assert.equal(guard('EDIT',[{field}]),false,field);
 for(const action of ['EXPORT_EXCEL','RESTORE','IMPORT_PARTIAL'])
  assert.equal(guard(action,[]),false,action);
});
test('relevant adds, deletes, cancels and planned-amount edits still invalidate',()=>{
 assert.equal(guard('EDIT',[{field:'amount'}]),true);
 assert.equal(guard('EDIT',[{field:'remark'},{field:'amount'}]),true);
 for(const action of ['ADD','DELETE','CANCEL'])
  assert.equal(guard(action,[]),true,action);
 assert.match(src,/await addDoc\(\s*activityLogsRef/);
 assert.match(src,/if\(exportWatchLogCanChangeSnapshot\(action,changes\)\)\{/);
});
test('fallback memoizes COUNT by month and marker, including changed Excel cutoffs',async()=>{
 const start=src.indexOf('async function readExportWatchFallback(context, markerMs, cutoffMs){');
 const end=src.indexOf('\nasync function loadExportWatchChanges',start);
 assert.ok(start>=0&&end>start);
 const method=src.slice(start,end);
 let counts=0,reads=0;
 const sandbox={
  activityLogsRef:'activityLogs',
  where:(name,operator,val)=>({name,operator,val}),
  orderBy:(name,dir)=>({orderBy:name,dir}),
  query:(ref,...clauses)=>({ref,clauses}),
  getCountFromServer:async(q)=>{
   counts++;
   return {data:()=>({count:q.clauses.some(c=>c.name==='paymentMonth')?1:100})};
  },
  getDocs:async()=>{reads++;return {docs:[]}},
  startAfter:item=>({cursor:item.id}), limit:n=>({limit:n}),
  console:{warn(){}},
  exportWatchLogDate:log=>new Date(log.createdAt)
 };
 const fallback=vm.runInNewContext(method+'\nreadExportWatchFallback',sandbox);
 const c={month:'2026-10'};
 await fallback(c,1000,2000);
 await fallback(c,1000,3000);
 assert.equal(counts,2,'second export cutoff should not repeat COUNT pair');
 assert.equal(reads,2,'refresh still loads exact logs for each cutoff');
 await Promise.all([fallback(c,2000,4000),fallback(c,2000,5000)]);
 assert.equal(counts,4,'concurrent count estimation must be deduplicated');
 assert.equal(reads,4);
 await fallback({month:'2026-09'},2000,6000);
 assert.equal(counts,6,'different month must get its own estimate');
});
test('Excel continues force-reading new changes, preserving user/month marker and partial acknowledgements',()=>{
 assert.match(src,/loadExportWatchChanges\(exportContext,\{force:true,cutoffMs\}\)/);
 assert.match(src,/EXPORT_WATCH_MARKER_PREFIX\s*\+/);
 assert.match(src,/acknowledgeExportWatch\(exportContext,cutoffMs,acknowledgedIds\)/);
 assert.match(src,/XLSX\.writeFile\(/);
});
