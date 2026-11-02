'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..');
const file=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const index=file('site/assets/js/archive-ipc-link-index.mjs');
const archive=file('site/payment-archive.html');
const pay=file('site/payment.html');
const links=file('site/assets/js/payment-doc-link-ui.mjs');
const bulk=file('site/assets/js/archive-ipc-bulk-links.mjs');
test('Staff dossier status comes from already fetched archive snapshot, not extra per-payment queries',()=>{
 assert.match(archive,/__archiveDossierView=/);
 assert.match(archive,/currentDetails\.ipcDocumentLinks/);
 assert.match(archive,/archive-ipc-link-index\.mjs/);
 assert.doesNotMatch(archive,/<script type="module" src="\.\/assets\/js\/archive-ipc-link-status\.mjs"/);
 assert.match(index,/const links=active\.links\|\|\{\}/);
 assert.match(index,/if\(!active\.admin\)/);
 assert.match(index,/a\.target="_blank"/);
 assert.match(index,/cell\.textContent="—"/);
 assert.match(index,/\.payment-doc-archive-btn/);
 assert.doesNotMatch(index,/getDocs\(|onSnapshot\(|setInterval\(/);
});
test('Legacy Archive without backfill never falsely calls unknown links missing',()=>{
 assert.match(index,/const known=complete&&!unknown\.has\(id\)/);
 assert.match(index,/const state=url\?"yes":known\?"no":"unknown"/);
 assert.match(index,/Unmigrated historical months remain "unknown"/);
});
test('Backfill is Admin-only click, capped reads, validates actual payment ID and does not write money or UNC',()=>{
 assert.match(index,/getAuth\(getApp\(\)\)\.currentUser\?\.uid===OWNER_UID/);
 assert.match(index,/button\.addEventListener\("click",syncHistory\)/);
 assert.match(index,/const budget=1200/);
 assert.match(index,/readCount\+rows\.length>budget/);
 assert.match(index,/getDoc\(doc\(db,"payments",id\)\)/);
 assert.match(index,/norm\(data\.contractNo\)!==norm\(row\.contractNo\)/);
 assert.match(index,/ipcDocumentLinksComplete:true/);
 assert.doesNotMatch(index,/deleteDoc\(|writeBatch\(/);
});
test('Future closed months embed links from already loaded payments',()=>{
 assert.match(pay,/const ipcDocumentLinks=Object\.create\(null\)/);
 assert.match(pay,/ipcDocumentLinksUnresolvedIds:\[\],ipcDocumentLinksComplete:true/);
 assert.match(pay,/ipcDocumentLinksComplete:true,\s*updatedAt:serverTimestamp\(\)/);
});
test('Confirmed Admin manual and bulk link saves update Archive index, never extra reads',()=>{
 assert.match(links,/new FieldPath\("ipcDocumentLinks",activeId\),url/);
 assert.match(links,/new FieldPath\("ipcDocumentLinks",activeId\),deleteField\(\)/);
 assert.match(bulk,/savedLinks\.push\(\[p\.data\.id,pdfUrl\]\)/);
 assert.match(bulk,/new FieldPath\("ipcDocumentLinks",id\),url/);
 assert.match(bulk,/__archiveDossierUpdateLocal/);
 assert.match(archive,/sessionDetailCache\.set\(String\(month\),currentDetails\)/);
});
