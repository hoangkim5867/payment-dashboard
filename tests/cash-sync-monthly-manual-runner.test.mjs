import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runManualMonthlySync} from '../site/assets/js/cash-sync-monthly-manual-runner.mjs';
const MONTH='2026-10',sha='a'.repeat(64);
function make(project,opts={}){
 const values=['2026-10-03','公司','合同','内容','IPC','劳务款',0,200,0,0,0,0,0];
 return {project,month:MONTH,activityConfirmed:true,sourceComplete:true,
  spreadsheetId:'testSpreadsheet_'+project.padEnd(24,'X').replace(/[^A-Za-z0-9_-]/g,'X'),
  historySheetId:42,expectedMonthClosing:800,
  source:[{id:project+':source:1',project,month:MONTH,values,hash:sha}],...opts};
}
const ok=(body,changes=1,writeConfigured=true)=>({
 mode:'preview',signature:sha,writeConfigured,summary:{
  project:body.project,month:body.month,changes,monthClosingBalance:800,originalUntouched:true
 }
});
test('one action handles separate projects with all previews before any commit, one approval, no retries',async()=>{
 const calls=[],approved=[];
 const result=await runManualMonthlySync({
  month:MONTH,projects:[make('ELYSIAN'),make('S13-2'),make('EATON')],
  write:true,checkAdmin:async()=>true,
  preview:async b=>{calls.push('preview:'+b.project);return ok(b)},
  commit:async b=>{calls.push('commit:'+b.project);return {
   ...ok(b),mode:'verified',writes:1
  }},
  confirmBatch:async summary=>{approved.push(summary.readyProjects);calls.push('approve');return true}
 });
 assert.deepEqual(approved,[['ELYSIAN','S13-2','EATON']]);
 assert.deepEqual(calls,[
  'preview:ELYSIAN','preview:S13-2','preview:EATON','approve',
  'preview:ELYSIAN','commit:ELYSIAN',
  'preview:S13-2','commit:S13-2',
  'preview:EATON','commit:EATON'
 ]);
 assert.equal(result.summary.verified,3);
 assert.equal(result.summary.failed,0);
 assert.equal(result.mode,'BATCH_ATTEMPTED');
});
test('35 catalog entries with missing sources, missing links and incompatible rows are skipped independently',async()=>{
 const list=Array.from({length:35},(_,i)=>make('P'+i));
 list[4].activityConfirmed=false;
 list[5].sourceComplete=false;
 list[6].spreadsheetId='';
 list[7].source[0].id='excel-row:6';
 const calls=[];
 const result=await runManualMonthlySync({
  month:MONTH,projects:list,write:false,checkAdmin:async()=>true,
  preview:async b=>{calls.push(b.project);return ok(b)}
 });
 assert.equal(calls.length,31);
 assert.equal(result.summary.skipped,4);
 assert.equal(result.summary.ready,31);
 assert.equal(result.summary.recordedGoogleWriteRequests,0);
 assert.equal(result.approved,false);
});
test('a failing project never interrupts others, write authorization is server-owned',async()=>{
 const calls=[];
 const result=await runManualMonthlySync({
  month:MONTH,projects:[make('A'),make('B'),make('C')],
  write:true,checkAdmin:async()=>true,confirmBatch:async()=>true,
  preview:async b=>{
   calls.push('p:'+b.project);
   if(b.project==='B')throw Error('GOOGLE_PERMISSION_DENIED');
   return ok(b,1,b.project==='A');
  },
  commit:async b=>{calls.push('c:'+b.project);return {...ok(b),mode:'verified',writes:1}}
 });
 assert.equal(result.summary.verified,1);
 assert.equal(result.summary.failed,1);
 assert.equal(result.summary.previewOnly,1);
 assert.deepEqual(calls,['p:A','p:B','p:C','p:A','c:A']);
});
test('Admin cancellation results in zero commit requests',async()=>{
 let commits=0;
 const result=await runManualMonthlySync({
  month:MONTH,projects:[make('A'),make('B')],
  write:true,checkAdmin:async()=>true,confirmBatch:async()=>false,
  preview:async b=>ok(b),
  commit:async()=>{commits++;throw Error('MUST_NOT_RUN')}
 });
 assert.equal(commits,0);
 assert.equal(result.mode,'NOT_APPROVED');
});
test('after approval, fresh preview blocks changed balance or closed write gate; no stale signatures',async()=>{
 const count=new Map(),commits=[];
 const result=await runManualMonthlySync({
  month:MONTH,projects:[make('A'),make('B'),make('C')],
  write:true,checkAdmin:async()=>true,confirmBatch:async()=>true,
  preview:async b=>{
   const n=(count.get(b.project)||0)+1;count.set(b.project,n);
   if(n===2&&b.project==='A')return {...ok(b),summary:{...ok(b).summary,monthClosingBalance:799}};
   if(n===2&&b.project==='B')return ok(b,1,false);
   if(n===2&&b.project==='C')return ok(b,0,true);
   return ok(b);
  },
  commit:async b=>{commits.push(b.project);throw Error('MUST_NOT_COMMIT')}
 });
 assert.deepEqual(commits,[]);
 assert.equal(result.summary.failed,1);
 assert.equal(result.summary.skipped,1);
 assert.equal(result.summary.unchanged,1);
});
test('write result uncertainty is an isolated failure, never auto-retried',async()=>{
 let commits=0;
 const result=await runManualMonthlySync({
  month:MONTH,projects:[make('A'),make('B')],
  write:true,checkAdmin:async()=>true,confirmBatch:async()=>true,
  preview:async b=>ok(b),
  commit:async b=>{commits++;if(b.project==='A')throw Error('UNCONFIRMED_GOOGLE_WRITE');
   return {...ok(b),mode:'verified',writes:1}
  }
 });
 assert.equal(commits,2);
 assert.equal(result.summary.failed,1);
 assert.equal(result.summary.verified,1);
});
test('source validation rejects forged placeholders and wrong periods before network calls',async()=>{
 const list=[make('A',{source:[{id:'excel-row:6',project:'A',month:MONTH,
  values:['2026-10-03'],hash:sha}]}),make('B',{month:'2026-11'})];
 let calls=0;
 const r=await runManualMonthlySync({month:MONTH,projects:list,
  checkAdmin:async()=>true,preview:async()=>{calls++;throw Error('SHOULD_NOT_READ')}
 });
 assert.equal(calls,0);
 assert.equal(r.summary.skipped,2);
 await assert.rejects(runManualMonthlySync({month:MONTH,projects:[make('A'),make('A')],
  checkAdmin:async()=>true,preview:async()=>ok({project:'A',month:MONTH})}),/DUPLICATE/);
});

test('signed server release preflight skips unapproved destinations with zero Google requests',async()=>{
 const projects=[make('ELYSIAN'),make('FOXCONN'),make('S13-2')];
 const reads=[],writes=[],checks=[];
 const report=await runManualMonthlySync({
  month:MONTH,projects,write:true,
  checkRelease:name=>{checks.push(name);return name==='FOXCONN'},
  checkAdmin:async()=>true,confirmBatch:async()=>true,
  preview:async body=>{reads.push(body.project);return ok(body)},
  commit:async body=>{writes.push(body.project);return {...ok(body),mode:'verified',writes:1}}
 });
 assert.deepEqual(checks,['ELYSIAN','FOXCONN','S13-2']);
 assert.deepEqual(reads,['FOXCONN','FOXCONN']);
 assert.deepEqual(writes,['FOXCONN']);
 assert.equal(report.summary.skipped,2);
 assert.equal(report.summary.verified,1);
 assert.equal(report.rows.find(x=>x.project==='ELYSIAN').reason,'SERVER_TARGET_NOT_RELEASED');
});
test('all 35 unapproved destinations consume zero Google previews, zero writes',async()=>{
 let reads=0,writes=0;
 const result=await runManualMonthlySync({
  month:MONTH,
  projects:Array.from({length:35},(_,i)=>make('P'+i)),
  write:true,checkRelease:()=>false,checkAdmin:async()=>true,
  confirmBatch:async()=>{throw Error('No projects must be offered approval')},
  preview:async()=>{reads++;throw Error('MUST_NOT_PREVIEW')},
  commit:async()=>{writes++;throw Error('MUST_NOT_WRITE')}
 });
 assert.equal(reads,0);
 assert.equal(writes,0);
 assert.equal(result.summary.skipped,35);
 assert.equal(result.summary.recordedGoogleWriteRequests,0);
 assert.equal(result.approved,false);
});
