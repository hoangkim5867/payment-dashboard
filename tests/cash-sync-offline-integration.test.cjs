'use strict';
// Offline integration contract: Payment IDs -> Cash Control history binding ->
// PHU HUNG-derived TEST view. Artificial data only; no live APIs or writes.
const test=require('node:test');
const assert=require('node:assert/strict');
const {checkBoundedBatch}=require('../site/assets/js/cash-sync-payment-coverage.js');
const {planTestSync}=require('../server/cash-sync-multiproject-write-plan.cjs');
const {token}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const fields=(date,amount,contractNo)=>({
  date,company:'Demo Supplier',contractNo,content:'IPC',ipc:'IPC01',
  type:'劳务款',income:0,subcontract:amount,material:0,otherDirect:0,
  indirect:0,financial:0,otherPayable:0
});
const original=()=>[
 {...fields('2026-10-01',100,'LAB-01'),rowId:2,balance:900},
 {...fields('2026-10-03',200,'LAB-02'),rowId:3,balance:700}
];
function source(project,suffix=''){
 return [
  {project,id:'expense:pay_'+suffix+'old',...fields('2026-10-01',100,'LAB-01')},
  {project,id:'expense:pay_'+suffix+'new',...fields('2026-11-02',50,'LAB-03')}
 ];
}
function coverage(project,records){
 const payments=records.map(x=>({id:x.id.slice('expense:pay_'.length),
  project,processPaymentDate:x.date}));
 const ledger=records.map(x=>({date:x.date,_syncIds:[x.id]}));
 return {project,loaded:true,complete:true,payments,ledger};
}
const options=(project,records,changes={})=>({
 project,history:original(),source:records,sourceComplete:true,
 destinationConfirmed:true,...changes
});
test('integrated dry-run for two projects: bind historical Payment, append only new item',()=>{
 const names=['ELYSIAN','EATON'];
 const records=names.map((p,i)=>source(p,String(i)));
 const checked=checkBoundedBatch(names.map((p,i)=>coverage(p,records[i])));
 assert.equal(checked.reviewedProjects,2);
 assert.equal(checked.allPaymentSnapshotsVerified,true);
 assert.equal(checked.sourceCompletenessVerified,false);
 assert.equal(checked.canWrite,false);
 names.forEach((project,i)=>{
  const p=planTestSync(options(project,records[i]));
  assert.equal(p.preview.historicCount,2);
  assert.equal(p.preview.additions,1);
  assert.equal(p.preview.closingBalance,650);
  assert.equal(p.expectedView.length,4);
  assert.equal(p.mirrorAdditions[0].id,records[i][1].id);
  assert.equal(p.preview.canWrite,false);
  assert.equal(p.preview.requiresServerAuthorization,true);
 });
});
test('same source replay is idempotent once saved mirror was independently verified',()=>{
 const records=source('ELYSIAN');
 const prior=planTestSync(options('ELYSIAN',records));
 assert.equal(prior.preview.additions,1);
 const newRecord=records[1];
 const mirror=[{...newRecord,month:'2026-11',signature:token(newRecord),status:'synced'}];
 const replay=planTestSync(options('ELYSIAN',records,{mirror}));
 assert.equal(replay.preview.additions,0);
 assert.equal(replay.preview.existingMirror,1);
 assert.equal(replay.preview.closingBalance,650);
 assert.equal(replay.preview.canWrite,false);
});
test('same date and amount with different contract is NOT accepted as historical duplicate',()=>{
 const bad=[{project:'ELYSIAN',id:'expense:pay_changed',
  ...fields('2026-10-01',100,'LAB-DIFFERENT')}];
 const result=checkBoundedBatch([coverage('ELYSIAN',bad)]);
 assert.equal(result.results[0].paymentSnapshotVerified,true);
 assert.equal(result.sourceCompletenessVerified,false);
 assert.throws(()=>planTestSync(options('ELYSIAN',bad)),e=>
   e.code==='OVERLAP_UNMATCHED');
});
test('changed old mirror and ambiguous historical duplicate are always blocked',()=>{
 const records=source('ELYSIAN');
 const old=records[1];
 assert.throws(()=>planTestSync(options('ELYSIAN',records,{
  mirror:[{...old,month:'2026-11',signature:'tampered',status:'synced'}]
 })),e=>e.code==='MIRROR_TAMPERED');
 const repeated=[{...fields('2026-10-01',100,'LAB-01'),rowId:2,balance:900},
  {...fields('2026-10-01',100,'LAB-01'),rowId:3,balance:800}];
 assert.throws(()=>planTestSync(options('ELYSIAN',[records[0]],{
  history:repeated
 })),e=>e.code==='AMBIGUOUS_HISTORY');
});
