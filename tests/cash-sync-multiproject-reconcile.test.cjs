'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditHistoricalLedger}=require('../server/cash-sync-multiproject-reconcile.cjs');
const row=(date,income,expense,balance)=>[
 date,'Company','LAB-001','Content','IPC001','劳务款',
 income,expense,0,0,0,0,0,balance];
const source=(id,date,income,expense)=>({
 project:'EATON',id,date,amounts:[income,expense,0,0,0,0,0]});
const history=[
 ['日期','公司','合同','内容','IPC','类型','收入','支出','','','','','','余额'],
 row('2026-10-01',100,20,1080),
 row('2026-10-02',50,30,1100)
];
const sources=[
 source('stable-1','2026-10-01',100,20),
 source('stable-2','2026-10-02',50,30)
];
test('reconciles chronological history and matching Cash Control source without writing',()=>{
 const x=auditHistoricalLedger('EATON',history,sources,{confirmedOpeningBalance:1000});
 assert.equal(x.historicalCount,2);
 assert.equal(x.openingBalance,1000);
 assert.equal(x.historicalClosingBalance,1100);
 assert.equal(x.rowsMatched,2);
 assert.equal(x.historicalRowsVerified,true);
 assert.equal(x.closingBalanceVerified,true);
 assert.equal(x.sourceCompletenessVerified,false);
 assert.equal(x.canWrite,false);
});
test('detects tampered running balance instead of reusing false closing balance',()=>{
 const bad=history.map(x=>x.slice());bad[2][13]=1101;
 const x=auditHistoricalLedger('EATON',bad,sources,{confirmedOpeningBalance:1000});
 assert.equal(x.continuityErrorCount,1);
 assert.equal(x.closingBalanceVerified,false);
 assert.equal(x.canWrite,false);
});
test('detects missing Cash Control row, extra row, and ambiguous repeated amounts',()=>{
 const missing=auditHistoricalLedger('EATON',history,[sources[0]],{confirmedOpeningBalance:1000});
 assert.equal(missing.unmatchedHistorical,1);
 assert.equal(missing.historicalRowsVerified,false);
 const extra=auditHistoricalLedger('EATON',history,[...sources,
  source('extra','2026-11-01',7,0)],{confirmedOpeningBalance:1000});
 assert.equal(extra.unmatchedSource,1);
 assert.equal(extra.closingBalanceVerified,false);
 const duplicates=auditHistoricalLedger('EATON',[...history,
   row('2026-10-02',50,30,1120)],sources,{confirmedOpeningBalance:1000});
 assert.ok(duplicates.ambiguousMatches>0);
 assert.equal(duplicates.canWrite,false);
});
test('a blank tab requires confirmed opening and still never allows writes',()=>{
 assert.throws(()=>auditHistoricalLedger('EATON',[],sources),/confirmed opening/);
 const x=auditHistoricalLedger('EATON',[],sources,{confirmedOpeningBalance:0});
 assert.equal(x.kind,'blank-tab');
 assert.equal(x.projectedClosingBalance,100);
 assert.equal(x.closingBalanceVerified,false);
 assert.equal(x.canWrite,false);
});
test('nonempty tab without recognized transaction blocks rather than being mistaken for blank',()=>{
 assert.throws(()=>auditHistoricalLedger('EATON',[['some text']],sources,{confirmedOpeningBalance:0}),/nonempty/);
});
test('wrong project and protected PHU HUNG are refused',()=>{
 assert.throws(()=>auditHistoricalLedger('PHU HUNG',history,sources,{confirmedOpeningBalance:1000}));
 assert.throws(()=>auditHistoricalLedger('EATON',history,[{...sources[0],project:'ELYSIAN'}],
  {confirmedOpeningBalance:1000}));
});
test('unconfirmed opening never permits closing balance verification',()=>{
 const x=auditHistoricalLedger('EATON',history,sources);
 assert.equal(x.openingConfirmed,false);
 assert.equal(x.closingBalanceVerified,false);
});
