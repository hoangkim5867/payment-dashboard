'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
test('one-project Payment loader is visible only in Admin-gated catalog',()=>{
  assert.match(html,/id="ccGoogleSyncProjectLinkCatalog" hidden/);
  assert.match(html,/id="ccSyncPaymentPreflightLoad"/);
  assert.match(html,/projectLinkCatalog\.hidden=!\(currentAuthUser&&isCashControlOwner\(\)\)/);
  assert.match(html,/ccSyncProjectCatalogRender\(\);\s*\/\/ Render once after auth/);
});
test('manual Payment preflight requires Admin, production, confirmation and one project',()=>{
  const start=html.indexOf('async function ccSyncLoadOneProjectReadOnly(){');
  const end=html.indexOf('function ccSyncProjectCatalogRender(){',start);
  assert.ok(start>0&&end>start);
  const code=html.slice(start,end);
  assert.match(code,/!currentAuthUser\|\|!isCashControlOwner\(\)/);
  assert.match(code,/firebaseConfig\.projectId!=='cscecmep-payment'/);
  assert.match(code,/ccSyncProjectCatalogNames\(\)\.includes\(project\)/);
  assert.match(code,/confirm\(/);
  assert.match(code,/loadProjectPayments\(project,\{quiet:true,refresh:false\}\)/);
  assert.match(code,/paymentMonths\.has\(project\)/);
  assert.doesNotMatch(code,/getDocs\(|onSnapshot\(|setDoc\(|addDoc\(|updateDoc\(|deleteDoc\(|writeBatch\(|ccGoogleSyncOriginalRequest\(/);
  assert.match(code,/KHÔNG cấp phép đồng bộ, 0 writes/);
});
test('read-only handler wired once; no changes to existing project loader',()=>{
  assert.match(html,/ccSyncPaymentPreflightLoad'\)\?\.addEventListener\('click',ccSyncLoadOneProjectReadOnly\)/);
  assert.match(html,/where\('project','==',project\)/);
});

test('manual one-project COUNT reconciles existing cache, aliases and server count without fetching Payment documents',()=>{
 const st=html.indexOf('async function ccSyncCountOneProject(){');
 const end=html.indexOf('async function ccSyncLoadOneProjectReadOnly(){',st);
 const code=html.slice(st,end);
 assert.ok(st>0&&end>st);
 assert.match(code,/getCountFromServer\(query\(paymentsRef,where\('project','==',project\)\)\)/);
 assert.match(code,/assessProjectSourceCoverage\(/);
 assert.match(code,/paymentMonths\.has\(project\)/);
 assert.match(code,/paymentMonths\.get\(project\)/);
 assert.match(code,/projectFromMisfiledContractCode\(raw\)===project/);
 assert.match(code,/evidence\.state==='CANONICAL_COUNT_MATCH_ONLY'/);
 assert.match(code,/CHƯA cấp phép đồng bộ/);
 assert.doesNotMatch(code,/getDocs\(|onSnapshot\(|setDoc\(|writeBatch\(|fetch\(|localStorage\.|sessionStorage\./);
 assert.match(html,/import \{assessProjectSourceCoverage\} from "\.\/assets\/js\/cash-sync-project-source-coverage\.mjs"/);
});
