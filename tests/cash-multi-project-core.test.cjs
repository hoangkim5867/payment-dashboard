'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planMonth,sha}=require('../server/cash-sync-multi-project-core.cjs');
const v=(day,amount,contract='SUBP-001')=>[day,'Vendor',contract,'Contract invoice','IPC001','分包款',
  0,amount,0,0,0,0,0];
const source=(project,month,id,values)=>({id,project,month,values});
const old=(date,amount,balance,contract='SUBP-001')=>
  [date,'Vendor',contract,'Contract invoice','IPC001','分包款',
    0,amount,0,0,0,0,0,balance];
test('project-independent monthly plan binds existing history and appends only later records',()=>{
 const history=[old('2026-10-01',100,900)];
 const src=[
   source('ELYSIAN','2026-10','expense:old',v('2026-10-01',100)),
   source('ELYSIAN','2026-10','expense:new',v('2026-10-31',200,'SUBP-002'))];
 const out=planMonth({project:'ELYSIAN',month:'2026-10',source:src,history});
 assert.equal(out.requiresOtherProjects,false);
 assert.equal(out.status,'CANDIDATES_ONLY');
 assert.deepEqual(out.changes.map(x=>x.action),['bind-history','append']);
 assert.equal(out.historicalOpening,1000);
 assert.equal(out.closingBalance,700);
 assert.equal(out.viewRows.length,2);
 assert.equal(out.viewRows[1].formula,'=O2+G3-SUM(H3:N3)');
 assert.equal(out.canWrite,false);
 assert.equal(out.approvedWrites,0);
 // Simulate server read-back from machine mirror: a second manual click is a no-op.
 const again=planMonth({project:'ELYSIAN',month:'2026-10',source:src,history,mirror:out.mirrorNext});
 assert.equal(again.changes.length,0);
 assert.equal(again.closingBalance,700);
 assert.equal(again.viewRows.length,2);
});
test('manual mirror cell changes and deleted source ID are blocked',()=>{
 const history=[];
 const item=source('SSIS','2026-11','transfer:1:in',v('2026-11-09',50));
 const first=planMonth({project:'SSIS',month:'2026-11',source:[item],history,openingBalance:0});
 assert.equal(first.changes[0].action,'append');
 assert.throws(()=>planMonth({project:'SSIS',month:'2026-11',
   source:[item],history,mirror:[{...first.mirrorNext[0],
     values:v('2026-11-09',51)}],openingBalance:0}),/Mirror đã bị sửa tay/);
 assert.throws(()=>planMonth({project:'SSIS',month:'2026-11',
   source:[],history,mirror:first.mirrorNext,openingBalance:0}),/không còn trong nguồn/);
});
test('normal project older unverified source is held back without touching another project',()=>{
 const history=[old('2026-11-09',100,900)];
 const plan=planMonth({project:'SSIS',month:'2026-11',
   source:[source('SSIS','2026-11','expense:1',v('2026-11-08',250))],history});
 assert.equal(plan.status,'REVIEW_REQUIRED');
 assert.equal(plan.reviews[0].reason,'MISSING_FROM_OLDER_GOOGLE_HISTORY');
 assert.equal(plan.changes.length,0);
 assert.equal(plan.canWrite,false);
});
test('same-date but changed amount never silently becomes a new Google row',()=>{
 const history=[old('2026-11-09',100,900)];
 const plan=planMonth({project:'SSIS',month:'2026-11',
   source:[source('SSIS','2026-11','expense:1',v('2026-11-09',250))],history});
 assert.equal(plan.status,'REVIEW_REQUIRED');
 assert.equal(plan.viewRows,undefined);
});
test('source edit after first append changes one mirror ID, never inserts a duplicate',()=>{
 const history=[];
 const one=source('SSIS','2026-11','expense:1',v('2026-11-01',100));
 const first=planMonth({project:'SSIS',month:'2026-11',source:[one],history,openingBalance:1000});
 const edited=source('SSIS','2026-11','expense:1',v('2026-11-01',150));
 const second=planMonth({project:'SSIS',month:'2026-11',
   source:[edited],history,mirror:first.mirrorNext,openingBalance:1000});
 assert.equal(second.changes.length,1);
 assert.equal(second.changes[0].action,'update');
 assert.equal(second.mirrorNext.length,1);
 assert.equal(second.closingBalance,850);
});
test('FOXCONN import-tax column N and balance O reconcile without mixing expense buckets',()=>{
 const historical=[['2026-10-02','Vendor','SUPL-001','Import tax','IPC001','材料款',
   0,0,0,0,0,0,0,45,955]];
 const values=[...v('2026-11-09',100,'SUPL-002'),10];
 const plan=planMonth({project:'FOXCONN',month:'2026-11',
   source:[source('FOXCONN','2026-11','expense:fox',values)],
   history:historical,foxconn:true});
 assert.equal(plan.historicalOpening,1000);
 assert.equal(plan.closingBalance,845);
 assert.equal(plan.viewRows[1].values[13],10);
 assert.equal(plan.viewRows[1].cells.length,18);
 assert.equal(plan.canWrite,false);
});
test('empty new project requires opening balance approval; other projects irrelevant',()=>{
 const src=[source('NEW PROJECT','2026-11','expense:1',v('2026-11-03',100))];
 assert.throws(()=>planMonth({project:'NEW PROJECT',month:'2026-11',
   source:src,history:[]}),/số dư đầu kỳ/);
 const result=planMonth({project:'NEW PROJECT',month:'2026-11',
   source:src,history:[],openingBalance:0});
 assert.equal(result.historicalOpening,0);
 assert.equal(result.closingBalance,-100);
 assert.equal(result.requiresOtherProjects,false);
});
test('historic balance mismatch prevents all prepared transactions',()=>{
 const history=[old('2026-10-01',100,900),old('2026-10-02',200,880)];
 assert.throws(()=>planMonth({project:'SSIS',month:'2026-11',
   source:[],history}),/lệch số dư/);
});
test('source ID duplicates block preparation even if amounts differ',()=>{
 const src=[source('SSIS','2026-11','same',v('2026-11-02',100)),
   source('SSIS','2026-11','same',v('2026-11-03',200))];
 assert.throws(()=>planMonth({project:'SSIS',month:'2026-11',
   source:src,history:[],openingBalance:0}),/ID trùng/);
});
test('view formulas remain deterministic and never update original Google history',()=>{
 const history=[old('2026-10-01',100,900)];
 const baseline=JSON.stringify(history);
 const src=[source('ELYSIAN','2026-11','expense:1',v('2026-11-01',200))];
 const p=planMonth({project:'ELYSIAN',month:'2026-11',source:src,history});
 assert.equal(p.viewRows[0].sourceId,'HISTORIC_ROW_1');
 assert.equal(p.viewRows[0].formula,'=$R$2+G2-SUM(H2:N2)');
 assert.equal(p.viewRows[1].formula,'=O2+G3-SUM(H3:N3)');
 assert.equal(JSON.stringify(history),baseline);
 assert.equal(p.canWrite,false);
});
