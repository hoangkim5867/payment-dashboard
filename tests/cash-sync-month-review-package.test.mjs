import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMonthReviewPackage,inspectMonthReviewPackage} from '../site/assets/js/cash-sync-month-review-package.mjs';
const values=(n=100)=>['2026-10-26','Vendor','LAB-1','IPC','IPC01','材料',0,0,n,0,0,0,0];
const record=(p,id,n)=>({id,project:p,month:'2026-10',sourceClass:'PAYMENT',
 values:p==='FOXCONN'?[...values(n),0]:values(n)});
const group=(p,count)=>({
 project:p,groupedExcelRows:count,state:'HISTORY_COMPARISON_CANDIDATE',
 issues:[],records:Array.from({length:count},(_,i)=>record(p,p+':'+i,100+i))
});
const manifest=(groups)=>({
 month:'2026-10',sourceComplete:false,canWrite:false,
 groups,catalogProjects:35
});
test('one file contains all active projects and zero real write authority',()=>{
 const groups=[group('FOXCONN',19),group('ELYSIAN',3),group('SSIS',1)];
 const p=buildMonthReviewPackage({month:'2026-10',manifest:manifest(groups),
  actualMonthLoaded:true,monthQueryCount:88,revision:12,
  exportedAt:'2026-11-14T00:00:00.000Z'});
 assert.equal(p.projectsInCatalog,35);
 assert.equal(p.activeProjects,3);
 assert.equal(p.groupedRows,23);
 assert.equal(p.projects[0].records.length,19);
 assert.equal(p.actualPaidMonthQuery.documentsReturned,88);
 assert.equal(p.actualPaidMonthQuery.completeBusinessCoverage,false);
 assert.equal(p.canWrite,false);
 const i=inspectMonthReviewPackage(JSON.parse(JSON.stringify(p)));
 assert.equal(i.activeProjects,3);
 assert.equal(i.groupedRows,23);
 assert.equal(i.groups[0].records.length,19);
 assert.equal(i.groups[0].state,'HISTORY_COMPARISON_CANDIDATE');
 assert.equal(i.canWrite,false);
});
test('TEST cannot treat an empty, incomplete or false signed package as release proof',()=>{
 const m=manifest([group('FOXCONN',1)]);
 assert.throws(()=>buildMonthReviewPackage({month:'2026-10',manifest:m,
   actualMonthLoaded:false,monthQueryCount:1,revision:2}),/MONTH_SOURCE_NOT_READY/);
 const p=buildMonthReviewPackage({month:'2026-10',manifest:m,
   actualMonthLoaded:true,monthQueryCount:1,revision:2});
 assert.throws(()=>inspectMonthReviewPackage({...p,canWrite:true}),/FILE_INVALID/);
 assert.throws(()=>inspectMonthReviewPackage({...p,sourceAuthenticated:true}),/FILE_INVALID/);
 assert.throws(()=>inspectMonthReviewPackage({...p,groupedRows:9}),/ROW_COUNT_MISMATCH/);
 assert.throws(()=>inspectMonthReviewPackage({...p,projects:[...p.projects,...p.projects]}),/PROJECT_INVALID/);
});
test('unverified transfers and source issues stay blocked and remain readable for diagnostics',()=>{
 const g=group('FOXCONN',1);
 g.records[0].sourceClass='TRANSFER';g.records[0].values[6]=-5700000000;
 const p=buildMonthReviewPackage({month:'2026-10',manifest:manifest([g]),
   actualMonthLoaded:true,monthQueryCount:0,revision:1});
 const i=inspectMonthReviewPackage(p);
 assert.equal(i.groups[0].state,'SOURCE_REVIEW_REQUIRED');
 assert.equal(i.groups[0].records[0].values[6],-5700000000);
 assert.equal(i.canWrite,false);
});
test('missing source IDs or changed month are stopped before any Google access',()=>{
 const g=group('ELYSIAN',1);
 g.records[0].id='';
 assert.throws(()=>buildMonthReviewPackage({month:'2026-10',
   manifest:manifest([g]),actualMonthLoaded:true,monthQueryCount:1,revision:1}),
   /INVALID_SOURCE_ROW_OR_ID/);
 const g2=group('ELYSIAN',1);
 g2.records[0].values[0]='2026-11-01';
 assert.throws(()=>buildMonthReviewPackage({month:'2026-10',
   manifest:manifest([g2]),actualMonthLoaded:true,monthQueryCount:1,revision:1}),
   /INVALID_SOURCE_ROW_OR_ID/);
});
