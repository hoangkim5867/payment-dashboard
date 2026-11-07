'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareOriginalWithTest,scanRows,normDate,auditKnownPayrollCorrection}=
  require('../server/cash-sync-original-audit.cjs');

const header=['Ngày','Đơn vị','HĐ','Nội dung','IPC','Loại','Thu','Thầu phụ',
  'Vật tư','CP khác','CP gián tiếp','Phí TC','Khác','Số dư'];
const row=(date,expense,balance)=>[date,'Vendor','HĐ001','Chi phí','IPC001','支出',
  0,expense,0,0,0,0,0,balance];
test('original and TEST: full row+balance comparison succeeds without mutations',()=>{
  const a=[header,row('2026-10-01',100,900),row('2026-10-02',50,850)];
  const before=JSON.stringify(a);
  const result=compareOriginalWithTest(a,JSON.parse(JSON.stringify(a)));
  assert.equal(result.matched,true);
  assert.equal(result.originalRows,2);
  assert.equal(result.testRows,2);
  assert.equal(result.originalClosing,850);
  assert.equal(result.mismatches.length,0);
  assert.equal(JSON.stringify(a),before);
});
test('Google date serials, Vietnamese dates and blank expense cells normalize correctly',()=>{
  const serial=(Date.UTC(2026,9,1)-Date.UTC(1899,11,30))/86400000;
  const a=[header,row(serial,100,900),row('02/10/2026','',900)];
  const b=[header,row('2026-10-01',100,900),row('2026-10-02',0,900)];
  assert.equal(compareOriginalWithTest(a,b).matched,true);
  assert.equal(normDate(serial),'2026-10-01');
});
test('original and TEST must have the exact same transactions, not only total',()=>{
  const a=[header,row('2026-10-01',100,900)];
  const b=[header,row('2026-10-01',120,900)];
  const result=compareOriginalWithTest(a,b);
  assert.equal(result.matched,false);
  assert.deepEqual(result.mismatches,[{originalRow:2,testRow:2}]);
});
test('same count but changed historical running balance fails',()=>{
  const a=[header,row('2026-10-01',100,900)];
  const b=[header,row('2026-10-01',100,901)];
  assert.equal(compareOriginalWithTest(a,b).matched,false);
});
test('row count mismatch is blocked without guessing missing transactions',()=>{
  const a=[header,row('2026-10-01',100,900)];
  const b=[header,row('2026-10-01',100,900),row('2026-10-02',50,850)];
  const result=compareOriginalWithTest(a,b);
  assert.equal(result.matched,false);
  assert.equal(result.originalRows,1);
  assert.equal(result.testRows,2);
});
test('empty original and missing closing balances stop the audit',()=>{
  assert.throws(()=>scanRows([header]),/Không tìm thấy/);
  assert.throws(()=>scanRows([header,row('2026-10-01',100,'')]),/không hợp lệ/);
});

const knownCorrectionFixtures=()=>{
  const original=[header],testRows=[header];
  for(let i=0;i<160;i++){
    const sheetRow=i+2,after=sheetRow>=148;
    const amount=sheetRow===148?350945181.3:100;
    const cashAmount=sheetRow===148?350945181:100;
    const date=sheetRow===148?'2026-10-27':'2026-10-01';
    original.push([date,'Vendor','HĐ001','Chi phí','IPC001','支出',
      0,0,0,0,amount,0,0,after?13289845381.7:13289845382]);
    testRows.push([date,'Vendor','HĐ001','Chi phí','IPC001','支出',
      0,0,0,0,cashAmount,0,0,13289845382]);
  }
  return {original,testRows};
};
test('verified K148 payroll 0.3 discrepancy is explicitly approved without altering source',()=>{
  const {original,testRows}=knownCorrectionFixtures();
  const before=JSON.stringify(original);
  const check=auditKnownPayrollCorrection(original,testRows);
  assert.equal(check.approved,true);
  assert.equal(check.exceptionCell,'K148');
  assert.equal(check.delta,0.3);
  assert.equal(check.originalBalance,13289845381.7);
  assert.equal(check.cashControlBalance,13289845382);
  assert.equal(JSON.stringify(original),before);
  assert.equal(compareOriginalWithTest(original,testRows).matched,false,'strict audit still detects differences');
});
test('unknown 0.3 discrepancy in another expense column is blocked',()=>{
  const {original,testRows}=knownCorrectionFixtures();
  testRows[149][9]=0.3;
  assert.equal(auditKnownPayrollCorrection(original,testRows).approved,false);
});
test('unrelated fractional balance difference is blocked, even on known payroll day',()=>{
  const {original,testRows}=knownCorrectionFixtures();
  testRows[147][13]+=0.1;
  assert.equal(auditKnownPayrollCorrection(original,testRows).approved,false);
});
test('incorrect K148 source amount or date blocks approval',()=>{
  const {original,testRows}=knownCorrectionFixtures();
  original[147][10]=350945181.4;
  assert.equal(auditKnownPayrollCorrection(original,testRows).approved,false);
  original[147][10]=350945181.3;
  original[147][0]='2026-10-28';
  assert.equal(auditKnownPayrollCorrection(original,testRows).approved,false);
});
test('a missing historical transaction blocks approval even if closing balance matches',()=>{
  const {original,testRows}=knownCorrectionFixtures();
  testRows.pop();
  assert.equal(auditKnownPayrollCorrection(original,testRows).approved,false);
});
