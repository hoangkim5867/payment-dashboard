'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareOriginalWithTest,scanRows,normDate}=
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
