'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..');
const archive=fs.readFileSync(path.join(root,'site/payment-archive.html'),'utf8');
const bulk=fs.readFileSync(path.join(root,'site/assets/js/archive-ipc-bulk-links.mjs'),'utf8');
const lookup=fs.readFileSync(path.join(root,'site/assets/js/drive-ipc-lookup.mjs'),'utf8');
const {pathToFileURL}=require('node:url');
let finder;
test.before(async()=>{finder=await import(pathToFileURL(path.join(root,'site/assets/js/drive-ipc-lookup.mjs')).href);});
test('Archive bulk source uses already loaded PAID rows with actual paymentId; no Excel row identities',()=>{
 assert.match(archive,/window\.__archivePaidIpcRows=/);
 assert.match(archive,/viewerMode!=="details"/);
 assert.match(archive,/String\(row\.paymentId\|\|""\)\.trim\(\)/);
 assert.match(archive,/Number\(row\.actualAmount\)>0/);
 assert.match(archive,/String\(row\.paymentDate\|\|""\)\.trim\(\)/);
 assert.match(bulk,/rowsForCurrentMonth\(\)/);
 assert.doesNotMatch(bulk,/getDocs\s*\(|onSnapshot\s*\(|getDocs\(/);
});
test('Admin-only direct Archive bulk writes require explicit approval and independent transactional checks',()=>{
 assert.match(bulk,/const OWNER_UID=/);
 assert.match(bulk,/uid!==OWNER_UID/);
 assert.match(bulk,/getDoc\(doc\(db,"authUsers",uid\)\)/);
 assert.match(bulk,/if\(data\.ipcDocumentUrl\)\{/);
 assert.match(bulk,/transaction\.update\(ref,\{ipcDocumentUrl:pdfUrl,ipcDocumentUpdatedAt:serverTimestamp\(\),ipcDocumentUpdatedByUid:uid\}\)/);
 assert.match(bulk,/Math\.abs\(rawPaid-Number\(source\.actualAmount\)\)<0\.01/);
 assert.match(bulk,/date\.slice\(0,7\)===source\.archiveMonth/);
 assert.match(bulk,/data\.deleted!==true/);
 assert.match(bulk,/scanPartial\)\{message/);
 assert.match(bulk,/pending\.length>40/);
 assert.match(bulk,/confirm\(label\)/);
 assert.match(bulk,/file\.confidence==="strong"/);
 assert.doesNotMatch(bulk,/deleteDoc\(|setDoc\(|writeBatch\(/);
});
test('One SSIS root cannot suggest wrong IPC, wrong contract or other project',()=>{
 const payment={project:'EATON',contractNo:'CSCECVN-S.E.A-EATON PARK P1-MEP-SUPL-024',ipcNo:'IPC004'};
 const files=[
  {id:'abc12345678',name:'EATON PARK P1-MEP-SUPL-024 IPC-004 GIANG KIỀU.pdf',mimeType:'application/pdf',path:'SSIS/EATON PARK/SUPL-024/IPC'},
  {id:'badipc12345',name:'EATON-MEP-SUPL-024-IPC-003.pdf',mimeType:'application/pdf',path:'SSIS/EATON PARK/SUPL-024/IPC'},
  {id:'badprj12345',name:'ELYSIAN-MEP-SUPL-024-IPC004.pdf',mimeType:'application/pdf',path:'SSIS/ELYSIAN/SUPL-024/IPC'},
  {id:'badco123456',name:'EATON-MEP-SUPL-025-IPC004.pdf',mimeType:'application/pdf',path:'SSIS/EATON PARK/SUPL-025/IPC'}
 ];
 assert.deepEqual(finder.findPaymentPdfCandidates(payment,{rootName:'SSIS',files}).map(f=>f.id),['abc12345678']);
});
test('Browser UI only scans Drive on Admin click and only reads metadata; no Firebase reads on page load',()=>{
 assert.match(bulk,/id="archiveIpcScan"/);
 assert.match(bulk,/\$\("#archiveIpcScan"\)\.addEventListener\("click"/);
 assert.match(bulk,/scanDriveFolder\(/);
 assert.match(lookup,/drive\.metadata\.readonly/);
 assert.match(bulk,/id="archiveIpcAllStrong"/);
 assert.match(bulk,/id="archiveIpcSave"/);
 assert.match(bulk,/runTransaction\(db,async transaction/);
 assert.match(bulk,/link cũ, tiền, UNC hay tiến trình/);
});
