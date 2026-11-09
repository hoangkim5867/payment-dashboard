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
 assert.equal(r.status,'needs-financial-review');
 assert.equal(r.canWrite,false);
});
test('small rounding exception requires review, not silent tolerance',()=>{
 const r=audit([row('2026-10-31',100,10,1090),row('2026-11-01',50,20,1120.3)]);
 assert.equal(r.roundingDifferences,1);
 assert.equal(r.status,'needs-financial-review');
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
 assert.equal(dateValue(46326),'2026-10-31');
 assert.equal(dateValue('01/11/2026'),'2026-11-01');
 assert.equal(dateValue('2026-02-30'),'');
 assert.equal(amount('1,000,000'),1000000);
 assert.equal(amount('1.000.000'),1000000);
});
test('guards date reversal without hiding it',()=>{
 const r=audit([row('2026-11-01',100,0,100),row('2026-10-30',20,0,120)]);
 assert.equal(r.nonMonotonicDates,1);
 assert.equal(r.status,'review-date-order');
});

test('missing every N value indicates unsupported ledger layout, not confirmed loss',()=>{
 const r=audit([row('2026-10-01',100,0,''),row('2026-10-02',0,50,'')]);
 assert.equal(r.status,'unsupported-layout');
 assert.equal(r.missingEveryBalance,true);
 assert.equal(r.missingBalance,2);
 assert.equal(r.canWrite,false);
});
test('only date-order warning does not masquerade as arithmetic corruption',()=>{
 const r=audit([row('2026-11-01',100,0,1100),row('2026-10-30',20,0,1120)]);
 assert.equal(r.status,'review-date-order');
 assert.equal(r.continuityErrors,0);
 assert.equal(r.nonMonotonicDates,1);
 assert.equal(r.canWrite,false);
});

test('FOXCONN: explicit import tax + VAT column N, balance O, and valid continuity',()=>{
 const h=['日期','单位','合同','内容','IPC','类型','收入','分包','材料','其他直接费','间接费','财务费用','其他应付款','进口税+增值税','余额'];
 const f=(date,income,cost,tax,balance)=>[
 date,'A','LAB','test','IPC','type',income,cost,0,0,0,0,0,tax,balance];
 const result=audit([h,f('2026-10-01',1000,100,40,1860),
   f('2026-10-02',500,50,25,2285)],{project:'FOXCONN'});
 assert.equal(result.taxColumnsDetected,1);
 assert.equal(result.taxRows,2);
 assert.equal(result.taxTotal,65);
 assert.equal(result.closingBalance,2285);
 assert.equal(result.continuityErrors,0);
 assert.equal(result.missingBalance,0);
 assert.equal(result.status,'internally-consistent');
 assert.equal(result.canWrite,false);
});
test('FOXCONN: detect tax after expenses in one section, switch back safely when header repeats',()=>{
 const h=['日期','单位','合同','内容','IPC','类型','收入','分包','材料','其他直接费','间接费','财务费用','其他应付款','进口税+增值税','余额'];
 const r=(d,inc,out,tax,bal)=>[d,'','','','','',inc,out,0,0,0,0,0,tax,bal];
 const a=audit([h,r('2026-10-01',100,20,10,1070),
    ['2026-11','',...Array.from({length:13},()=>'')],
    h,r('2026-11-01',50,0,20,1100)],{project:'FOXCONN'});
 assert.equal(a.taxColumnsDetected,2);
 assert.equal(a.continuityErrors,0);
 assert.equal(a.taxTotal,30);
});
test('FOXCONN unknown tax header blocks rather than misreads N as balance',()=>{
 const a=audit([['日期','','','','','','','进口税+增值税'],
   row('2026-10-01',100,10,'')],{project:'FOXCONN'});
 assert.equal(a.status,'unsupported-tax-layout');
 assert.equal(a.canWrite,false);
});
test('FOXCONN tax missing from header blocks assumptions even if ledger appears valid',()=>{
 const a=audit([row('2026-10-01',100,0,1100)],{project:'FOXCONN'});
 assert.equal(a.status,'unsupported-tax-layout');
 assert.equal(a.canWrite,false);
});
test('standard project ignores unrelated tax row and retains previous template',()=>{
 const a=audit([row('2026-10-01',100,0,1100)],{project:'EATON'});
 assert.equal(a.status,'internally-consistent');
});

test('FOXCONN header diagnostics identify columns without copying financial amounts',()=>{
 const rows=[['日期','','','','','','收入','分包','材料','其他直接费','间接费','财务费用','其他应付款','进口税+增值税','余额'],
 ['2026-10-01','company','','','','',1000,100,0,0,0,0,0,50,850]];
 const {diagnoseHeaders}=require('../site/assets/js/cash-sync-historical-audit.js');
 const report=diagnoseHeaders(rows);
 assert.ok(report.some(r=>r.columns.some(c=>c.startsWith('N:')&&c.includes('进口税'))));
 assert.ok(report.some(r=>r.columns.some(c=>c.startsWith('O:')&&c.includes('余额'))));
 assert.ok(!JSON.stringify(report).includes('1000'));
});

test('FOXCONN real split header at rows 3 and 4 detects N tax without assuming O balance',()=>{
 const header3=['日期','','','','','','收入','支出'];
 const header4=Array(15).fill('');
 header4[7]='分包款';header4[8]='材料款';header4[13]='进口税+增值税';
 const row=[ '2026-10-01','','','','','',100,10,0,0,0,0,0,20,1070 ];
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const result=api.audit([['FOXCONN项目现金流'],[],header3,header4,row],{project:'FOXCONN'});
 assert.equal(result.taxColumnsDetected,1);
 assert.equal(result.balanceColumnUnconfirmed,true);
 assert.equal(result.taxColumn,14);
 assert.equal(result.layoutErrors,0);
 assert.equal(result.status,'unsupported-tax-layout');
 assert.equal(result.canWrite,false);
 const candidates=api.foxconnBalanceCandidates([row]);
 assert.ok(candidates.some(x=>x.column==='O'&&x.numericRows===1));
});

test('FOXCONN O-column probe computes expenses including N tax but never authorizes sync',()=>{
 const header=['日期','','','','','','收入','支出'];
 const sub=Array(15).fill('');
 sub[7]='分包款';sub[8]='材料款';sub[13]='进口税+增值税';
 const a=['2026-10-01','','','','','',1000,100,0,0,0,0,0,40,1860];
 const b=['2026-10-02','','','','','',500,50,0,0,0,0,0,25,2285];
 const report=audit([header,sub,a,b],{project:'FOXCONN',probeBalanceIndex:14});
 assert.equal(report.status,'provisional-balance-review');
 assert.equal(report.taxColumnsDetected,1);
 assert.equal(report.taxTotal,65);
 assert.equal(report.provisionalBalanceRows,2);
 assert.equal(report.continuityErrors,0);
 assert.equal(report.closingBalance,2285);
 assert.equal(report.canWrite,false);
});
test('FOXCONN O candidate with wrong arithmetic stays provisional and reports mismatch',()=>{
 const sub=Array(15).fill('');sub[13]='进口税+增值税';
 const a=['2026-10-01','','','','','',1000,100,0,0,0,0,0,40,1860];
 const b=['2026-10-02','','','','','',500,50,0,0,0,0,0,25,2290];
 const report=audit([sub,a,b],{project:'FOXCONN',probeBalanceIndex:14});
 assert.equal(report.status,'provisional-balance-review');
 assert.equal(report.continuityErrors,1);
 assert.equal(report.canWrite,false);
});
