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
 assert.match(fn,/if\(!ok\|\|!paymentMonths\.has\(project\)\|\|!receipt/);
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

test('Admin explicitly loaded proof is required before showing Payment coverage',()=>{
 const begin=html.indexOf('function ccSyncCompareAlreadyLoadedProjects(){');
 const end=html.indexOf('// One Admin click:',begin);
 const body=html.slice(begin,end);
 assert.match(html,/const ccSyncExplicitPaymentLoaded=new Set\(\)/);
 assert.match(fn,/ccSyncExplicitPaymentLoaded\.add\(project\)/);
 assert.match(body,/ccSyncExplicitPaymentLoaded\.has\(project\)/);
 assert.match(body,/CashSyncPaymentCoverage\.checkBoundedBatch\(/);
 assert.match(body,/paymentProof\.paymentSnapshotVerified/);
 assert.match(body,/Payment theo ID/);
 assert.doesNotMatch(body,/\b(?:getDocs|onSnapshot|loadProjectPayments|fetch|setDoc|updateDoc|addDoc|deleteDoc)\s*\(/);
 assert.match(body,/sourceComplete:false/);
});

test('Admin cross-checks raw paid VND and expense bucket without extra Firestore reads',()=>{
 const start=html.indexOf('function ccSyncCompareAlreadyLoadedProjects(){');
 const end=html.indexOf('// One Admin click:',start);
 const body=html.slice(start,end);
 assert.match(body,/CashSyncPaymentCoverage\.checkMoney\(/);
 assert.match(body,/excelProjectCostBucket\(normalizePayment\(p\)\)/);
 assert.match(body,/moneyProof\.moneyAndBucketVerified/);
 assert.match(body,/moneyProof\.amountMismatches/);
 assert.match(body,/Tiền thực trả hoặc cột chi phí chưa khớp/);
 assert.match(body,/sourceComplete:false/);
 assert.doesNotMatch(body,/\b(?:getDocs|onSnapshot|loadProjectPayments|fetch|setDoc|updateDoc|addDoc|deleteDoc)\s*\(/);
});

test('query receipt requires actual Firebase response, rejects cached-only success',()=>{
 const loadStart=html.indexOf('async function loadProjectPayments(');
 const loadEnd=html.indexOf('function stopPaymentsRealtime()',loadStart);
 const loader=html.slice(loadStart,loadEnd);
 assert.match(loader,/onAudit=null/);
 assert.match(loader,/if\(typeof onAudit==='function'\)onAudit\(/);
 assert.match(loader,/returned:snaps\.reduce/);
 const batch=html.slice(start,end);
 assert.match(batch,/let errorText='',receipt=null/);
 assert.match(batch,/onAudit:info=>\{receipt=info\}/);
 assert.match(batch,/!receipt/);
 assert.match(batch,/receipt\.retained!==paymentMonths\.get\(project\)\.length/);
 assert.match(batch,/ccSyncPaymentQueryReceipts\.set\(project,receipt\)/);
 assert.doesNotMatch(batch,/\b(?:getDocs|onSnapshot|setDoc|updateDoc|addDoc|deleteDoc)\s*\(/);
});
test('cached Payment without query receipt stays blocked without a refresh',()=>{
 const begin=html.indexOf('function ccSyncCompareAlreadyLoadedProjects(){');
 const stop=html.indexOf('// One Admin click:',begin);
 const compare=html.slice(begin,stop);
 assert.match(html,/const ccSyncPaymentQueryReceipts=new Map\(\)/);
 assert.match(compare,/ccSyncPaymentQueryReceipts\.get\(project\)/);
 assert.match(compare,/receipt\.retained===paymentMonths\.get\(project\)\.length/);
 assert.match(fn,/Không tự tải lại để tránh reads/);
 assert.match(compare,/biên nhận query hợp lệ/);
 assert.match(compare,/sourceComplete:false/);
});

test('cached Payment contents must match receipt, not merely the same row count',()=>{
 const loader=html.slice(html.indexOf('function ccSyncPaymentRowsStamp(rows){'),
  html.indexOf('function stopPaymentsRealtime()'));
 const begin=html.indexOf('function ccSyncCompareAlreadyLoadedProjects(){');
 const end=html.indexOf('// One Admin click:',begin);
 const compare=html.slice(begin,end);
 assert.match(loader,/JSON\.stringify\(\[\.\.\.rows\]\.sort/);
 assert.match(loader,/snapshotStamp:ccSyncPaymentRowsStamp\(rows\)/);
 assert.match(fn,/receipt\.snapshotStamp!==ccSyncPaymentRowsStamp\(paymentMonths\.get\(project\)\)/);
 assert.match(compare,/receipt\.snapshotStamp===ccSyncPaymentRowsStamp\(paymentMonths\.get\(project\)\)/);
 assert.doesNotMatch(compare,/\b(?:getDocs|fetch|onSnapshot|setDoc|updateDoc|addDoc|deleteDoc)\s*\(/);
});
