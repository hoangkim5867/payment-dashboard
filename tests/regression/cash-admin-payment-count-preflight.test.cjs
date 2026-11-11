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
