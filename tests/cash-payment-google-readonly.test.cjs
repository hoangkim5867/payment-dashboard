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
 const history=[['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,10,70]];
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
 const history=[['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,10,70]];
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
 const history=[['2026-10-01','ACME','C1','','IPC1','',100,20,0,0,0,0,0,0,80]];
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
