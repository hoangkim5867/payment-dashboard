'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const start=html.indexOf('function ccSyncCompareAlreadyLoadedProjects(){');
const end=html.indexOf('function ccSyncRenderBatchOverview(){',start);
const body=html.slice(start,end);
test('batch comparison never authorizes completeness from a Payment project cache',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(body,/sourceComplete:false/);
 assert.doesNotMatch(body,/sourceComplete:true/);
 assert.match(body,/sourceCompletenessVerified|chưa chứng minh đủ nguồn/);
});
test('batch comparison has no Firestore reads, Google fetches or write operations',()=>{
 assert.doesNotMatch(body,/\b(getDocs|onSnapshot|fetch|ccGoogleSyncApi|addDoc|setDoc|updateDoc|deleteDoc)\s*\(/);
 assert.match(body,/paymentMonths\.has\(project\)/);
});
test('Google history cache requires current in-session audit and keeps its status',()=>{
 const marker='ccSyncInMemoryHistory.set(project,{link,rows,auditStatus:result.status})';
 const idx=html.indexOf(marker);
 assert.ok(idx>0);
 assert.ok(html.lastIndexOf('CashSyncHistoricalAudit.audit(rows',idx)>-1);
 assert.match(body,/cache\.auditStatus/);
});
