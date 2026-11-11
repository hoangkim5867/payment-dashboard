'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/cash-control.html'),'utf8');
const begin=html.indexOf('async function ccSyncInspectOneProject(){');
const end=html.indexOf('function ccSyncProjectCatalogRender(){',begin);
const fn=html.slice(begin,end);
test('detail audit requires Admin, production, prior count and separate confirmation',()=>{
  assert.ok(begin>0&&end>begin);
  assert.match(fn,/!isCashControlOwner\(\)/);
  assert.match(fn,/firebaseConfig\.projectId!=='cscecmep-payment'/);
  assert.match(fn,/ccSyncCountedProjectTotals\.get\(project\)/);
  assert.match(fn,/ccSyncProjectCatalogNames\(\)\.includes\(project\)/);
  assert.match(fn,/if\(!confirm\(/);
  assert.match(html,/ccSyncPaymentInspectOne'\)\?\.addEventListener\('click',ccSyncInspectOneProject\)/);
});
test('detail audit reads only one project with a strict bounded query, never writes or automatically retries',()=>{
  assert.match(fn,/getDocs\(query\(paymentsRef,where\('project','==',project\),\s*limit\(CC_SYNC_INSPECT_MAX_DOCS\+1\)\)\)/);
  assert.match(fn,/snap\.size!==expectedCount\|\|snap\.size>CC_SYNC_INSPECT_MAX_DOCS/);
  assert.match(html,/const CC_SYNC_INSPECT_MAX_DOCS=150/);
  assert.doesNotMatch(fn,/\b(?:setDoc|updateDoc|addDoc|writeBatch|onSnapshot|setInterval|setTimeout|loadProjectPayments|renderAll|fetch)\s*\(/);
  assert.match(fn,/KHÔNG cho phép đồng bộ/);
});
test('detail audit classifies paid, unpaid, deleted and suspicious paid fields',()=>{
  assert.match(fn,/p\.deleted===true/);
  assert.match(fn,/processPaymentDate/);
  assert.match(fn,/processActualAmount/);
  assert.match(fn,/invalidPaidDates/);
  assert.match(fn,/invalidPaidAmounts/);
  assert.match(fn,/CHƯA so với Cash Control\/Google Sheets/);
});
