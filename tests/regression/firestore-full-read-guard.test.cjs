'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../site',name),'utf8');
test('full-history scans remain confined to deliberate duplicate/MEP validation',()=>{
 for(const page of ['payment.html','payment-mobile-renderer.html']){
  const s=read(page);
  assert.equal((s.match(/await\s+getDocs\(\s*paymentsRef\s*\)/g)||[]).length,1,page);
  assert.match(s,/async function ensureImportDuplicateHistory\(\)/);
  assert.match(s,/activePaymentsScopeKey === nextScopeKey/);
 }
 const s=read('contract-master.html');
 assert.equal((s.match(/:\s*paymentsRef\s*\)/g)||[]).length,1);
 assert.match(s,/mepIndexV1Ready\(\)/);
 for(const name of ['cash-control.html','plan-review.html'])
  assert.doesNotMatch(read(name).replace(/\/\/[^\n]*/g,''),/getDocs\(\s*paymentsRef\s*\)/);
});
test('opt-in tracer groups real caller and excludes entire changed listener views from cumulative returned documents',()=>{
 const s=read('assets/js/firestore-payment.mjs'), t=read('assets/js/firestore-read-trace.mjs');
 assert.match(s,/row\.operation!=='listen-change'/);
 assert.match(s,/caller:event\.caller/);
 assert.match(t,/function callerLocation\(\)/);
 assert.match(t,/added,modified,removed/);
 assert.doesNotMatch(t,/localStorage|sessionStorage|sendBeacon|fetch\(/);
});
