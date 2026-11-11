'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/cash-control.html'),'utf8');
const start=html.indexOf('function ccSyncProjectBatchLocalReport(){');
const end=html.indexOf('async function ccSyncProjectBatchGoogleMetadata(){',start);
const fn=html.slice(start,end);
test('all-project local summary is Admin-only and manually triggered',()=>{
 assert.ok(start>0&&end>start);
 assert.match(fn,/!currentAuthUser\|\|!isCashControlOwner\(\)/);
 assert.match(html,/ccSyncProjectBatchLocalReport'\)\?\.addEventListener\('click',ccSyncProjectBatchLocalReport\)/);
 assert.match(fn,/ccSyncProjectCatalogNames\(\)/);
 assert.match(fn,/output\.hidden=false/);
});
test('local summary includes linked, unlinked and stale catalog entries, without cloud access',()=>{
 assert.match(fn,/const linked=catalog\.filter/);
 assert.match(fn,/const unlinked=catalog\.filter/);
 assert.match(fn,/const stale=Object\.keys/);
 assert.match(fn,/0 Firestore reads \/ 0 Google reads \/ 0 writes/);
 assert.match(fn,/KHÔNG xác minh quyền truy cập Google, lịch sử, số dư/);
 assert.doesNotMatch(fn,/\b(?:fetch|getDocs|getDoc|getCountFromServer|onSnapshot|setDoc|updateDoc|addDoc|deleteDoc|writeBatch|ccGoogleSyncCommit)\s*\(/);
});
test('local inventory never assumes 35 projects or renders untrusted strings as HTML',()=>{
 assert.doesNotMatch(fn,/\b35\b/);
 assert.doesNotMatch(fn,/innerHTML|insertAdjacentHTML/);
 assert.match(fn,/textContent=/);
 assert.match(fn,/PHU HUNG được bảo vệ riêng/);
});
