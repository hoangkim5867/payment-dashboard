'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const filter=read('site/assets/js/archive-ipc-link-status.mjs');
const doc=read('site/assets/js/payment-doc-link-ui.mjs');
const archive=read('site/payment-archive.html');
const bulk=read('site/assets/js/archive-ipc-bulk-links.mjs');

test('Archive adds only one simple link filter and leaves UNC and search intact',()=>{
 assert.match(archive,/archive-ipc-link-status\.mjs/);
 assert.match(archive,/archive-ipc-bulk-links\.mjs/);
 assert.match(archive,/const uncAction=/);
 assert.match(archive,/applyCompanySearch/);
 assert.match(filter,/Chưa có hồ sơ/);
 assert.match(filter,/archive-ipc-missing-toggle/);
 assert.match(filter,/archive-ipc-only-missing/);
 assert.match(filter,/dataset\.projectParent/);
 assert.match(filter,/section\.dataset\.sectionGroup/);
});
test('No automatic queries, transactions, scheduled reads or new listeners',()=>{
 assert.doesNotMatch(filter,/getDocs\(|onSnapshot\(|runTransaction\(|setInterval\(|setTimeout\(/);
 assert.match(filter,/button\.addEventListener\("click",async\(\)=>/);
 assert.match(filter,/getDoc\(doc\(db,"payments",payment\.id\)\)/);
 assert.match(filter,/for\(let i=0;i<target\.length;i\+=12\)/);
 assert.match(filter,/const snapshots=new Map\(\)/);
 assert.match(filter,/if\(cache\.complete\)\{filter\(!onlyMissing\);refresh\(\);return;\}/);
});
test('Only Admin sees link statuses, missing unknown stays unknown and no links are exposed',()=>{
 assert.match(filter,/getAuth\(getApp\(\)\)\.currentUser\?\.uid===OWNER_UID/);
 assert.match(filter,/if\(!owner\(\)\|\|!month\|\|!table\|\|!heading\)/);
 assert.match(filter,/return \{id:payment\.id,state:"unavailable"\}/);
 assert.match(filter,/value==="yes"\?"📁 Đã có":value==="no"\?"📁 Chưa có"/);
 assert.doesNotMatch(filter,/localStorage|sessionStorage|ipcDocumentUrl\s*:/);
});
test('Manual and bulk confirmed link operations update status locally with no re-query',()=>{
 assert.match(filter,/payment-ipc-link-status-changed/);
 assert.match(doc,/window\.dispatchEvent\(new CustomEvent\("payment-ipc-link-status-changed"/);
 assert.match(bulk,/window\.dispatchEvent\(new CustomEvent\("payment-ipc-link-status-changed"/);
 assert.match(bulk,/if\(data\.ipcDocumentUrl\)return "existing"/);
});
