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
     values:[...v('2026-11-09',51),0]}],openingBalance:0}),/Mirror đã bị sửa tay/);
 assert.throws(()=>planMonth({project:'SSIS',month:'2026-11',
   source:[],history,mirror:first.mirrorNext,openingBalance:0}),/không còn trong nguồn/);
});
test('October-November missing earlier posting appends only to technical mirror and keeps original ledger immutable',()=>{
 const history=[old('2026-11-09',100,900)];
 const unchanged=structuredClone(history);
 const posting=source('SSIS','2026-11','expense:1',
   v('2026-11-08',250,'SUBP-002'));
 const plan=planMonth({project:'SSIS',month:'2026-11',
   source:[posting],history});
 assert.equal(plan.status,'CANDIDATES_ONLY');
 assert.deepEqual(plan.changes.map(x=>x.action),['append-backfill']);
 assert.equal(plan.mirrorNext.length,1);
 assert.equal(plan.closingBalance,650);
 assert.deepEqual(history,unchanged);
 assert.equal(plan.viewRows[0].origin,'HISTORY');
 assert.equal(plan.viewRows[1].origin,'CASH_CONTROL');
 const repeated=planMonth({project:'SSIS',month:'2026-11',
   source:[posting],history,mirror:plan.mirrorNext});
 assert.equal(repeated.changes.length,0);
 assert.equal(repeated.closingBalance,650);
 assert.deepEqual(history,unchanged);
});
test('possible same-day different-label duplicate stays review-only',()=>{
 const history=[old('2026-11-09',100,900,'SUBP-001')];
 const suspicious=source('SSIS','2026-11','expense:other',
   ['2026-11-09','Other vendor','SUBP-010','Other label','IPC003',
    '分包款',0,100,0,0,0,0,0]);
 const plan=planMonth({project:'SSIS',month:'2026-11',
   source:[suspicious],history});
 assert.equal(plan.status,'REVIEW_REQUIRED');
 assert.equal(plan.reviews[0].reason,'SAME_DAY_AMOUNT_COLUMNS_DIFFERENT_LABEL');
 assert.equal(plan.changes.length,0);
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

test('S13-2 October scoped report preserves 258 historical rows with two date inversions',()=>{
 // Synthetic amounts/rows model the owner-reported structural totals; this
 // NEVER reads actual Google or proves that the production source is complete.
 const historicClose=65583133;
 const history=Array.from({length:258},(_,i)=>[
  i===40||i===140?'2026-09-29':'2026-09-30',
  'Original ledger','OLD-'+i,'Existing entry','','间接费',
  0,0,0,0,0,0,0,historicClose
 ]);
 const inversions=history.reduce((n,row,i)=>
  n+(i>0&&row[0]<history[i-1][0]?1:0),0);
 assert.equal(inversions,2);
 const frozenHistory=JSON.stringify(history);
 const make=(id,day,company,description,expense)=>source(
  'S13-2','2026-10',id,
  [day,company,'',description,'','职工薪酬',0,0,0,0,expense,0,0]);
 const sourceRows=[
  make('manual_salary_payroll_1790835443846_m4hd2','2026-10-02',
   '中方员工工资','2026年08月中方员工工资',81463753),
  make('manual_salary_payroll_1790835443852_ihc3a','2026-10-02',
   '伙食费','2026年08月伙食费',3859500),
  make('legacy_salary_672+legacy_salary_680','2026-10-20',
   '','2026年第3季度个人所得税',52923736)
 ];
 const args={project:'S13-2',month:'2026-10',source:sourceRows,history};
 const first=planMonth(args);
 assert.equal(first.status,'CANDIDATES_ONLY');
 assert.equal(first.viewRows.length,261);
 assert.equal(first.historicalClosing,historicClose);
 assert.deepEqual(first.changes.map(x=>x.action),['append','append','append']);
 assert.equal(first.closingBalance,-72663856);
 assert.equal(first.canWrite,false);
 assert.equal(first.approvedWrites,0);
 assert.equal(first.requiresOtherProjects,false);
 for(let i=0;i<258;i++)
  assert.deepEqual(first.viewRows[i].values.slice(0,13),history[i].slice(0,13));
 assert.equal(JSON.stringify(history),frozenHistory);
 // A repeated source snapshot must reuse all three immutable IDs.
 const second=planMonth({...args,mirror:first.mirrorNext});
 assert.equal(second.status,'CANDIDATES_ONLY');
 assert.equal(second.changes.length,0);
 assert.equal(second.viewRows.length,261);
 assert.equal(second.closingBalance,-72663856);
 assert.equal(second.canWrite,false);
 assert.equal(JSON.stringify(history),frozenHistory);
});
