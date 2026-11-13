'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const auditor=require('../site/assets/js/cash-sync-historical-audit.js');

test('Google comparison is a manual Admin-only, production-only, read-only action',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 assert.ok(start>0&&end>start);
 const fn=code.slice(start,end);
 assert.match(code,/id="ccSyncProjectCompareGoogle"/);
 assert.match(code,/addEventListener\('click',ccSyncCompareProjectGoogleReadOnly\)/);
 assert.match(fn,/!currentAuthUser\|\|!isCashControlOwner\(\)/);
 assert.match(fn,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(fn,/project==='PHU HUNG'/);
 assert.match(fn,/ccGoogleSyncToken/);
 assert.match(fn,/confirm\(/);
 assert.match(fn,/loadProjectPayments\(project,\{force:true,quiet:true,refresh:false\}\)/);
 assert.match(fn,/compareFoxconnCandidates/);
 assert.match(fn,/compareLoadedCashControl/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|ccGoogleSyncOriginalRequest)\(/);
});
test('normal Cash Control export unchanged and FOXCONN tax separated as audit only',()=>{
 const a=code.indexOf('function legacyCashExportRows(');
 const b=code.indexOf('function ccSyncFoxconnAuditRows(');
 assert.ok(a>0&&b>0);
 const source=code.slice(a,a+4000);
 assert.doesNotMatch(source,/importTaxVat/);
 const fn=code.slice(b,code.indexOf('async function ccSyncCompareProjectGoogleReadOnly()',b));
 assert.match(fn,/result\.importTaxVat=tax/);
 assert.match(fn,/category==='taxDeposit'&&!explicit/);
 assert.match(fn,/expense\.actualAmount\?\?expense\.amount\?\?0/);
 assert.doesNotMatch(fn,/expense\.actualAmount\|\|expense\.amount/);
});
test('FOXCONN tax amount must have exact separate field',()=>{
 const history=[[...Array(13).fill(''),'进口税+增值税','余额'],['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,10,70]];
 const missing=[{date:'2026-10-01',company:'ACME',contractNo:'C1',ipc:'IPC1',
   income:100,subcontract:20,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0}];
 const blocked=auditor.compareFoxconnCandidates(history,missing);
 assert.equal(blocked.canWrite,false);
 assert.equal(blocked.unmappedTax,1);
 assert.equal(blocked.candidates,0);
 const complete=[{...missing[0],importTaxVat:10}];
 const provisional=auditor.compareFoxconnCandidates(history,complete);
 assert.equal(provisional.candidates,1);
 assert.equal(provisional.canWrite,false);
 assert.equal(provisional.sourceComplete,false);
 assert.equal(provisional.identityConsistent,1);
});
test('FOXCONN different IPC is identity conflict, never sync approval',()=>{
 const history=[[...Array(13).fill(''),'进口税+增值税','余额'],['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,10,70]];
 const source=[{date:'2026-10-01',company:'ACME',contractNo:'C1',ipc:'IPC2',
   income:100,subcontract:20,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,importTaxVat:10}];
 const result=auditor.compareFoxconnCandidates(history,source);
 assert.equal(result.identityConflict,1);
 assert.equal(result.canWrite,false);
});

test('read-only report distinguishes full history from matching window and checks auth again',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/matched\.historicalScope/);
 assert.match(fn,/tổng lịch sử Google/);
 assert.match(fn,/phạm vi so khớp từ 10\/2026/);
 assert.match(fn,/currentAuthUser\.uid!==authUid/);
 assert.match(fn,/auditor\.dateLayoutDiagnostic/);
 assert.match(fn,/!matched\.sourceComplete/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
});

test('fresh one-project read and raw Firestore count reported before Google reads',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 const count=fn.indexOf('getCountFromServer(query(paymentsRef,where(\'project\',\'==\',project)))');
 const meta=fn.indexOf('const metaRes=await fetch(');
 assert.ok(count>0&&meta>count,'must count before any Google API fetch');
 assert.match(fn,/const countDifference=rawCount-rowsLoaded/);
 assert.match(fn,/const countUnverified=countDifference!==0;/);
 assert.match(fn,/chưa xác nhận đủ nguồn/);
 assert.doesNotMatch(fn,/if\(rawCount!==rowsLoaded\)\s*throw/);
 assert.match(fn,/countUnverified\?' \(chênh lệch, chưa xác nhận đủ nguồn\)'/);
 assert.match(fn,/Even equal counts do NOT verify alias coverage/);
 assert.doesNotMatch(fn,/setDoc\(|addDoc\(|updateDoc\(|deleteDoc\(/);
});

test('candidate identity normalizes whitespace without inventing a transaction ID',()=>{
 const history=[['2026-10-01','ACME  LTD','C1','','IPC1','',100,20,0,0,0,0,0,80]];
 const source=[{date:'2026-10-01',company:'ACME LTD',contractNo:'C1',ipc:'IPC1',
   income:100,subcontract:20,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0}];
 const result=auditor.compareLoadedCashControl(history,'OTHER',source,{sourceComplete:true});
 assert.equal(result.matched,1);
 assert.equal(result.identityConflict,0);
 assert.equal(result.identityConsistent,1);
 assert.equal(result.canWrite,false);
});

test('Google compare blocks invalid historical layout, balances and unmatched parsing',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/history\.status!=='internally-consistent'/);
 assert.match(fn,/history\.layoutErrors/);
 assert.match(fn,/history\.continuityErrors/);
 assert.match(fn,/matched\.invalidHistory/);
 assert.match(fn,/historyUnverified\|\|invalidMatchRows>0/);
 assert.match(fn,/trạng thái sổ/);
 assert.match(fn,/dòng Google không đối chiếu được/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
});

test('manual Google report blocks unmatched and unverified identity candidates',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/const unmatchedRows=Number\(h\|\|0\)\+Number\(s\|\|0\)/);
 assert.match(fn,/const missingIdentity=Number\(matched\.identityUnverified\|\|0\)/);
 assert.match(fn,/missingIdentity>0\|\|unmatchedRows>0/);
 assert.match(fn,/chưa đủ danh tính HĐ\/IPC/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
});

test('FOXCONN refuses historical candidates without a verified tax heading',()=>{
 const dated=['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,10,70];
 const source=[{date:'2026-10-01',company:'ACME',contractNo:'C1',ipc:'IPC1',
   income:100,subcontract:20,material:0,otherDirect:0,indirect:0,
   financial:0,otherPayable:0,importTaxVat:10}];
 const noHeader=auditor.compareFoxconnCandidates([dated],source);
 assert.equal(noHeader.candidates,0);
 assert.equal(noHeader.invalidHistory,1);
 const shifted=[Array(13).fill('')];
 shifted[0][12]='进口税+增值税';
 const badHeader=auditor.compareFoxconnCandidates([...shifted,dated],source);
 assert.equal(badHeader.candidates,0);
 assert.equal(badHeader.invalidHistory,1);
 const goodHeader=[...Array(13).fill(''),'进口税+增值税','余额'];
 const verified=auditor.compareFoxconnCandidates([goodHeader,dated],source);
 assert.equal(verified.candidates,1);
 assert.equal(verified.canWrite,false);
});

test('FOXCONN readiness blocks its native unmatched fields, identity and tax errors',()=>{
 const history={status:'internally-consistent',transactionRows:1,continuityErrors:0,
   roundingDifferences:0,missingBalance:0,invalidMoney:0,nonMonotonicDates:0};
 const comparison={sourceComplete:true,invalidHistory:0,invalidSource:0,
   ambiguous:0,historyOnly:1,sourceOnly:1,identityConflict:1,
   identityUnverified:1,unmappedTax:1};
 const result=auditor.assessProjectSyncReadiness('FOXCONN',history,comparison);
 assert.equal(result.status,'blocked');
 assert.equal(result.canWrite,false);
 for(const code of ['UNRESOLVED_MATCH','IDENTITY_CONFLICT','IDENTITY_UNVERIFIED','TAX_UNMAPPED'])
   assert.ok(result.blockers.some(x=>x.code===code),code);
});

test('FOXCONN blank tax mapping is unknown, but verified numeric zero is valid',()=>{
 const history=[[...Array(13).fill(''),'进口税+增值税','余额'],['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,0,80]];
 const basic={date:'2026-10-01',company:'ACME',contractNo:'C1',ipc:'IPC1',
   income:100,subcontract:20,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0};
 for(const tax of [undefined,null,'']){
   const result=auditor.compareFoxconnCandidates(history,[{...basic,importTaxVat:tax}]);
   assert.equal(result.unmappedTax,1);
   assert.equal(result.candidates,0);
   assert.equal(result.canWrite,false);
 }
 const verified=auditor.compareFoxconnCandidates(history,[{...basic,importTaxVat:0}]);
 assert.equal(verified.unmappedTax,0);
 assert.equal(verified.candidates,1);
 assert.equal(verified.canWrite,false);
});

test('Admin-only read comparison does not quietly reuse the Payment project cache',()=>{
 const a=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const b=code.indexOf('function ccSyncProjectCatalogRender()',a);
 const fn=code.slice(a,b);
 assert.match(fn,/confirm\(/);
 assert.match(fn,/await loadProjectPayments\(project,\{force:true,quiet:true,refresh:false\}\)/);
 assert.doesNotMatch(fn,/cached\|\|await loadProjectPayments/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
});

test('one-project reconciliation always fetches a new snapshot after Admin confirmation',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/const ok=await loadProjectPayments\(project,\{force:true,quiet:true,refresh:false\}\)/);
 assert.doesNotMatch(fn,/cached\|\|await loadProjectPayments/);
 assert.match(fn,/confirm\(/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
});

test('FOXCONN exception positions are diagnostics, never proof of a new payment',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const row=(ipc,amount,date='2026-10-01')=>[date,'ACME','C1','',ipc,'',amount,20,0,0,0,0,0,10,amount-30];
 const src=(ipc,amount,date='2026-10-01')=>({date,company:'ACME',contractNo:'C1',ipc,
   income:amount,subcontract:20,material:0,otherDirect:0,indirect:0,
   financial:0,otherPayable:0,importTaxVat:10});
 const history=[header,row('IPC1',100),row('IPC2',200)];
 const cash=[src('IPC1',100),src('IPC3',200),src('IPC4',300)];
 const out=auditor.compareFoxconnCandidates(history,cash);
 assert.equal(out.candidates,2);
 assert.equal(out.sourceOnly,1);
 assert.deepEqual(out.sourceOnlyPositions,[3]);
 assert.deepEqual(out.identityConflictPositions,[2]);
 assert.deepEqual(out.historyOnlyPositions,[]);
 assert.equal(out.canWrite,false);
 const duplicate=auditor.compareFoxconnCandidates([header,row('IPC1',100)],
   [src('IPC1',100),src('IPC1',100)]);
 assert.equal(duplicate.sourceOnly,1);
 assert.deepEqual(duplicate.sourceOnlyPositions,[]);
 assert.deepEqual(duplicate.ambiguousSourcePositions,[1,2]);
 assert.equal(duplicate.canWrite,false);
});
test('manual FOXCONN report exposes only candidate row positions and no writes',()=>{
 assert.match(code,/matched\.sourceOnlyPositions\?\.join/);
 assert.match(code,/matched\.identityConflictPositions\?\.join/);
 assert.match(code,/matched\.identityUnverifiedPositions\?\.join/);
});

test('FOXCONN exception table is an Admin-driven DOM-only diagnostic',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(code,/id="ccSyncFoxconnExceptionPanel" hidden/);
 assert.match(code,/id="ccSyncFoxconnExceptionRows"/);
 assert.match(fn,/\['Vấn đề','Vị trí','Ngày','Nguồn','Loại','Nội dung','Hợp đồng','IPC','Đối ứng Google \(ứng viên\)','Chứng cứ Google','Hai đầu điều chuyển \(nguồn\)','Quy tắc đối chiếu'\]/);
 assert.match(fn,/payload\.values\[candidateRow-1\]/);
 assert.match(fn,/transferSourceLegs\?\.verified\.find/);
 assert.match(fn,/CHƯA xác minh Google đối ứng/);
 assert.match(fn,/source\[position-1\]/);
 assert.match(fn,/row\.contractNo\|\|'—'/);
 assert.match(fn,/row\.ipc\|\|'—'/);
 assert.match(fn,/td\.textContent=String\(value\)/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('FOXCONN exception table labels transfer, Payment and payroll source without writes',()=>{
 const a=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const b=code.indexOf('function ccSyncProjectCatalogRender()',a);
 const fn=code.slice(a,b);
 assert.match(fn,/cashExpenseById=new Map\(allExpenses\(\)/);
 assert.match(fn,/startsWith\('transfer:'\)/);
 assert.match(fn,/expense\.source==='payment'/);
 assert.match(fn,/expense\.source==='payroll'/);
 assert.match(fn,/row\.type\|\|'—'/);
 assert.match(fn,/row\.content\|\|'—'/);
 assert.match(fn,/sourceKind\(row\)/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('read-only FOXCONN fetch failure names the failing stage without hidden retries',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 for(const stage of ['Tải Payment','Đếm chứng từ Firestore',
   'Đọc danh mục tab Google Sheets','Đọc giao dịch Google Sheets']){
   assert.ok(fn.includes(stage),stage);
 }
 assert.match(fn,/Bước: '\+readStage/);
 assert.match(fn,/Failed to fetch/);
 assert.match(fn,/Không tự thử lại, 0 writes/);
 assert.doesNotMatch(fn,/setDoc\(|addDoc\(|updateDoc\(|deleteDoc\(|writeBatch\(/);
});

test('shared Cash Control classification keeps non-payment rows out of required contract/IPC',()=>{
 const map=new Map([
   ['pay_1',{source:'payment'}],
   ['salary_1',{source:'payroll'}],
   ['inflow_1',{source:'manual',direction:'in',linkedModule:'inflow'}]
 ]);
 const classify=auditor.classifyCashSource;
 const transfer=classify({_syncIds:['transfer:abc:out'],type:'Hoàn vay'},map);
 assert.equal(transfer.kind,'transfer');
 assert.equal(transfer.needsContractIpc,false);
 const personnel=classify({_syncIds:['expense:salary_1'],type:'Chi phí nhân sự'},map);
 assert.equal(personnel.kind,'personnel');
 assert.equal(personnel.needsContractIpc,false);
 const tax=classify({_syncIds:['expense:x','expense:y'],_taxQuarter:'2026-Q3'},map);
 assert.equal(tax.kind,'tax-or-aggregate');
 assert.equal(tax.needsContractIpc,false);
 const receipt=classify({_syncIds:['expense:inflow_1'],ipc:'IPC06',income:10},map);
 assert.equal(receipt.kind,'receipt');
 assert.equal(receipt.needsContractIpc,false);
 const payment=classify({_syncIds:['expense:pay_1'],ipc:'IPC005'},map);
 assert.equal(payment.kind,'payment');
 assert.equal(payment.needsContractIpc,true);
 const unknown=classify({_syncIds:[],type:'Khác'},map);
 assert.equal(unknown.kind,'unverified');
 for(const output of [transfer,personnel,tax,receipt,payment,unknown])
   assert.equal(output.canWrite,false);
});
test('transaction matching hints do not override coarse collision counts or write data',()=>{
 const st=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',st);
 const fn=code.slice(st,end);
 assert.match(fn,/auditor\.classifyCashSource\(row,cashExpenseById\)\.rule/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('identity conflicts on personnel and tax are not wrongly labeled Payment HĐ/IPC errors',()=>{
 const rows=[
  {_syncIds:['expense:pay_a'],contractNo:'LAB-001',ipc:'IPC1'},
  {_syncIds:['expense:salary_a'],content:'Lương tháng 9',type:'Chi phí nhân sự'},
  {_syncIds:['expense:ins_a'],content:'Bảo hiểm',type:'Chi phí nhân sự'},
  {_syncIds:['expense:tax_a','expense:tax_b'],_taxQuarter:'2026-Q3'},
  {_syncIds:['expense:inflow_a'],income:100,ipc:'IPC06'},
  {_syncIds:['transfer:foxconn:out'],type:'Hoàn vay'}
 ];
 const records=new Map([
  ['pay_a',{source:'payment'}],
  ['salary_a',{source:'payroll'}],
  ['ins_a',{source:'payroll'}],
  ['inflow_a',{linkedModule:'inflow',direction:'in'}]
 ]);
 const groups=auditor.auditFoxconnIdentityGroups({
  identityConflictPositions:[1,2,3],
  identityUnverifiedPositions:[4,5],
  ambiguousSourcePositions:[1,6]
 },rows,records);
 assert.deepEqual(groups.paymentIdentityReview,[1]);
 assert.deepEqual(groups.nonPaymentCounterpartReview,[2,3,4,5]);
 assert.deepEqual(groups.ambiguousPayment,[1]);
 assert.deepEqual(groups.ambiguousOther,[6]);
 assert.equal(groups.identityReviewCount,1);
 assert.equal(groups.nonPaymentReviewCount,4);
 assert.equal(groups.canWrite,false);
});

test('FOXCONN collisions with distinct HĐ/IPC are one-to-one supported candidates, never writable',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const h=(contract,ipc)=>['2026-10-01','ACME',contract,'',ipc,'',0,0,100,0,0,0,0,0,100];
 const history=[header,h('SUPL-001','IPC005'),h('SUBP-020','IPC001'),h('SUBP-019','IPC001')];
 const r=(contract,ipc,id)=>({date:'2026-10-01',company:'ACME',contractNo:contract,ipc,
   _syncIds:['expense:'+id],income:0,subcontract:0,material:100,otherDirect:0,
   indirect:0,financial:0,otherPayable:0,importTaxVat:0});
 const source=[r('SUPL-001','IPC005','p1'),r('SUBP-020','IPC001','p2'),r('SUBP-019','IPC001','p3')];
 const records=new Map([['p1',{source:'payment'}],['p2',{source:'payment'}],['p3',{source:'payment'}]]);
 const collision={ambiguousSourcePositions:[1,2,3]};
 const x=auditor.resolvePaymentCollisionCandidates(history,source,collision,records);
 assert.equal(x.supportedCount,3);
 assert.deepEqual(x.supported.map(v=>v.sourcePosition),[1,2,3]);
 assert.deepEqual(x.supported.map(v=>v.googleRow),[2,3,4]);
 assert.equal(x.canWrite,false);
 assert.equal(x.candidateOnly,true);
 const duplicatedHistory=[...history,h('SUPL-001','IPC005')];
 const y=auditor.resolvePaymentCollisionCandidates(duplicatedHistory,source,collision,records);
 assert.equal(y.supportedCount,2);
 assert.deepEqual(y.unresolved,[1]);
 const duplicateSource=[...source,r('SUBP-019','IPC001','p4')];
 records.set('p4',{source:'payment'});
 const z=auditor.resolvePaymentCollisionCandidates(history,duplicateSource,
   {ambiguousSourcePositions:[1,2,3,4]},records);
 assert.equal(z.supportedCount,2);
 assert.deepEqual(z.unresolved,[3,4]);
});
test('FOXCONN flagged Payment cannot appear unique when unflagged source has identical ID',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const historic=[header,['2026-10-01','FOXCONN','SUPL-001','','IPC005','',0,0,100,0,0,0,0,0,100]];
 const make=id=>({date:'2026-10-01',contractNo:'SUPL-001',ipc:'IPC005',
   _syncIds:['expense:'+id],income:0,subcontract:0,material:100,otherDirect:0,
   indirect:0,financial:0,otherPayable:0,importTaxVat:0});
 const records=new Map([['one',{source:'payment'}],['two',{source:'payment'}]]);
 const result=auditor.resolvePaymentCollisionCandidates(historic,
   [make('one'),make('two')],{ambiguousSourcePositions:[1]},records);
 assert.equal(result.supportedCount,0);
 assert.deepEqual(result.unresolved,[1]);
 assert.equal(result.canWrite,false);
});

test('non-Payment and missing-identity source cannot be resolved as a Payment candidate',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const h=['2026-10-01','ACME','CONTRACT','','IPC1','',0,0,100,0,0,0,0,0,100];
 const basic={date:'2026-10-01',company:'ACME',contractNo:'CONTRACT',ipc:'IPC1',
   income:0,subcontract:0,material:100,otherDirect:0,indirect:0,financial:0,otherPayable:0,importTaxVat:0};
 const result=auditor.resolvePaymentCollisionCandidates([header,h],
   [{...basic,_syncIds:['transfer:1:out']},{...basic,ipc:'',_syncIds:['expense:p1']}],
   {ambiguousSourcePositions:[1,2]},new Map([['p1',{source:'payment'}]]));
 assert.equal(result.supportedCount,0);
 assert.equal(result.canWrite,false);
});

test('read-only FOXCONN matched Google row remains candidate-only',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/paymentCollisionResolution\.supported\.find/);
 assert.match(fn,/item\.sourcePosition===position/);
 assert.match(fn,/linkedCandidate\.googleRow/);
 assert.match(fn,/ứng viên, chưa xác minh ID/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('non-Payment identical date/amount requires one unique textual counterpart',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const history=[header,
  ['2026-10-15','ACME','','Lương Việt Nam · Tháng 09/2026','','Chi phí nhân sự',0,0,0,0,100,0,0,0,0],
  ['2026-10-17','ACME','','Bảo hiểm VN · Tháng 10/2026','','Chi phí nhân sự',0,0,0,0,200,0,0,0,0]
 ];
 const base=(date,content,amount,id)=>({date,content,type:'Chi phí nhân sự',
  _syncIds:['expense:'+id],income:0,subcontract:0,material:0,otherDirect:0,
  indirect:amount,financial:0,otherPayable:0,importTaxVat:0});
 const rows=[base('2026-10-15','Lương Việt Nam · Tháng 09/2026',100,'sal1'),
   base('2026-10-17','Bảo hiểm VN · Tháng 10/2026',200,'sal2')];
 const map=new Map([['sal1',{source:'payroll'}],['sal2',{source:'payroll'}]]);
 const matched={identityConflictPositions:[1,2]};
 const x=auditor.resolveFoxconnNonPaymentCandidates(history,rows,matched,map);
 assert.equal(x.supportedCount,2);
 assert.deepEqual(x.supported.map(i=>i.googleRow),[2,3]);
 assert.equal(x.canWrite,false);
 const mismatch=[...history];
 mismatch[1]=[...mismatch[1]];mismatch[1][3]='Different source description';
 const m=auditor.resolveFoxconnNonPaymentCandidates(mismatch,rows,matched,map);
 assert.equal(m.supportedCount,1);
 assert.deepEqual(m.unresolved,[1]);
 const duplicate=[...history,history[1]];
 const d=auditor.resolveFoxconnNonPaymentCandidates(duplicate,rows,matched,map);
 assert.equal(d.supportedCount,1);
 assert.deepEqual(d.unresolved,[1]);
});
test('non-Payment counterpart candidates never include transfers or Payment',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const history=[header,['2026-10-15','ACME','','Lương','','Chi phí nhân sự',0,0,0,0,100,0,0,0,0]];
 const row={date:'2026-10-15',content:'Lương',type:'Chi phí nhân sự',
   income:0,subcontract:0,material:0,otherDirect:0,indirect:100,financial:0,otherPayable:0,importTaxVat:0};
 const matched={identityUnverifiedPositions:[1]};
 const tx=auditor.resolveFoxconnNonPaymentCandidates(history,[{...row,_syncIds:['transfer:1:out']}],matched,new Map());
 assert.equal(tx.supportedCount,0);
 const pay=auditor.resolveFoxconnNonPaymentCandidates(history,[{...row,_syncIds:['expense:x']}],matched,new Map([['x',{source:'payment'}]]));
 assert.equal(pay.supportedCount,0);
 assert.equal(pay.canWrite,false);
});

test('known Payment origin wins over misleading payroll words in description',()=>{
 const result=auditor.classifyCashSource({
  _syncIds:['expense:p'],content:'Thanh toán hợp đồng lương vật tư',
  type:'Chi phí nhân sự',income:0
 },new Map([['p',{source:'payment',direction:'out'}]]));
 assert.equal(result.kind,'payment');
 assert.equal(result.needsContractIpc,true);
 assert.equal(result.canWrite,false);
});

test('unique numeric-only nonpayment counterpart exposes Google row but does not verify identity',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const history=[header,['2026-10-15','ACME','','越籍员工工资','','间接费',0,0,0,0,100,0,0,0,0]];
 const row={date:'2026-10-15',content:'Lương Việt Nam · Tháng 09/2026',type:'Chi phí nhân sự',
   _syncIds:['expense:salary'],income:0,subcontract:0,material:0,otherDirect:0,
   indirect:100,financial:0,otherPayable:0,importTaxVat:0};
 const records=new Map([['salary',{source:'payroll'}]]);
 const x=auditor.resolveFoxconnNonPaymentCandidates(history,[row],
   {identityConflictPositions:[1]},records);
 assert.equal(x.supportedCount,0);
 assert.equal(x.numericOnlyCount,1);
 assert.deepEqual(x.numericOnly.map(v=>v.googleRow),[2]);
 assert.equal(x.numericOnly[0].reason,'same-numbers-different-description');
 assert.equal(x.canWrite,false);
 const duplicated=auditor.resolveFoxconnNonPaymentCandidates([...history,history[1]],
   [row],{identityConflictPositions:[1]},records);
 assert.equal(duplicated.numericOnlyCount,0);
 assert.deepEqual(duplicated.unresolved,[1]);
});
test('Google numeric-only row is visibly labeled unverified and never writes',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/nonPaymentResolution\.numericOnly\.find/);
 assert.match(fn,/trùng số tiền, khác nội dung; CHƯA xác nhận/);
 assert.match(fn,/phi Payment cùng số liệu nhưng khác nội dung/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('missing FOXCONN transfers show signed potential balance impact only',()=>{
 const rows=[
  {date:'2026-10-26',_syncIds:['transfer:repay1:out'],income:-300,
   subcontract:0,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,importTaxVat:0},
  {date:'2026-11-09',_syncIds:['transfer:repay2:in'],income:500,
   subcontract:0,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,importTaxVat:0}
 ];
 const x=auditor.assessUnmatchedTransfers(rows,{sourceOnlyPositions:[1,2]});
 assert.equal(x.entries.length,2);
 assert.equal(x.net,200);
 assert.deepEqual(x.errors,[]);
 assert.equal(x.canWrite,false);
 assert.equal(x.readyToWrite,false);
 assert.equal(x.googleTransferVerified,false);
 const duplicate=auditor.assessUnmatchedTransfers(rows,{sourceOnlyPositions:[1,1]});
 assert.equal(duplicate.entries.length,1);
 assert.equal(duplicate.errors.length,1);
 const unsafe=auditor.assessUnmatchedTransfers(
   [{...rows[0],income:300}],{sourceOnlyPositions:[1]});
 assert.equal(unsafe.entries.length,0);
 assert.equal(unsafe.canWrite,false);
 assert.ok(unsafe.errors.includes('direction-mismatch:1'));
});
test('transfer impact is read-only and cannot authorize Google writes',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/auditor\.assessUnmatchedTransfers\(source,matched\)/);
 assert.match(fn,/ảnh hưởng số dư giả định/);
 assert.match(fn,/KHÔNG ghi; cần xác minh đối ứng và số dư/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('unmatched transfers confirm Cash Control two-sided source leg, not Google sync',()=>{
 const rows=[{date:'2026-10-26',_syncIds:['transfer:abc:out'],income:-300,importTaxVat:0},
   {date:'2026-11-09',_syncIds:['transfer:def:in'],income:500,importTaxVat:0}];
 const impact=auditor.assessUnmatchedTransfers(rows,{sourceOnlyPositions:[1,2]});
 const records=[
   {id:'abc',status:'paid',actualDate:'2026-10-26',actualAmount:300,fromProject:'FOXCONN',toProject:'ELYSIAN'},
   {id:'def',status:'paid',actualDate:'2026-11-09',actualAmount:500,fromProject:'SSIS',toProject:'FOXCONN'}];
 const result=auditor.verifyTransferSourceLegs('FOXCONN',impact,records);
 assert.equal(result.sourceLegVerifiedCount,2);
 assert.deepEqual(result.verified.map(v=>v.counterparty),['ELYSIAN','SSIS']);
 assert.equal(result.googleCounterpartVerified,false);
 assert.equal(result.canWrite,false);
 const bad=auditor.verifyTransferSourceLegs('FOXCONN',impact,
   [...records,{...records[0]}]);
 assert.equal(bad.sourceLegVerifiedCount,1);
 assert.deepEqual(bad.unverified,[1]);
 const swapped=auditor.verifyTransferSourceLegs('FOXCONN',impact,
   [{...records[0],fromProject:'ELYSIAN',toProject:'FOXCONN'},records[1]]);
 assert.deepEqual(swapped.unverified,[1]);
});
test('two-ledger transfer review is candidate-only even when both Google rows are unique',()=>{
 const verified={verified:[{position:16,sourceId:'transfer:abc:out',
   date:'2026-10-26',signedAmount:-300,fromProject:'FOXCONN',toProject:'ELYSIAN'}]};
 const row=(money)=>['2026-10-26','','','Hoàn vay','','',
   money>0?money:0,0,0,0,money<0?-money:0,0,0,0];
 const evidence={
   FOXCONN:{schemaVerified:true,taxColumnIndex:13,rows:[row(-300)]},
   ELYSIAN:{schemaVerified:true,rows:[row(300)]}
 };
 const ok=auditor.reviewTransferGoogleCounterparts(verified,evidence);
 assert.equal(ok.twoSidedCandidateCount,1);
 assert.equal(ok.reviews[0].status,'two-sided-candidate-only');
 assert.deepEqual(ok.reviews[0].primary.positions,[1]);
 assert.deepEqual(ok.reviews[0].counterpart.positions,[1]);
 assert.equal(ok.reviews[0].idVerified,false);
 assert.equal(ok.reviews[0].balancesVerified,false);
 assert.equal(ok.canWrite,false);
 assert.equal(ok.approvedWrites,0);
 const composite=auditor.reviewTransferGoogleCounterparts(verified,{
   ...evidence,FOXCONN:{...evidence.FOXCONN,
     rows:[['2026-10-26','','','','','',50,0,0,0,350,0,0,0]]}
 });
 assert.equal(composite.twoSidedCandidateCount,0);
 assert.equal(composite.canWrite,false);
 const missing=auditor.reviewTransferGoogleCounterparts(verified,{FOXCONN:evidence.FOXCONN});
 assert.equal(missing.reviews[0].counterpart.status,'not-loaded');
 assert.equal(missing.twoSidedCandidateCount,0);
 const noFoxconn=auditor.reviewTransferGoogleCounterparts(verified,{
   ...evidence,FOXCONN:{...evidence.FOXCONN,rows:[]}
 });
 assert.equal(noFoxconn.twoSidedCandidateCount,0);
 assert.equal(noFoxconn.counterpartOnlyCandidateCount,1);
 assert.equal(noFoxconn.reviews[0].status,'counterpart-only-candidate');
 assert.equal(noFoxconn.canWrite,false);
 const duplicated=auditor.reviewTransferGoogleCounterparts(verified,
   {...evidence,ELYSIAN:{...evidence.ELYSIAN,rows:[row(300),row(300)]}});
 assert.equal(duplicated.reviews[0].counterpart.status,'ambiguous');
 assert.equal(duplicated.canWrite,false);
 const invalid=auditor.reviewTransferGoogleCounterparts(verified,
   {...evidence,ELYSIAN:{...evidence.ELYSIAN,schemaVerified:false}});
 assert.equal(invalid.reviews[0].counterpart.status,'schema-unverified');
 assert.equal(invalid.twoSidedCandidateCount,0);
});
test('two-sided Google review reuses manually loaded project worksheets without network calls',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(code,/const ccTransferReviewSession=\{uid:null,google:Object\.create\(null\),foxconnLegs:null\}/);
 assert.match(fn,/ccTransferReviewSession\.google\[project\]=\{/);
 assert.match(fn,/ccTransferReviewSession\.foxconnLegs=transferSourceLegs/);
 assert.match(fn,/auditor\.reviewTransferGoogleCounterparts\(/);
 assert.match(fn,/twoSidedCandidateCount/);
 assert.match(fn,/CHƯA xác minh ID\/số dư, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});
test('source transfer leg validation remains read only and never confirms Sheets',()=>{
 const start=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',start);
 const fn=code.slice(start,end);
 assert.match(fn,/auditor\.verifyTransferSourceLegs\(project,unmatchedTransferImpact,allTransfers\(\)\)/);
 assert.match(fn,/CHƯA xác minh Google đối ứng/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('FOXCONN bilingual personnel, tax and receipt candidates stay read-only',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const details=[
  ['2026-10-15','2026年09月越籍员工工资','职工薪酬','Lương Việt Nam · Tháng 09/2026','Chi phí nhân sự',100,'personnel'],
  ['2026-10-17','2026年10月越南社保','职工薪酬','Bảo hiểm VN · Tháng 10/2026','Chi phí nhân sự',200,'personnel'],
  ['2026-10-17','2026年10月工会经费','职工薪酬','Phí công đoàn · Tháng 10/2026','Chi phí nhân sự',300,'personnel'],
  ['2026-10-20','2026年第3季度个人所得税','职工薪酬','Thuế TNCN · Quý 3/2026','Chi phí nhân sự',400,'tax'],
  ['2026-10-22','内部结算IPC06','业主收款','Thu tiền · IPC06','Tiền thu chủ đầu tư',500,'receipt']
 ];
 const history=[header],source=[];
 for(let i=0;i<details.length;i++){
  const [date,zh,zhType,vi,viType,value,kind]=details[i];
  history.push([date,'FOXCONN','',zh,kind==='receipt'?'IPC06':'',zhType,
    kind==='receipt'?value:0,0,0,0,kind==='receipt'?0:value,0,0,0,0]);
  source.push({date,content:vi,type:viType,ipc:kind==='receipt'?'IPC06':'',
    _syncIds:kind==='tax'?['tax:q3:1','tax:q3:2']:['expense:'+i],
    income:kind==='receipt'?value:0,subcontract:0,material:0,otherDirect:0,
    indirect:kind==='receipt'?0:value,financial:0,otherPayable:0,importTaxVat:0});
 }
 const records=new Map(source.map((x,i)=>[String(i),{
  source:i===4?'manual':'payroll',linkedModule:i===4?'inflow':'payroll',
  direction:i===4?'in':'out'}]));
 const report=auditor.resolveFoxconnNonPaymentCandidates(history,source,
  {identityConflictPositions:[1,2,3],identityUnverifiedPositions:[4,5]},records);
 assert.equal(report.semanticCandidateCount,5);
 assert.equal(report.numericOnlyCount,0);
 assert.deepEqual(report.semanticCandidates.map(x=>x.googleRow),[2,3,4,5,6]);
 assert.equal(report.canWrite,false);
 assert.equal(report.sourceComplete,false);
 const wrongPeriod=history.map(row=>[...row]);
 wrongPeriod[1][3]='2026年08月越籍员工工资';
 const wrong=auditor.resolveFoxconnNonPaymentCandidates(wrongPeriod,source,
  {identityConflictPositions:[1,2,3],identityUnverifiedPositions:[4,5]},records);
 assert.equal(wrong.semanticCandidateCount,4);
 assert.equal(wrong.numericOnlyCount,1);
});

test('FOXCONN non-Payment review ignores falsely unique flagged row when same source is unflagged',()=>{
 const header=[...Array(13).fill(''),'进口税+增值税','余额'];
 const history=[header,['2026-10-15','FOXCONN','','2026年09月越籍员工工资','','职工薪酬',0,0,0,0,100,0,0,0,100]];
 const row=id=>({date:'2026-10-15',content:'Lương Việt Nam · Tháng 09/2026',
   type:'Chi phí nhân sự',_syncIds:['expense:'+id],income:0,subcontract:0,
   material:0,otherDirect:0,indirect:100,financial:0,otherPayable:0,importTaxVat:0});
 const records=new Map([['p1',{source:'payroll'}],['p2',{source:'payroll'}]]);
 const result=auditor.resolveFoxconnNonPaymentCandidates(history,
   [row('p1'),row('p2')],{identityConflictPositions:[1]},records);
 assert.equal(result.supportedCount,0);
 assert.equal(result.semanticCandidateCount,0);
 assert.deepEqual(result.unresolved,[1]);
 assert.equal(result.canWrite,false);
});

test('generic project audit reports actual review positions without authorizing writes',()=>{
 const h=(day,n,contract,ipc)=>['2026-10-'+day,'ACME',contract,'',ipc,'',n,0,0,0,0,0,0];
 const s=(day,n,contract,ipc)=>({date:'2026-10-'+day,company:'ACME',
  contractNo:contract,ipc,income:n,subcontract:0,material:0,otherDirect:0,
  indirect:0,financial:0,otherPayable:0});
 const history=[h('01',100,'C1','IPC1'),h('02',200,'C2','IPC1'),
  h('03',300,'C3','IPC1'),h('03',300,'C3','IPC1'),h('04',400,'C4','IPC1')];
 const source=[s('01',100,'DIFFERENT','IPC1'),s('03',300,'C3','IPC1'),
  s('03',300,'C3','IPC1'),s('04',400,'C4',''),s('05',500,'C5','IPC1')];
 const x=auditor.compareLoadedCashControl(history,'ELYSIAN',source,{sourceComplete:false});
 assert.deepEqual(x.historyOnlyPositions,[2]);
 assert.deepEqual(x.sourceOnlyPositions,[5]);
 assert.deepEqual(x.ambiguousSourcePositions,[2,3]);
 assert.deepEqual(x.identityConflictPositions,[1]);
 assert.deepEqual(x.identityUnverifiedPositions,[4]);
 assert.equal(x.ambiguous,2);
 assert.equal(x.candidateOnly,true);
 assert.equal(x.canWrite,false);
 assert.equal(x.sourceComplete,false);
});
test('generic exception table reuses loaded Google and Cash Control arrays only',()=>{
 const begin=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',begin);
 const fn=code.slice(begin,end);
 assert.match(code,/id="ccSyncGenericExceptionPanel" hidden/);
 assert.match(code,/id="ccSyncGenericExceptionRows"/);
 assert.match(fn,/project!=='FOXCONN'&&genericPanel/);
 assert.match(fn,/matched\.sourceOnlyPositions/);
 assert.match(fn,/matched\.historyOnlyPositions/);
 assert.match(fn,/matched\.ambiguousSourcePositions/);
 assert.match(fn,/payload\.values\[position-1\]:source\[position-1\]/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});

test('shared dry-run blocks inserts for generic project, including unseen rows',()=>{
 const result=auditor.buildReadOnlySyncPlan('ELYSIAN',{
   sourceScope:4,historicalScope:3,matched:2,sourceOnlyPositions:[4],
   ambiguousSourcePositions:[2],identityConflictPositions:[3],
   sourceComplete:false,sourceOnly:1,historyOnly:0
 },[{},{},{},{}]);
 assert.deepEqual(result.newUnverifiedPositions,[4]);
 assert.deepEqual(result.ambiguousPositions,[2]);
 assert.deepEqual(result.identityConflictPositions,[3]);
 assert.equal(result.verifiedNewCount,0);
 assert.equal(result.approvedWrites,0);
 assert.equal(result.canWrite,false);
 assert.equal(result.incompleteSource,true);
});
test('shared dry-run preserves FOXCONN unresolved transfer positions without write approval',()=>{
 const result=auditor.buildReadOnlySyncPlan('FOXCONN',{
   sourceScope:20,historicalScope:18,candidates:18,
   sourceOnlyPositions:[16,20],ambiguousSourcePositions:[6,7,8],
   identityConflictPositions:[11,12,13],identityUnverifiedPositions:[14,15],
   sourceOnly:2,sourceComplete:false
 },Array.from({length:20},()=>({})));
 assert.deepEqual(result.newUnverifiedPositions,[16,20]);
 assert.equal(result.existingCandidates,18);
 assert.equal(result.canWrite,false);
 assert.equal(result.approvedWrites,0);
});
test('shared dry-run never promotes excess duplicate positions to new rows',()=>{
 const plan=auditor.buildReadOnlySyncPlan('SSIS',{
   sourceOnlyPositions:[2,3,3,99,-1],ambiguousSourcePositions:[3],
   sourceComplete:true
 },[{}, {}, {}]);
 assert.deepEqual(plan.newUnverifiedPositions,[2]);
 assert.deepEqual(plan.ambiguousPositions,[3]);
 assert.equal(plan.canWrite,false);
});
test('shared dry-run in manual Google compare makes no writes',()=>{
 const begin=code.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const end=code.indexOf('function ccSyncProjectCatalogRender()',begin);
 const fn=code.slice(begin,end);
 assert.match(fn,/auditor\.buildReadOnlySyncPlan\(project,matched,source\)/);
 assert.match(fn,/syncPlan\.verifiedNewCount/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ, 0 writes/);
 assert.doesNotMatch(fn,/(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\(/);
});
