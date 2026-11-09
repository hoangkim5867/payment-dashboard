'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit,dateValue,amount}=require('../site/assets/js/cash-sync-historical-audit.js');
const row=(day,inc,out,balance)=>[day,'x','','','','',inc,out,0,0,0,0,0,balance];
test('historical ledger opening, continuity, transitions, closing are read-only',()=>{
 const r=audit([
 ['日期','公司','','','','','收入','','','','','','','余额'],
 row('2026-10-31',100,10,1090),
 row('2026-11-01',50,20,1120)
 ]);
 assert.equal(r.transactionRows,2);
 assert.equal(r.openingBalance,1000);
 assert.equal(r.closingBalance,1120);
 assert.equal(r.monthTransitions,1);
 assert.equal(r.continuityErrors,0);
 assert.equal(r.status,'internally-consistent');
 assert.equal(r.canWrite,false);
});
test('detects incorrect running balance and does not mark data approved',()=>{
 const r=audit([row('2026-10-31',100,10,1090),row('2026-11-01',50,20,1190)]);
 assert.equal(r.continuityErrors,1);
 assert.equal(r.status,'needs-review');
 assert.equal(r.canWrite,false);
});
test('small rounding exception requires review, not silent tolerance',()=>{
 const r=audit([row('2026-10-31',100,10,1090),row('2026-11-01',50,20,1120.3)]);
 assert.equal(r.roundingDifferences,1);
 assert.equal(r.status,'needs-review');
});
test('blank S19-3-style tab and title-only tab are differentiated',()=>{
 assert.equal(audit([]).status,'blank-tab');
 assert.equal(audit([[''],[]]).status,'blank-tab');
 assert.equal(audit([['S19-3 ledger']]).status,'unsupported-layout');
});
test('rejects missing and malformed financial amounts',()=>{
 const a=audit([row('2026-10-31',100,10,'')]);
 assert.equal(a.missingBalance,1);
 const b=audit([row('2026-10-31',100,'some words',1090)]);
 assert.equal(b.invalidMoney,1);
});
test('recognizes Sheets serial dates and Chinese/formatted dates',()=>{
 assert.equal(dateValue(46326),'2026-11-30');
 assert.equal(dateValue('01/11/2026'),'2026-11-01');
 assert.equal(dateValue('2026-02-30'),'');
 assert.equal(amount('1,000,000'),1000000);
 assert.equal(amount('1.000.000'),1000000);
});
test('guards date reversal without hiding it',()=>{
 const r=audit([row('2026-11-01',100,0,100),row('2026-10-30',20,0,120)]);
 assert.equal(r.nonMonotonicDates,1);
 assert.equal(r.status,'needs-review');
});
