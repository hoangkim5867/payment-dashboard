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
 assert.match(fn,/\['Vấn đề','Vị trí','Ngày','Nguồn','Loại','Nội dung','Hợp đồng','IPC','Đối ứng Google \(ứng viên\)','Quy tắc đối chiếu'\]/);
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
