import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBatchReleasePlan,executeCertifiedBatch} from
 '../site/assets/js/cash-sync-batch-release.mjs';
const month='2026-10';
const group=(project,n,state='HISTORY_COMPARISON_CANDIDATE')=>({
 project,groupedExcelRows:n,hasGoogleLink:true,state,issues:[],
 records:Array.from({length:n},(_,i)=>({
  project,month,id:project+':actual:'+i,
  values:['2026-10-10','','','','','',0,0,100,0,0,0,0]
 }))
});
const record=(project,result,more={})=>({
 project,result,sourceRows:2,exactMatches:2,newerCandidates:0,
 historyUnmatched:0,dateReview:false,financialReview:false,
 duplicateSource:0,duplicateHistory:0,reviewCategory:'EXACT_HISTORY',...more
});
const make=(groups,results)=>buildBatchReleasePlan({
 month,revision:341,
 manifest:{month,canWrite:false,groups},
 scan:{month,canWrite:false,googleWrites:0,results}
});
test('October 15-project report becomes one batch plan without recommending any write',()=>{
 const names=['S13-2','CN8-2','CR5-1B','ADVANCE','C17-2','CHAOMED',
  'EATON','ELYSIAN','FOXCONN','H14-3','OCEAN LINK','SSIS',
  '中健厂房','红鹤别墅1.1区','PHU HUNG'];
 const groups=names.map(x=>group(x,2));
 const results=names.map(x=>record(x,'REVIEW_REQUIRED',{historyUnmatched:1,
  reviewCategory:'TRANSACTION_REVIEW'}));
 const change=(project,patch)=>Object.assign(results[names.indexOf(project)],patch);
 change('S13-2',{newerCandidates:3,historyUnmatched:0,sourceRows:3});
 for(const x of ['CN8-2','CR5-1B'])change(x,{
  result:'EXACT_HISTORY_ONLY',historyUnmatched:0,reviewCategory:'EXACT_HISTORY'});
 for(const x of ['H14-3','中健厂房','红鹤别墅1.1区'])change(x,{
  result:'REVIEW_REQUIRED',historyUnmatched:0,dateReview:true,
  reviewCategory:'DATE_ORDER_ONLY',sourceRows:2,exactMatches:2});
 change('PHU HUNG',{result:'GOOGLE_REVIEW_REQUIRED',
  reason:'ORIGINAL_HISTORY_TAB_NOT_VERIFIED'});
 const p=make(groups,results);
 assert.equal(p.activeProjects,15);
 assert.deepEqual(p.counts,{alreadyComplete:1,historyEqual:2,dateOnly:3,
  needsSourceProof:0,needsReconciliation:8,missingSetup:1});
 assert.deepEqual(p.groups.alreadyComplete.map(x=>x.project),['S13-2']);
 assert.deepEqual(p.groups.dateOnly.map(x=>x.project),
  ['H14-3','中健厂房','红鹤别墅1.1区']);
 assert.equal(p.readyToCommit,0);
 assert.equal(p.canCommit,false);
 assert.equal(p.googleWrites,0);
});
test('a newer Google candidate becomes certification queue, NOT permission to write',()=>{
 const p=make([group('SSIS',1)],[record('SSIS','NEWER_THAN_HISTORY_CANDIDATE',{
  newerCandidates:1,exactMatches:0,sourceRows:1,
  reviewCategory:'NEWER_CANDIDATES_ONLY'})]);
 assert.equal(p.counts.needsSourceProof,1);
 assert.equal(p.groups.needsSourceProof[0].sourceCertified,false);
 assert.equal(p.groups.needsSourceProof[0].canCommit,false);
});
test('unverified aliases, missing source IDs, duplicate money and financial problems fail closed',()=>{
 const bad=group('ELYSIAN',1);bad.records[0].id='excel-row:27';
 const a=make([bad],[record('ELYSIAN','NEWER_THAN_HISTORY_CANDIDATE',{
  newerCandidates:1,exactMatches:0,sourceRows:1})]);
 assert.equal(a.counts.needsReconciliation,1);
 const b=make([group('FOXCONN',1)],[record('FOXCONN','REVIEW_REQUIRED',{
  financialReview:true,sourceRows:1})]);
 assert.equal(b.counts.needsReconciliation,1);
 assert.throws(()=>buildBatchReleasePlan({month,revision:341,
  manifest:{month,canWrite:false,groups:[group('ELYSIAN',1)]},
  scan:{month,canWrite:false,googleWrites:1,results:[]}}),/NOT_ATTESTED/);
});
const candidate=(project)=>({
 project,month,newRows:1,writeConfigured:true,
 sourceCertification:{verified:true,project,month,revision:341,serverProof:'a'.repeat(64)}
});
const signed=(project,changes=1)=>({
 mode:'preview',writes:0,writeConfigured:true,signature:'b'.repeat(64),
 summary:{project,month,changes,newRows:changes,originalUntouched:true}
});
test('one confirmation, sequential per-project preview+write; zero second write for no-change project',async()=>{
 const calls=[];let confirmations=0;
 const r=await executeCertifiedBatch({
  month,revision:341,items:[candidate('EATON'),candidate('SSIS')],
  sessionCurrent:()=>true,
  confirm:async x=>{confirmations++;assert.equal(x.length,2);return true},
  preview:async x=>{calls.push('preview:'+x.project);
   return signed(x.project,x.project==='EATON'?1:0)},
  commit:async x=>{calls.push('commit:'+x.project);return{
   mode:'verified',writes:1,summary:{project:x.project,month,
    changes:1,newRows:1,originalUntouched:true}}}
 });
 assert.equal(r.status,'verified');
 assert.deepEqual(r.written,['EATON']);
 assert.deepEqual(r.skipped,['SSIS']);
 assert.deepEqual(calls,['preview:EATON','commit:EATON','preview:SSIS']);
 assert.equal(confirmations,1);
 assert.equal(r.googleWrites,1);
});
test('cancelled batch never probes Google and unverified source cannot reach confirmation',async()=>{
 let called=0;
 const cancelled=await executeCertifiedBatch({month,revision:341,
  items:[candidate('EATON')],sessionCurrent:()=>true,
  confirm:async()=>false,preview:async()=>{called++},
  commit:async()=>{called++}});
 assert.equal(cancelled.status,'cancelled');
 assert.equal(called,0);
 const item=candidate('ELYSIAN');item.sourceCertification.verified=false;
 await assert.rejects(()=>executeCertifiedBatch({month,revision:341,
  items:[item],sessionCurrent:()=>true,
  confirm:async()=>{called++},preview:async()=>{called++},
  commit:async()=>{called++}}),/NOT_CERTIFIED/);
 assert.equal(called,0);
});
test('one uncertain Google response stops batch; never retries and never starts next project',async()=>{
 const calls=[];
 const result=await executeCertifiedBatch({month,revision:341,
  items:[candidate('EATON'),candidate('SSIS')],sessionCurrent:()=>true,
  confirm:async()=>true,
  preview:async x=>{calls.push('preview:'+x.project);return signed(x.project)},
  commit:async x=>{calls.push('commit:'+x.project);
   throw Error('Google 502 after server may already have written')}}); 
 assert.equal(result.status,'uncertain_never_retry');
 assert.equal(result.project,'EATON');
 assert.equal(result.requiresReadback,true);
 assert.deepEqual(calls,['preview:EATON','commit:EATON']);
});
test('failed signed preview never commits and does not continue later projects',async()=>{
 let commits=0;
 const r=await executeCertifiedBatch({month,revision:341,
  items:[candidate('EATON'),candidate('SSIS')],sessionCurrent:()=>true,
  confirm:async()=>true,
  preview:async x=>({...signed(x.project),signature:'INVALID'}),
  commit:async()=>{commits++}
 });
 assert.equal(r.status,'stopped_preview');
 assert.equal(commits,0);
});

test('safe backdated October posting enters source attestation queue without gaining write permission',()=>{
 const scan=record('ELYSIAN','NEWER_THAN_HISTORY_CANDIDATE',{
  sourceRows:2,exactMatches:1,newerCandidates:0,backfillCandidates:1,
  unsafeBackfill:0,historyUnmatched:0,reviewCategory:'NEWER_OR_BACKFILL_CANDIDATES_ONLY'});
 const plan=make([group('ELYSIAN',2)],[scan]);
 assert.equal(plan.counts.needsSourceProof,1);
 assert.equal(plan.groups.needsSourceProof[0].backfillCandidates,1);
 assert.equal(plan.groups.needsSourceProof[0].newerCandidates,0);
 assert.equal(plan.canCommit,false);
});
test('batch differentiates brand new Google entries from ID bindings of already existing history',async()=>{
 const item=candidate('EATON');item.newRows=1;
 let commits=0;
 const result=await executeCertifiedBatch({
  month,revision:341,items:[item],sessionCurrent:()=>true,
  confirm:async xs=>{assert.equal(xs[0].newRows,1);return true},
  preview:async()=>({...signed('EATON'),summary:{project:'EATON',month,
    changes:70,newRows:1,boundExisting:69,originalUntouched:true}}),
  commit:async()=>{commits++;return{mode:'verified',writes:1,
   summary:{project:'EATON',month,changes:70,newRows:1,originalUntouched:true}}}
 });
 assert.equal(result.status,'verified');
 assert.equal(commits,1);
 assert.deepEqual(result.written,['EATON']);
});
