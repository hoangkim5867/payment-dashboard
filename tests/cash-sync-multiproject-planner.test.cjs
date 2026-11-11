'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {plan,token}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const tx=(date,amount,contractNo='LAB-01')=>({date,company:'NCC A',contractNo,
  content:'IPC payment',ipc:'IPC01',type:'支出',income:0,subcontract:amount,
  material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0});
const h=[{...tx('2026-10-01',100),rowId:3,balance:900},
  {...tx('2026-10-05',150,'LAB-02'),rowId:4,balance:750}];
const source=(date,amount,id='src-1',contract='LAB-01')=>({
  project:'ELYSIAN',id,...tx(date,amount,contract)});
const call=(overrides={})=>plan({project:'ELYSIAN',history:h,source:[],...overrides});
const denied=(f,code)=>assert.throws(f,e=>e.code===code);
test('ledger preserves historical balances, accepts new November and December rows',()=>{
  const original=JSON.stringify(h);
  const output=call({source:[source('2026-12-02',50,'dec'),
    source('2026-11-03',20,'nov')]});
  assert.equal(output.openingBalance,1000);
  assert.equal(output.closingBalance,680);
  assert.equal(output.historicCount,2);
  assert.equal(output.newCount,2);
  assert.deepEqual(output.rows.map(x=>x.balance),[900,750,730,680]);
  assert.equal(output.rows[2].formula,'=N3+G4-SUM(H4:M4)');
  assert.equal(output.rows[3].formula,'=N4+G5-SUM(H5:M5)');
  assert.equal(output.canWrite,false);
  assert.equal(JSON.stringify(h),original);
});
test('identical history item binds by full transaction without a second append',()=>{
  const result=call({source:[source('2026-10-01',100)]});
  assert.equal(result.matchedHistory,1);
  assert.equal(result.newCount,0);
  assert.equal(result.closingBalance,750);
});
test('second source row cannot bind the same historical row',()=>{
  denied(()=>call({source:[source('2026-10-01',100,'a'),
    source('2026-10-01',100,'b')]}),'DUPLICATE_MATCH');
});
test('same-day different contract or amount inside historic window fails closed',()=>{
  denied(()=>call({source:[source('2026-10-01',99,'bad')]}),'OVERLAP_UNMATCHED');
});
test('ambiguous identical historical rows require explicit ID mapping',()=>{
  const duplicates=[{...tx('2026-10-01',100),rowId:3,balance:900},
    {...tx('2026-10-01',100),rowId:4,balance:800}];
  denied(()=>call({history:duplicates,source:[source('2026-10-01',100)]}),'AMBIGUOUS_HISTORY');
  const mapped=call({history:duplicates,source:[{...source('2026-10-01',100),historyRowId:4}]});
  assert.equal(mapped.matchedHistory,1);
  assert.equal(mapped.closingBalance,800);
});
test('missing explicit history binding blocks instead of guessing',()=>{
  denied(()=>call({source:[{...source('2026-10-01',100),historyRowId:99}]}),'HISTORY_BINDING_MISMATCH');
});
test('historical balance reversal is blocked',()=>{
  denied(()=>call({history:[h[0],{...h[1],balance:749}]}),'HISTORY_BALANCE');
});
test('historical date reversals block without auto-sort',()=>{
  denied(()=>call({history:[h[1],h[0]]}),'DATE_ORDER');
});
test('new project needs explicit opening balance; empty source is allowed',()=>{
  denied(()=>call({history:[]}), 'OPENING_NOT_CONFIRMED');
  const p=call({history:[],source:[],openingBalance:0});
  assert.equal(p.closingBalance,0);
  assert.equal(p.rows.length,0);
});
test('new project recalculates across month boundaries',()=>{
  const p=call({history:[],openingBalance:1000,
    source:[source('2026-11-02',150,'two'),source('2026-10-31',250,'one')]});
  assert.equal(p.closingBalance,600);
  assert.deepEqual(p.rows.map(x=>x.balance),[750,600]);
});
test('already synced unchanged source is idempotent',()=>{
  const row=source('2026-11-03',100);
  const old=[{project:'ELYSIAN',id:row.id,signature:token(row)}];
  const p=call({source:[row],previousMirror:old});
  assert.equal(p.newCount,1);
  assert.equal(p.closingBalance,650);
});
test('editing or deleting previously synced source blocks',()=>{
  const row=source('2026-11-03',100);
  const old=[{project:'ELYSIAN',id:row.id,signature:token(row)}];
  denied(()=>call({source:[],previousMirror:old}),'SOURCE_REMOVED');
  denied(()=>call({source:[{...row,subcontract:101}],previousMirror:old}),'EDIT_REQUIRES_REVIEW');
});
test('duplicate source IDs and cross-project IDs are rejected',()=>{
  const x=source('2026-11-03',100);
  denied(()=>call({source:[x,x]}),'SOURCE_ID');
  denied(()=>call({source:[{...x,project:'PHU HUNG'}]}),'SOURCE_ID');
});
test('unknown money, invalid dates and conflicting opening balance are rejected',()=>{
  denied(()=>call({source:[{...source('2026-11-03',100),income:'0'}]}),'INVALID_AMOUNT');
  denied(()=>call({source:[source('2026-02-30',100)]}),'INVALID_DATE');
  denied(()=>call({openingBalance:1001}),'OPENING_CONFLICT');
});
