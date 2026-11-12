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
 assert.equal(dateValue('25-11-2021'),'2021-11-25');
 assert.equal(dateValue('25.11.2021'),'2021-11-25');
 assert.equal(dateValue('31-02-2026'),'');
 assert.equal(dateValue('25-11/2026'),'');
 assert.equal(dateValue('2026-02-30'),'');
 assert.equal(amount('1,000,000'),1000000);
 assert.equal(amount('1.000.000'),1000000);
});
test('guards date reversal without hiding it',()=>{
 const r=audit([row('2026-11-01',100,0,100),row('2026-10-30',20,0,120)]);
 assert.equal(r.nonMonotonicDates,1);
 assert.equal(r.status,'review-date-order');
});

test('captures exact date reversal row pairs without treating valid running sums as errors',()=>{
 const rows=[row('2026-11-02',100,0,1100),row('2026-10-31',20,0,1120),
   row('2026-11-04',30,0,1150),row('2026-11-03',10,0,1160)];
 const a=audit(rows,{project:'ELYSIAN'});
 assert.equal(a.dateOrderOnly,true);
 assert.equal(a.continuityErrors,0);
 assert.equal(a.nonMonotonicDates,2);
 assert.deepEqual(a.dateOrderExamples,[
   {previousRow:1,previousDate:'2026-11-02',dateRow:2,date:'2026-10-31',crossesMonth:true},
   {previousRow:3,previousDate:'2026-11-04',dateRow:4,date:'2026-11-03',crossesMonth:false}
 ]);
 assert.equal(a.canWrite,false);
});
test('financial mismatch never receives date-order-only classification',()=>{
 const a=audit([row('2026-11-02',100,0,1100),
   row('2026-10-31',20,0,1130)]);
 assert.equal(a.nonMonotonicDates,1);
 assert.equal(a.dateOrderOnly,false);
 assert.equal(a.continuityErrors,1);
 assert.equal(a.canWrite,false);
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

test('FOXCONN screenshot layout: row 3 O 余额 plus row 4 N import VAT verifies balance header',()=>{
 const banner=Array(15).fill('');
 banner[0]='日期';banner[6]='收入';banner[7]='支出';banner[14]='余额';
 const sub=Array(15).fill('');
 sub[7]='分包款';sub[8]='材料款';sub[13]='进口税+增值税';
 const a=['2025-10-01','','','','','',2000000000,0,0,0,0,0,0,0,2000000000];
 const b=['2025-10-02','','','','','',0,100,0,0,0,0,0,20,1999999880];
 const report=audit([['FOXCONN项目现金流'],['期间'],banner,sub,a,b],{project:'FOXCONN'});
 assert.equal(report.taxColumn,14);
 assert.equal(report.balanceColumnUnconfirmed,false);
 assert.equal(report.closingBalance,1999999880);
 assert.equal(report.continuityErrors,0);
 assert.equal(report.status,'internally-consistent');
 assert.equal(report.canWrite,false);
});

test('FOXCONN balance heading with internal space in row 3 is recognized',()=>{
 const top=Array(15).fill('');top[14]='余 额';
 const sub=Array(15).fill('');sub[13]='进口税+增值税';
 const one=['2025-10-01','','','','','',1000,0,0,0,0,0,0,0,1000];
 const r=audit([top,sub,one],{project:'FOXCONN'});
 assert.equal(r.balanceColumnUnconfirmed,false);
 assert.equal(r.closingBalance,1000);
 assert.equal(r.status,'internally-consistent');
 assert.equal(r.canWrite,false);
});
test('FOXCONN O3 balance with invisible marks and VND unit is confirmed from text',()=>{
 const h=Array(15).fill('');h[14]='\uFEFF余\u200B额 (VND)';
 const sub=Array(15).fill('');sub[13]='进口税+增值税';
 const a=['2025-10-01','','','','','',2000,0,0,0,0,0,0,0,2000];
 const b=['2025-10-02','','','','','',0,0,0,0,0,0,0,100,1900];
 const result=audit([h,sub,a,b],{project:'FOXCONN'});
 assert.equal(result.balanceColumnUnconfirmed,false);
 assert.equal(result.status,'internally-consistent');
 assert.equal(result.closingBalance,1900);
 assert.equal(result.canWrite,false);
});
test('FOXCONN source without dedicated import VAT is blocked, not treated as zero',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const history=[['2026-10-01','','','','','',1000,100,0,0,0,0,0,50,850]];
 const source=[{date:'2026-10-01',income:1000,subcontract:100}];
 const r=api.compareFoxconnCandidates(history,source);
 assert.equal(r.status,'blocked-tax-mapping');
 assert.equal(r.unmappedTax,1);
 assert.equal(r.canWrite,false);
});
test('FOXCONN exact eight financial columns produce candidates only, never writes',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const history=[['2026-10-01','','','','','',1000,100,0,0,0,0,0,50,850]];
 const source=[{date:'2026-10-01',income:1000,subcontract:100,
   material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,importTaxVat:50}];
 const r=api.compareFoxconnCandidates(history,source);
 assert.equal(r.status,'candidates-only');
 assert.equal(r.candidates,1);
 assert.equal(r.sourceComplete,false);
 assert.equal(r.identityVerified,false);
 assert.equal(r.canWrite,false);
});
test('FOXCONN matching money but different IPC is identity conflict and blocks writing',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const history=[['2026-10-01','VENDOR','FOX-CONTRACT','','IPC017','',1000,100,0,0,0,0,0,50,850]];
 const source=[{date:'2026-10-01',company:'VENDOR',contractNo:'FOX-CONTRACT',ipc:'IPC018',
  income:1000,subcontract:100,material:0,otherDirect:0,indirect:0,financial:0,
  otherPayable:0,importTaxVat:50}];
 const result=api.compareFoxconnCandidates(history,source);
 assert.equal(result.candidates,1);
 assert.equal(result.identityConflict,1);
 assert.equal(result.identityConsistent,0);
 assert.equal(result.canWrite,false);
});
test('FOXCONN explicit tax classification is isolated to read-only audit metadata',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
 assert.match(source,/const foxconnTaxReview=project==='FOXCONN'/);
 assert.match(source,/const foxconnImportTax=project==='FOXCONN'/);
 assert.match(source,/\.\.\.\(project==='FOXCONN'&&!foxconnTaxReview\?\{importTaxVat:foxconnImportTax\}:\{\}\)/);
 for(const category of ['subcontract','material','indirect','financial','otherPayable']){
   const block=source.match(new RegExp(category+':x\\.direction===\\\'out\\\'[^\\n]*\\?amount:0,'));
   assert.ok(block,category+' must be mapped');
   assert.match(block[0],/!foxconnImportTax\\?amount:0/);
 }

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

test('financial row diagnostics are not displaced by date-order warnings',()=>{
 const rows=Array.from({length:10},(_,i)=>row('2026-10-'+String(20-i).padStart(2,'0'),100,10,1000+i*90));
 rows[9][13]+=120;
 const r=audit(rows,{project:'C13B'});
 assert.equal(r.continuityErrors,1);
 assert.equal(r.financialExamples.length,1);
 assert.equal(r.financialExamples[0].row,10);
 assert.equal(r.financialExamples[0].detail,120);
 assert.equal(r.canWrite,false);
});
test('S19-3 with no transactions is new and cannot write',()=>{
 const r=audit([['项目名称','S19-3']],{project:'S19-3'});
 assert.equal(r.transactionRows,0);
 assert.equal(r.status,'new-project-no-transactions');
 assert.equal(r.canWrite,false);
});
test('CHAOMED candidate columns are only numeric coverage, not approval',()=>{
 const {balanceColumnCandidates}=require('../site/assets/js/cash-sync-historical-audit.js');
 const rows=[['日期'],row('2026-10-01',100,10,''),row('2026-10-02',50,20,'')];
 rows[1][14]=200;rows[2][14]=230;
 const candidates=balanceColumnCandidates(rows,13,17);
 assert.deepEqual(candidates,[{column:'O',numericRows:2,totalRows:2}]);
 assert.equal(audit(rows,{project:'CHAOMED'}).status,'unsupported-layout');
});

test('financial mismatch remains available despite earlier date-order notices',()=>{
 const rows=[row('2026-10-02',100,20,1080),row('2026-10-01',100,20,1170)];
 const r=audit(rows,{project:'C13B'});
 assert.equal(r.nonMonotonicDates,1);
 assert.equal(r.continuityErrors,1);
 assert.deepEqual(r.financialExamples.filter(x=>x.kind==='balance').map(x=>x.row),[2]);
 assert.equal(r.canWrite,false);
});
test('new S19-3 project with empty sheet is not a financial error and never approved for writing',()=>{
 const r=audit([],{project:'S19-3'});
 assert.equal(r.status,'new-project-no-transactions');
 assert.equal(r.transactionRows,0);
 assert.equal(r.canWrite,false);
});
test('CHAOMED balance column candidates are numbers only, not automatic layout approval',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const a=row('2026-10-01',100,20,'');a[14]=1000;
 const b=row('2026-10-02',50,10,'');b[14]=1040;
 const found=api.balanceColumnCandidates([a,b],13,17);
 assert.deepEqual(found.map(x=>x.column),['O']);
 assert.equal(found[0].numericRows,2);
 assert.equal(audit([a,b],{project:'CHAOMED'}).status,'unsupported-layout');
});

test('historical project with nonempty but nonrecognized dates stays blocked, not new/blank',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const rows=[['日期','项目'],['2026/10/03','中健厂房'],['03-10-26','记录'],[12345,'金额']];
 const result=api.audit(rows,{project:'中健厂房'});
 assert.equal(result.status,'unsupported-layout');
 assert.equal(result.transactionRows,0);
 assert.equal(result.canWrite,false);
 const diag=api.dateLayoutDiagnostic(rows);
 assert.equal(diag.nonemptyRows,4);
 assert.equal(diag.validDatesByColumn[0],0); // Unsupported 2026/10/03 must not be silently accepted
 assert.ok(diag.suspectRows.some(x=>x.row===3));
});

test('read-only candidate comparison excludes pre-cutover history and reports potential duplicate multiplicity',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const historical=[
 row('2026-09-29',100,0,1000),
 row('2026-10-01',100,10,1090),
 row('2026-10-02',40,0,1130),
 row('2026-10-02',40,0,1170)
 ];
 const cash=[
 {date:'2026-10-01',income:100,subcontract:10},
 {date:'2026-10-02',income:40},
 {date:'2026-10-03',income:20}
 ];
 const r=api.compareLoadedCashControl(historical,'C13B',cash,{sourceComplete:true});
 assert.equal(r.historicalScope,3);
 assert.equal(r.sourceScope,3);
 assert.equal(r.matched,2);
 assert.equal(r.historicalOnly,1);
 assert.equal(r.cashOnly,1);
 assert.equal(r.ambiguous,1);
 assert.equal(r.canWrite,false);
 assert.equal(r.status,'candidates-only');
});
test('incomplete cached source is always blocked even when all candidate signatures match',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const r=api.compareLoadedCashControl([row('2026-10-01',10,0,10)],
   'ADVANCE',[{date:'2026-10-01',income:10}],{sourceComplete:false});
 assert.equal(r.matched,1);
 assert.equal(r.status,'incomplete-memory-source');
 assert.equal(r.canWrite,false);
});
test('FOXCONN tax-specific historical columns are never naively matched to seven source categories',()=>{
 const api=require('../site/assets/js/cash-sync-historical-audit.js');
 const r=api.compareLoadedCashControl([], 'FOXCONN',[],{sourceComplete:true});
 assert.equal(r.status,'requires-tax-mapping');
 assert.equal(r.canWrite,false);
});

test('candidate match with same date and money but different contract/IPC reports identity conflict',()=>{
 const historical=[row('2026-10-07',1000,200,800)];
 historical[0][1]='Vendor A';historical[0][2]='LAB-01';historical[0][4]='IPC001';
 const source=[{date:'2026-10-07',company:'Vendor A',contractNo:'LAB-02',
   ipc:'IPC001',income:1000,subcontract:200}];
 const r=require('../site/assets/js/cash-sync-historical-audit.js')
   .compareLoadedCashControl(historical,'ELYSIAN',source,{sourceComplete:true});
 assert.equal(r.matched,1);
 assert.equal(r.identityConflict,1);
 assert.equal(r.identityConsistent,0);
 assert.equal(r.canWrite,false);
});
test('candidate match with fully equal company contract and IPC remains read-only',()=>{
 const historical=[row('2026-10-07',1000,200,800)];
 historical[0][1]='Vendor A';historical[0][2]='LAB-01';historical[0][4]='IPC001';
 const source=[{date:'2026-10-07',company:'vendor a',contractNo:'LAB-01',
   ipc:'IPC001',income:1000,subcontract:200}];
 const r=require('../site/assets/js/cash-sync-historical-audit.js')
   .compareLoadedCashControl(historical,'ELYSIAN',source,{sourceComplete:true});
 assert.equal(r.identityConsistent,1);
 assert.equal(r.identityConflict,0);
 assert.equal(r.canWrite,false);
});
test('candidate match without identifying fields is unverified rather than approved',()=>{
 const r=require('../site/assets/js/cash-sync-historical-audit.js')
   .compareLoadedCashControl([row('2026-10-07',1000,200,800)],
     'ELYSIAN',[{date:'2026-10-07',income:1000,subcontract:200}],
     {sourceComplete:true});
 assert.equal(r.identityUnverified,1);
 assert.equal(r.identityConsistent,0);
 assert.equal(r.canWrite,false);
});

test('date diagnostics count every suspicious date even after eight examples',()=>{
 const rows=Array.from({length:12},(_,i)=>['31-02-2026','company','','','','',0,0,0,0,0,0,0,i]);
 const r=require('../site/assets/js/cash-sync-historical-audit.js').dateLayoutDiagnostic(rows);
 assert.equal(r.suspectCount,12);
 assert.equal(r.suspectRows.length,8);
 assert.equal(r.truncatedExamples,true);
 assert.equal(r.nonemptyRows,12);
});
test('date diagnostics do not expose transaction amounts or raw cell text',()=>{
 const r=require('../site/assets/js/cash-sync-historical-audit.js').dateLayoutDiagnostic([
  ['2026年11月30日','PRIVATE PAYEE','SENSITIVE CONTRACT',0,0,0,9999999]
 ]);
 assert.equal(r.suspectCount,1);
 assert.deepEqual(r.suspectRows,[{row:1,type:'text'}]);
 assert.ok(!JSON.stringify(r).includes('PRIVATE PAYEE'));
 assert.ok(!JSON.stringify(r).includes('9999999'));
});
