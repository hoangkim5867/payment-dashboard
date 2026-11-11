'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/cash-control.html'),'utf8');
const start=html.indexOf('async function ccSyncProjectBatchHistoricalAudit(){');
const end=html.indexOf('function ccSyncProjectCatalogInitialize(){',start);
const fn=html.slice(start,end);
test('historical batch audit is explicit, bounded, Admin-only and Google token gated',()=>{
 assert.ok(start>0&&end>start);
 assert.match(fn,/!currentAuthUser\|\|!isCashControlOwner\(\)/);
 assert.match(fn,/!ccGoogleSyncToken/);
 assert.match(fn,/projects\.length>40/);
 assert.match(fn,/if\(!confirm\(/);
 assert.match(fn,/p!=='PHU HUNG'/);
 assert.match(html,/ccSyncProjectBatchHistoricalAudit'\)\?\.addEventListener\('click',ccSyncProjectBatchHistoricalAudit\)/);
});
test('historical report reads Google only, never Firebase, writes or approves syncing',()=>{
 assert.match(fn,/sheets\.googleapis\.com\/v4\/spreadsheets/);
 assert.match(fn,/valueRenderOption=UNFORMATTED_VALUE/);
 assert.match(fn,/auditor\.audit\(values\.values,\{project\}\)/);
 assert.match(fn,/20\.000 hàng/);
 assert.match(fn,/0 dự án được phê duyệt đồng bộ/);
 assert.doesNotMatch(fn,/\b(?:getDocs|getDoc|getCountFromServer|setDoc|updateDoc|addDoc|deleteDoc|writeBatch|onSnapshot)\s*\(/);
 assert.doesNotMatch(fn,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
 assert.doesNotMatch(fn,/localStorage|sessionStorage|innerHTML/);
});
test('historical checker requires known tab and reports incomplete audits separately',()=>{
 assert.match(fn,/Cần chọn tab lịch sử \(gid\) rõ ràng/);
 assert.match(fn,/CHƯA KIỂM TRA ĐƯỢC/);
 assert.match(fn,/report\.continuityErrors/);
 assert.match(fn,/report\.roundingDifferences/);
 assert.match(fn,/report\.nonMonotonicDates/);
 assert.match(fn,/finally\{button\.disabled=false\}/);
});

test('historical self-match requires no suspicious skipped dates or shifted date column',()=>{
 assert.match(fn,/auditor\.dateLayoutDiagnostic\(values\.values\)/);
 assert.match(fn,/layout\.suspectCount/);
 assert.match(fn,/layout\.validDatesByColumn\.slice\(1\)\.some\(n=>n>0\)/);
 assert.match(fn,/dateSuspects===0&&!otherDateColumn&&report\.transactionRows>0/);
 assert.match(fn,/KHÔNG cấp phép đồng bộ/);
});

test('cached Cash Control candidates only use already loaded project Payments',()=>{
 assert.match(fn,/if\(paymentMonths\.has\(project\)\)/);
 assert.match(fn,/legacyCashExportRows\(month,project\)/);
 assert.match(fn,/auditor\.compareLoadedCashControl\(values\.values,project,cachedRows/);
 assert.match(fn,/sourceComplete:false/);
 assert.match(fn,/Chưa chứng nhận đủ nguồn/);
 assert.match(fn,/chưa tải đầy đủ Payment dự án trong phiên/);
 assert.match(fn,/month>='2026-10'/);
 assert.doesNotMatch(fn,/\b(?:getDocs|getDoc|getCountFromServer|loadProjectPayments|setDoc|updateDoc|addDoc|deleteDoc|onSnapshot)\s*\(/);
});
