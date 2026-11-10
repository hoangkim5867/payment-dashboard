'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const a=html.indexOf('async function ccSyncOneClickAudit(){');
const b=html.indexOf('function ccSyncRenderBatchOverview(){',a);
const fn=html.slice(a,b);
test('one-click audit reuses existing Google historical read and in-memory overview',()=>{
 assert.ok(a>0&&b>a);
 assert.match(fn,/await ccSyncProjectReadOnlyCheck\(true\)/);
 assert.match(fn,/ccSyncRenderBatchOverview\(\)/);
 assert.match(html,/ccSyncOneClickAudit'\)\?\.addEventListener\('click',ccSyncOneClickAudit\)/);
});
test('one-click audit requires Admin and Google consent, no background sync or writes',()=>{
 assert.match(fn,/isCashControlOwner\(\)/);
 assert.match(fn,/if\(!ccGoogleSyncToken\)/);
 assert.match(fn,/button\.disabled=true/);
 assert.match(fn,/finally\{button\.disabled=false\}/);
 assert.doesNotMatch(fn,/\b(getDocs|onSnapshot|setDoc|updateDoc|addDoc|deleteDoc|loadProjectPayments|fetch|ccGoogleSyncCommit|setInterval|setTimeout)\s*\(/);
});
test('one-click audit never reports historical consistency as write approval',()=>{
 assert.match(fn,/0 dự án được cấp quyền ghi/);
 assert.match(fn,/không ghi Google Sheets/);
 assert.match(fn,/const absent=catalog\.length-linked\.length/);
});
