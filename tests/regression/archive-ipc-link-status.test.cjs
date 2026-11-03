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
 assert.match(index,/return \{url,state:url\?"yes":complete&&!unknown\.has\(id\)\?"no":"unknown"\}/);
 assert.match(index,/b\.textContent=labels\.check\|\|"🔎 Kiểm tra"/);
 assert.match(index,/const label=url\?\(labels\.has\|\|"📁 Đã có"\)/);
 assert.match(archive,/return \{state:"unknown",url:""\}/);
});
test('Backfill is Admin-only click, capped reads, validates actual payment ID and does not write money or UNC',()=>{
 assert.match(index,/getAuth\(getApp\(\)\)\.currentUser\?\.uid===OWNER_UID/);
 assert.match(index,/button\.addEventListener\("click",syncHistory\)/);
 assert.match(index,/const budget=1200/);
 assert.match(index,/readCount\+rows\.length>budget/);
 assert.match(index,/getDoc\(doc\(db,"payments",id\)\)/);
 assert.match(index,/norm\(data\?\.contractNo\)!==norm\(row\?\.contractNo\)/);
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
 assert.match(bulk,/savedLinks\.push\(\[p\.data\.id,outcome\.url\]\)/);
 assert.match(bulk,/new FieldPath\("ipcDocumentLinks",p\.data\.id\),pdfUrl/);
 assert.match(bulk,/__archiveDossierUpdateLocal/);
 assert.match(archive,/sessionDetailCache\.set\(String\(month\),currentDetails\)/);
});

test('One-time all-month scan reads only Archive detail snapshots on explicit Admin click',()=>{
 assert.match(archive,/__archivePaidIpcAllPreview=/);
 assert.match(archive,/__archivePaidIpcAllRows=async onProgress/);
 assert.match(archive,/sessionDetailCache\.get\(month\)/);
 assert.match(archive,/getDoc\(doc\(db,"paymentArchiveDetails",month\)\)/);
 assert.match(archive,/if\(months\.length>60\)/);
 assert.match(archive,/if\(all\.length>6000\)/);
 assert.match(archive,/paidIpcRowsFromDetails\(details,month,true\)/);
 assert.match(archive,/!skipIndexed/);
 assert.match(archive,/duplicates\.add\(row\.id\)/);
 assert.match(bulk,/allButton\.addEventListener\("click",openAllMonths\)/);
 assert.match(bulk,/window\.__archivePaidIpcAllRows\?\.\(/);
 assert.doesNotMatch(bulk,/getDocs\s*\(|onSnapshot\s*\(|collection\s*\(/);
});
test('One full Drive scan can propose across months; confirmed saves are limited to 40 and validate live paid payment',()=>{
 assert.match(bulk,/const reused=lastScan&&lastFolderId===id&&!lastScan\.partial/);
 assert.match(bulk,/scanScope==="all"/);
 assert.match(bulk,/pending=pending\.slice\(0,40\)/);
 assert.match(bulk,/const latest=await transaction\.get\(ref\)/);
 assert.match(bulk,/if\(!isPaid\(data,p\.data\)\)return \{status:"mismatch"\}/);
 assert.match(bulk,/if\(data\.ipcDocumentUrl\)\{/);
 assert.match(bulk,/new FieldPath\("ipcDocumentLinks",p\.data\.id\),pdfUrl/);
 assert.match(bulk,/doc\(db,"paymentArchiveDetails",p\.data\.archiveMonth\)/);
 assert.match(bulk,/fileUsage\.get\(candidates\[0\]\.id\)>1/);
 assert.match(bulk,/!p\.shared&&p\.candidates\.length===1/);
 assert.match(archive,/cached\.ipcDocumentLinks=Object\.assign/);
 assert.doesNotMatch(bulk,/deleteDoc\s*\(|getDocs\s*\(/);
});
test('Monthly scanner stays available for next month without forcing all-month reads',()=>{
 assert.match(bulk,/Quét & gắn hồ sơ hàng loạt/);
 assert.match(bulk,/archiveRows=latest;currentMonth=String\(latest\[0\]\.archiveMonth\);scanScope="month"/);
 assert.match(archive,/window\.__archivePaidIpcRows=/);
 assert.match(archive,/return paidIpcRowsFromDetails\(currentDetails,currentDetails\.month\)/);
});

test('Monthly table renders dossier state directly from indexed snapshot, not a default folder',()=>{
 assert.match(archive,/const dossierState=\(id,details\)=>/);
 assert.match(archive,/const dossierCell=\(id,details\)=>/);
 assert.match(archive,/data-ipc-doc-cell="1">\$\{dossierCell\(paymentId,details\)\}/);
 assert.match(archive,/<th data-ipc-doc-head="1">/);
 assert.match(archive,/data-ipc-link-state="\$\{dossierState\(paymentId,details\)\.state\}"/);
 assert.match(archive,/if\(state==="no"&&!currentUserIsAdmin\)return "—"/);
 assert.match(archive,/state==="yes"&&!currentUserIsAdmin/);
 assert.match(archive,/dossierCheck:"🔎 Kiểm tra"/);
 assert.match(archive,/data-dossier-count="yes"/);
 assert.match(archive,/data-dossier-count="no"/);
 assert.match(archive,/data-dossier-count="unknown"/);
 assert.match(archive,/labels:\{dossier:t\("dossier"\)/);
 assert.match(index,/const labels=active\.labels\|\|\{\}/);
 assert.match(index,/counts\[stateOf\(id\)\.state\]\+\+/);
 assert.doesNotMatch(index,/getDocs\s*\(|onSnapshot\s*\(|setInterval\s*\(/);
});
test('Index completeness differentiates linked / missing / unresolved without reading Payment',()=>{
 const vm=require('node:vm');
 const start=archive.indexOf('    const indexedDossierLink=raw=>');
 const end=archive.indexOf('    const dossierCell=(id,details)=>',start);
 assert.ok(start>0&&end>start);
 const fn=vm.runInNewContext(archive.slice(start,end)+'\n dossierState',{URL});
 const link='https://drive.google.com/file/d/12345678abcdefgh/view';
 assert.equal(fn('p1',{ipcDocumentLinks:{p1:link},ipcDocumentLinksComplete:false}).state,'yes');
 assert.equal(fn('p1',{ipcDocumentLinks:{},ipcDocumentLinksComplete:true}).state,'no');
 assert.equal(fn('p1',{ipcDocumentLinks:{},ipcDocumentLinksComplete:true,ipcDocumentLinksUnresolvedIds:['p1']}).state,'unknown');
 assert.equal(fn('p1',{ipcDocumentLinks:{},ipcDocumentLinksComplete:false}).state,'unknown');
 assert.equal(fn('p1',{ipcDocumentLinks:{p1:'https://evil.com/file'},ipcDocumentLinksComplete:false}).state,'unknown');
});
test('Historical index backfill preserves valid prior links if legacy Payment read is unresolved',()=>{
 assert.match(index,/snap\.data\(\)\?\.ipcDocumentLinks\|\|\{\}/);
 assert.match(index,/if\(validUrl\(url\)\)links\[id\]=validUrl\(url\)/);
 assert.match(index,/if\(!item\.verified\)\{if\(item\.id&&!links\[item\.id\]\)unresolved\.push\(item\.id\);\}/);
 assert.match(index,/else if\(item\.id\)delete links\[item\.id\]/);
 assert.doesNotMatch(index,/deleteDoc\s*\(|getDocs\s*\(/);
});

test('Admin can inspect a single current-month unknown before any more Payment reads',()=>{
 assert.match(index,/inspect\.addEventListener\("click",repairVisibleMonth\)/);
 assert.match(index,/inspect\.hidden=counts\.unknown===0/);
 assert.match(index,/if\(target\.length>180\)/);
 assert.match(index,/const first=await checkRow\(chosen\)/);
 assert.match(index,/if\(first\.reason\)\{/);
 assert.match(index,/return;\s*\}\s*if\(!confirm\("MẪU ĐÃ KHỚP VỀ THÔNG TIN!/);
 assert.match(index,/results\.push\(\.\.\.await Promise\.all\(remaining\.slice\(i,i\+10\)\.map\(checkRow\)\)\)/);
 assert.match(index,/!owner\(\)\|\|view\(\)\?\.month!==month/);
 assert.doesNotMatch(index,/getDocs\s*\(|onSnapshot\s*\(|setInterval\s*\(/);
});
test('Targeted Admin reconciliation preserves existing index and never modifies UNC or money',()=>{
 assert.match(index,/if\(validUrl\(oldLinks\[id\]\)\)continue/);
 assert.match(index,/if\(active\.complete&&!oldUnknown\.has\(id\)\)continue/);
 assert.match(index,/const reason=archivePaidMismatch\(data,row,month\)/);
 assert.match(index,/norm\(data\?\.project\)!==norm\(row\?\.project\)/);
 assert.match(index,/norm\(data\?\.contractNo\)!==norm\(row\?\.contractNo\)/);
 assert.match(index,/norm\(data\?\.ipcNo\)!==norm\(row\?\.ipcNo\)/);
 assert.match(index,/JSON\.stringify\(fresh\.data\(\)\.ipcDocumentLinks\|\|\{\}\)!==JSON\.stringify\(oldLinks\)/);
 assert.match(index,/t\.update\(ref,\{ipcDocumentLinks:links,ipcDocumentLinksUnresolvedIds:/);
 assert.match(index,/__archiveDossierApplyBackfill\?\.\(month,links,\[\.\.\.unresolved\]\)/);
 assert.doesNotMatch(index,/collection\s*\(|deleteDoc\s*\(|writeBatch\s*\(/);
});

test('Archive confirms actual payment period, not the original planned month; prevents wrong IPC links',()=>{
 const vm=require('node:vm');
 const start=index.indexOf('const norm='),end=index.indexOf('let syncing=false;',start);
 assert.ok(start>=0&&end>start);
 const checker=vm.runInNewContext(index.slice(start,end)+'\n archivePaidMismatch');
 const row={project:'EATON PARK',contractNo:'CSCECVN-S.E.A-EATON-MEP-SUPL-004',ipcNo:'IPC011',actualAmount:6787282,paymentDate:'2026-10-29'};
 const paid={project:row.project,contractNo:row.contractNo,ipcNo:row.ipcNo,
   paymentMonth:'2026-09',processPaymentDate:'2026-10-29',processActualAmount:6787282};
 assert.equal(checker(paid,row,'2026-10'),'');
 assert.match(checker({...paid,processPaymentDate:'2026-09-29'},row,'2026-10'),/Ngày thanh toán/);
 assert.match(checker({...paid,processActualAmount:6787283},row,'2026-10'),/Số tiền/);
 assert.match(checker({...paid,contractNo:'WRONG'},row,'2026-10'),/hợp đồng/);
 assert.match(checker({...paid,ipcNo:'IPC010'},row,'2026-10'),/IPC/);
 assert.match(checker({...paid,deleted:true},row,'2026-10'),/xóa/);
});
test('Bulk paid identity uses real payment date even for older planned month',()=>{
 const vm=require('node:vm');
 const start=bulk.indexOf('const normalize='),end=bulk.indexOf('const view=',start);
 assert.ok(start>=0&&end>start);
 const api=vm.runInNewContext(bulk.slice(start,end)+'\n({isPaid,existingDriveUrl})',{URL});
 const row={project:'EATON PARK',contractNo:'C-MEP-SUPL-001',ipcNo:'IPC011',archiveMonth:'2026-10',
   paymentDate:'2026-10-29',actualAmount:100};
 const paid={project:row.project,contractNo:row.contractNo,ipcNo:row.ipcNo,
   paymentMonth:'2026-09',processActualAmount:100,processPaymentDate:'2026-10-29',monthOutcome:'carried_forward'};
 assert.equal(api.isPaid(paid,row),true);
 assert.equal(api.isPaid({...paid,processPaymentDate:'2026-09-29'},row),false);
 assert.equal(api.isPaid({...paid,processActualAmount:101},row),false);
 assert.equal(api.isPaid({...paid,ipcNo:'IPC010'},row),false);
 assert.equal(api.isPaid({...paid,deleted:true},row),false);
 const drive='https://drive.google.com/file/d/1M67gD4b8PRw_ABC123/view';
 assert.equal(api.existingDriveUrl(drive),drive);
 assert.equal(api.existingDriveUrl('https://drive.google.com.evil.test/file/d/1M67gD4b8PRw_ABC123/view'),'');
 assert.equal(api.existingDriveUrl('https://evil.example/doc'),'');
});
test('Existing bulk Payment link repairs only missing Archive index, never overwrites old link or rival indexed URL',()=>{
 assert.match(bulk,/const existing=existingDriveUrl\(data\.ipcDocumentUrl\)/);
 assert.match(bulk,/const archiveSnap=await transaction\.get\(archiveRef\)/);
 assert.match(bulk,/if\(indexed\)return \{status:indexed===existing\?"already_indexed":"index_conflict"\}/);
 assert.match(bulk,/transaction\.update\(archiveRef,new FieldPath\("ipcDocumentLinks",p\.data\.id\),existing\)/);
 assert.match(bulk,/return \{status:"reindexed",url:existing\}/);
 assert.match(bulk,/if\(outcome\.status==="saved"\|\|outcome\.status==="reindexed"\)/);
 assert.match(bulk,/p\.result\.textContent=outcome\.status==="reindexed"\?"✓ Khôi phục chỉ mục link cũ"/);
 assert.match(bulk,/if\(outcome\.status==="reindexed"\)reindexed\+\+/);
 assert.match(bulk,/window\.__archiveDossierUpdateLocal/);
 assert.doesNotMatch(bulk,/onSnapshot\s*\(|getDocs\s*\(/);
});

test('Admin monthly reconciliation button is visible: close anchor is in shared owner scope',()=>{
 const start=index.indexOf('if(active.admin&&owner()){');
 const button=index.indexOf('let button=heading.querySelector(".archive-ipc-index-tools")',start);
 const close=index.indexOf('const close=heading.querySelector(".viewer-close")',start);
 const inspect=index.indexOf('let inspect=heading.querySelector(".archive-ipc-index-repair")',start);
 assert.ok(start>=0&&close>start&&button>close&&inspect>button,
   'close must be declared in owner scope BEFORE both button creation branches');
 assert.match(index,/inspect\.addEventListener\("click",repairVisibleMonth\)/);
 assert.match(index,/inspect\.hidden=counts\.unknown===0/);
 assert.match(index,/if\(close\)close\.before\(inspect\);else heading\.append\(inspect\)/);
 assert.equal((index.match(/const close=heading\.querySelector\("\.viewer-close"\)/g)||[]).length,1);
 assert.doesNotMatch(index,/getDocs\s*\(|onSnapshot\s*\(|setInterval\s*\(/);
});

test('Admin selects a known linked Archive sample from local rows; no auto-read or wrong first item',()=>{
 assert.match(index,/function chooseReconciliationSample\(target,month\)/);
 assert.match(index,/modal\.showModal\(\)/);
 assert.match(index,/const chosen=await chooseReconciliationSample\(target,month\)/);
 assert.match(index,/if\(!chosen\)return/);
 assert.match(index,/if\(!owner\(\)\|\|view\(\)\?\.month!==month\)/);
 assert.match(index,/if\(!confirm\("CHỈ ĐỌC THỬ MỘT KHOẢN\?/);
 assert.match(index,/const first=await checkRow\(chosen\)/);
 assert.match(index,/target\.filter\(row=>row\.paymentId!==chosen\.paymentId\)/);
 assert.match(index,/select\.selectedIndex=-1/);
 assert.match(index,/select\.replaceChildren\(\)/);
 assert.match(index,/row=target\.find\(r=>r\.paymentId===select\.value\)/);
 assert.doesNotMatch(index,/getDocs\s*\(|onSnapshot\s*\(|setInterval\s*\(/);
});
