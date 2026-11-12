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
 assert.match(fn,/loadProjectPayments\(project,\{quiet:true,refresh:false\}\)/);
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
