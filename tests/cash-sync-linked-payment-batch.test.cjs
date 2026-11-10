'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const start=html.indexOf('async function ccSyncLoadLinkedPaymentBatch(){');
const end=html.indexOf('function ccSyncSetLinkedBatchVisibility(){',start);
const fn=html.slice(start,end);
test('production Payment load is hidden in isolated staging and requires owner',()=>{
 assert.ok(start>0&&end>start);
 assert.match(fn,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(fn,/!isCashControlOwner\(\)/);
 assert.match(html,/button\.hidden=firebaseConfig\.projectId!=='cscecmep-payment'/);
});
test('bounded explicit read with no automatic retries or write actions',()=>{
 assert.match(fn,/eligible\.slice\(0,3\)/);
 assert.match(fn,/if\(!confirm\(/);
 assert.match(fn,/await loadProjectPayments\(project/);
 assert.match(fn,/refresh:false/);
 assert.match(fn,/if\(!ok\|\|!paymentMonths\.has\(project\)\)/);
 assert.match(fn,/failed\+\+;/);
 assert.match(fn,/break;/);
 assert.doesNotMatch(fn,/\b(setDoc|updateDoc|addDoc|deleteDoc|persistCashCloud|scheduleProjectBalanceSnapshot|renderAll)\s*\(/);
 assert.doesNotMatch(fn,/\bsetTimeout\s*\(/);
});
test('already loaded project is skipped and no recurring scans',()=>{
 assert.match(fn,/!paymentMonths\.has\(project\)/);
 assert.doesNotMatch(fn,/setInterval|onSnapshot|window\.location\.reload/);
 assert.match(fn,/button\.disabled=true/);
 assert.match(fn,/finally\{button\.disabled=false\}/);
});
