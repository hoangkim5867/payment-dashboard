'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/cash-control.html'),'utf8');
const start=html.indexOf('async function ccSyncProjectBatchGoogleMetadata(){');
const end=html.indexOf('function ccSyncProjectCatalogInitialize(){',start);
const fn=html.slice(start,end);
test('metadata inspection is manual, bounded, Admin-only and requires Google connection',()=>{
 assert.ok(start>0&&end>start);
 assert.match(fn,/!currentAuthUser\|\|!isCashControlOwner\(\)/);
 assert.match(fn,/!ccGoogleSyncToken/);
 assert.match(fn,/projects\.length>40/);
 assert.match(fn,/if\(!confirm\(/);
 assert.match(html,/ccSyncProjectBatchGoogleMetadata'\)\?\.addEventListener\('click',ccSyncProjectBatchGoogleMetadata\)/);
});
test('only Google metadata is read, never transaction values or Firebase',()=>{
 assert.match(fn,/sheets\.googleapis\.com\/v4\/spreadsheets/);
 assert.match(fn,/fields=spreadsheetId,sheets\(properties\(sheetId,title,hidden\)\)/);
 assert.match(fn,/method:'GET'/);
 assert.doesNotMatch(fn,/\b(?:getDocs|getDoc|getCountFromServer|setDoc|updateDoc|addDoc|writeBatch|onSnapshot|ccGoogleSyncCommit)\s*\(/);
 assert.doesNotMatch(fn,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.match(fn,/p!=='PHU HUNG'/);
 assert.match(fn,/0 Firestore reads, 0 writes/);
});
test('metadata report does not claim ledger or balance approval',()=>{
 assert.match(fn,/Chưa xác minh lịch sử\/số dư/);
 assert.match(fn,/GID không tồn tại trong file/);
 assert.match(fn,/button\.disabled=true/);
 assert.match(fn,/finally\{button\.disabled=false\}/);
 assert.doesNotMatch(fn,/innerHTML|insertAdjacentHTML/);
});
