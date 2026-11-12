'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/cash-control.html'),'utf8');
const begin=html.indexOf('async function ccSyncCountOneProject(){');
const end=html.indexOf('function ccSyncProjectCatalogRender(){',begin);
const fn=html.slice(begin,end);
test('preflight is one-project-only, Admin-only, confirmed, and uses aggregate count',()=>{
 assert.ok(begin>0&&end>begin);
 assert.match(fn,/!isCashControlOwner\(\)/);
 assert.match(fn,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(fn,/ccSyncProjectCatalogNames\(\)\.includes\(project\)/);
 assert.match(fn,/if\(!confirm\(/);
 assert.match(fn,/await getCountFromServer\(query\(paymentsRef,where\('project','==',project\)\)\)/);
 assert.match(fn,/finally\{button\.disabled=false\}/);
});
test('preflight never reads documents, exports contents or writes backend',()=>{
 assert.doesNotMatch(fn,/\b(getDocs|getDoc|setDoc|updateDoc|addDoc|deleteDoc|writeBatch|onSnapshot|fetch|renderAll|scheduleProjectBalanceSnapshot)\s*\(/);
 assert.doesNotMatch(fn,/\b(setInterval|setTimeout)\s*\(/);
 assert.match(fn,/Không tự thử lại/);
 assert.match(fn,/KHÔNG cho phép đồng bộ/);
});
test('preflight UI is hidden for non-owner and never uses production from staging',()=>{
 assert.match(html,/id="ccSyncPaymentPreflight"[^>]+hidden/);
 const render=html.slice(html.indexOf('function ccSyncProjectCatalogRender(){'),
  html.indexOf('function ccSyncProjectCatalogSaveDraft(',html.indexOf('function ccSyncProjectCatalogRender(){'))>0?
  html.indexOf('function ccSyncProjectCatalogSaveDraft(',html.indexOf('function ccSyncProjectCatalogRender(){')):undefined);
 assert.match(render,/preflight\.hidden=!allowed/);
 assert.match(render,/preflight\.style\.display=allowed\?'flex':'none'/);
 assert.match(html,/id="ccSyncPaymentPreflight" style="display:none/);
 assert.match(render,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(html,/ccSyncPaymentPreflightCount'\)\?\.addEventListener\('click',ccSyncCountOneProject\)/);
});

test('cross-preview link recovery is local JSON only and never auto-fetches Google',()=>{
 const renderStart=html.indexOf('function ccSyncProjectCatalogRender(){');
 const renderEnd=html.indexOf('// Explicit Admin-only local inventory.',renderStart);
 const render=html.slice(renderStart,renderEnd);
 assert.match(render,/linkedCount===0/);
 assert.match(render,/Xuất danh sách \/ link \(JSON\)/);
 assert.match(render,/Nhập lại danh sách đã xuất/);
 assert.match(render,/trình duyệt không tự chuyển dữ liệu giữa các tên miền/);
 assert.doesNotMatch(render,/\b(?:getDocs|getCountFromServer|fetch|setDoc|updateDoc|addDoc)\s*\(/);
});

test('catalog status distinguishes matched links from out-of-catalog drafts without dropping either',()=>{
 const begin=html.indexOf('function ccSyncProjectCatalogRender(){');
 const end=html.indexOf('// Explicit Admin-only local inventory.',begin);
 const render=html.slice(begin,end);
 assert.match(render,/linkedNames\.filter\(p=>!catalog\.includes\(p\)\)/);
 assert.match(render,/linkedCount-outsideCatalog\.length/);
 assert.match(render,/outsideCatalog\.join\(', '\)/);
 assert.doesNotMatch(render.slice(render.indexOf('const linkedNames=')),/delete ccSyncProjectLinkDraft/);
});
