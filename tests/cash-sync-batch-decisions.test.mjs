import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMonthlyAudit} from '../site/assets/js/cash-sync-batch-decisions.mjs';
const row=(project,result,extra={})=>({project,result,exactMatches:4,
 newerCandidates:0,historyUnmatched:0,duplicateSource:0,
 duplicateHistory:0,financialReview:false,dateReview:false,...extra});
test('single monthly batch produces five correct user action groups without write permission',()=>{
 const summary=classifyMonthlyAudit({month:'2026-10',results:[
  row('S13-2','NEWER_THAN_HISTORY_CANDIDATE',{newerCandidates:3}),
  row('ADVANCE','EXACT_HISTORY_ONLY'),
  row('ELYSIAN','REVIEW_REQUIRED',{historyUnmatched:1,dateReview:true}),
  row('EATON','NEWER_THAN_HISTORY_CANDIDATE',{newerCandidates:2}),
  row('FOXCONN','GOOGLE_REVIEW_REQUIRED',{reason:'GOOGLE_LINK_MISSING'})
 ]});
 assert.deepEqual(summary.counts,{completed:1,noDifference:1,
  newCandidateReview:1,historyReview:1,needsSetup:1});
 assert.deepEqual(summary.groups.completed.map(x=>x.project),['S13-2']);
 assert.equal(summary.groups.completed[0].canWrite,false);
 assert.equal(summary.writeReadyProjects,0);
 assert.equal(summary.googleWrites,0);
 assert.equal(summary.sourceComplete,false);
 assert.equal(summary.canWrite,false);
 assert.equal(summary.groups.newCandidateReview[0].sourceComplete,false);
});
test('S13-2 completed checkpoint does not override new history warning or authorize second commit',()=>{
 const flagged=classifyMonthlyAudit({month:'2026-10',results:[
  row('S13-2','REVIEW_REQUIRED',{historyUnmatched:3,dateReview:true})
 ]});
 assert.equal(flagged.groups.completed.length,1);
 assert.match(flagged.groups.completed[0].reason,/Cảnh báo sổ gốc/);
 assert.equal(flagged.groups.completed[0].canWrite,false);
 const nextMonth=classifyMonthlyAudit({month:'2026-11',results:[
  row('S13-2','NEWER_THAN_HISTORY_CANDIDATE',{newerCandidates:1})
 ]});
 assert.equal(nextMonth.groups.completed.length,0);
 assert.equal(nextMonth.groups.newCandidateReview.length,1);
 assert.equal(nextMonth.canWrite,false);
});
test('unexpected scans, duplicates and malformed month fail closed',()=>{
 assert.throws(()=>classifyMonthlyAudit({month:'2026-10',results:[
  row('A','EXACT_HISTORY_ONLY'),row('A','REVIEW_REQUIRED')]}),/INVALID_BATCH/);
 assert.throws(()=>classifyMonthlyAudit({month:'2026-09',results:42}),/INVALID_BATCH/);
 assert.throws(()=>classifyMonthlyAudit({month:'2026-11',results:[
  row('S13-2','AUTHORIZED_FOR_WRITE')]}),/INVALID_BATCH/);
 assert.throws(()=>classifyMonthlyAudit({month:'2026-11',results:
  Array.from({length:36},(_,i)=>row('P'+i,'EXACT_HISTORY_ONLY'))}),/INVALID_BATCH/);
});
test('financial/date/duplicate flags block no-change and new-candidate shortcuts',()=>{
 const plan=classifyMonthlyAudit({month:'2026-11',results:[
  row('C17-2','EXACT_HISTORY_ONLY',{dateReview:true}),
  row('FOXCONN','NEWER_THAN_HISTORY_CANDIDATE',
   {newerCandidates:3,duplicateSource:1}),
  row('ADVANCE','SOURCE_NOT_READY',{reason:'SOURCE_REVIEW_REQUIRED'})
 ]});
 assert.equal(plan.counts.historyReview,2);
 assert.equal(plan.counts.needsSetup,1);
 assert.equal(plan.groups.newCandidateReview.length,0);
 assert.equal(plan.canWrite,false);
});

test('matching dates out of order remain non-writing date-only subset of history review',()=>{
 const plan=classifyMonthlyAudit({month:'2026-10',results:[
  row('H14-3','REVIEW_REQUIRED',{sourceRows:12,exactMatches:12,
   dateReview:true,reviewCategory:'DATE_ORDER_ONLY'}),
  row('中健厂房','REVIEW_REQUIRED',{sourceRows:2,exactMatches:2,
   dateReview:true,reviewCategory:'DATE_ORDER_ONLY'}),
  row('ELYSIAN','REVIEW_REQUIRED',{sourceRows:70,exactMatches:68,
   historyUnmatched:1,dateReview:true,reviewCategory:'TRANSACTION_REVIEW'})
 ]});
 assert.deepEqual(plan.dateOrderOnly,['H14-3','中健厂房']);
 assert.equal(plan.counts.historyReview,3);
 assert.match(plan.groups.historyReview[0].reason,/khớp toàn bộ dòng tháng/);
 assert.equal(plan.writeReadyProjects,0);
 assert.equal(plan.canWrite,false);
});
