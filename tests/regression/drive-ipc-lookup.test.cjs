'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'../..');
const lookupPath=path.join(root,'site/assets/js/drive-ipc-lookup.mjs');
let api;
test.before(async()=>{api=await import(pathToFileURL(lookupPath).href);});
const row={id:'p1',project:'EATON',contractNo:'CSCECVN-S.E.A-EATON PARK P1-MEP-SUPL-024',ipcNo:'IPC004'};
test('Google Drive links identify folder only; never confuse a PDF link with a scan root',()=>{
 assert.equal(api.folderId('https://drive.google.com/drive/folders/1o4Ky8GR-dOfohbfqytqbG3C6LLS'),'1o4Ky8GR-dOfohbfqytqbG3C6LLS');
 assert.equal(api.folderId('https://drive.google.com/file/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/view'),'');
 assert.equal(api.folderId('https://drive.google.com.evil.com/drive/folders/1o4Ky8GR-dOfohbfqytqbG3C6LLS'),'');
});
test('SSIS root: correct EATON SUPL-024 IPC004 PDF only; reject IPC003, other contract and project',()=>{
 const scan={rootName:'SSIS',files:[
  {id:'correct',name:'EATON PARK P1-MEP-SUPL-024 IPC-004 GIANG KIỀU.pdf',path:'SSIS/EATON PARK/SUPL/SUPL-024/IPC'},
  {id:'wrong-ipc',name:'EATON-MEP-SUPL-024-IPC-003 GIANG KIỀU.pdf',path:'SSIS/EATON PARK/SUPL/SUPL-024/IPC'},
  {id:'wrong-contract',name:'EATON-MEP-SUPL-025-IPC-004.pdf',path:'SSIS/EATON PARK/SUPL/SUPL-025/IPC'},
  {id:'wrong-project',name:'ELYSIAN-MEP-SUPL-024-IPC-004.pdf',path:'SSIS/ELYSIAN/SUPL/SUPL-024/IPC'},
  {id:'same-name-other-folder',name:'EATON P1-MEP-SUPL-024-IPC004.pdf',path:'SSIS/ELYSIAN/SUPL/SUPL-024/IPC'}
 ]};
 const matches=api.findPaymentPdfCandidates(row,scan);
 assert.deepEqual(matches.map(x=>x.id),['correct']);
 assert.equal(matches[0].confidence,'strong');
 assert.equal(matches[0].url,'https://drive.google.com/file/d/correct/view');
});
test('Narrow IPC folder: recognize explicit file codes but never guess generic contract PDF',()=>{
 const scan={rootName:'IPC',files:[
  {id:'c',name:'EATON PARK P1-MEP-SUPL-024 IPC-004 GIANG KIỀU.pdf',path:'IPC'},
  {id:'x',name:'EATON-MEP-SUPL-024-IPC-003 GIANG KIỀU.pdf',path:'IPC'},
  {id:'g',name:'EATON-MEP-SUPL-024 CONTRACT.pdf',path:'IPC'}
 ]};
 assert.deepEqual(api.findPaymentPdfCandidates(row,scan).map(x=>x.id),['c']);
});
test('Do not give a strong score to PDFs without verified project in broad SSIS search',()=>{
 const item={id:'a',name:'SUPL-024 IPC-004.pdf',path:'SSIS/UNKNOWN/SUPL-024/IPC'};
 assert.deepEqual(api.findPaymentPdfCandidates(row,{rootName:'SSIS',files:[item]}),[]);
 const narrow=api.findPaymentPdfCandidates(row,{rootName:'SUPL-024',files:[{...item,path:'SUPL-024/IPC'}]});
 assert.equal(narrow.length,1);
 assert.equal(narrow[0].confidence,'review');
});
test('Scan is metadata-only: recursively lists PDFs via GET and never downloads file bytes',async()=>{
 const requests=[];
 const pages={
  ROOT12345:{id:'ROOT12345',name:'SSIS',mimeType:'application/vnd.google-apps.folder'},
  ROOT12345_list:{files:[{id:'A12345678',name:'EATON PARK',mimeType:'application/vnd.google-apps.folder'}]},
  A12345678_list:{files:[{id:'file000001',name:'EATON PARK P1-MEP-SUPL-024 IPC-004.pdf',mimeType:'application/pdf'}]}
 };
 const fetcher=async(url,opts)=>{
  requests.push({url,opts});
  const u=new URL(url);
  let result;
  if(u.pathname.endsWith('/files/ROOT12345'))result=pages.ROOT12345;
  else if(u.searchParams.has('q')){
   const q=u.searchParams.get('q');
   result=q.includes("'ROOT12345'")?pages.ROOT12345_list:pages.A12345678_list;
  }else throw Error('unexpected API path');
  return {ok:true,json:async()=>result};
 };
 const scan=await api.scanDriveFolder({folderId:'ROOT12345',token:'fake-test-token',fetcher});
 assert.equal(scan.files.length,1);
 assert.equal(scan.readFolders,2);
 assert.equal(scan.partial,false);
 assert.ok(requests.every(r=>r.opts.headers.Authorization==='Bearer fake-test-token'));
 assert.ok(requests.every(r=>!r.opts.method||r.opts.method==='GET'));
 assert.ok(requests.every(r=>r.url.startsWith('https://www.googleapis.com/drive/v3/')));
});
test('Picker is restricted to Admin modal and save remains user-triggered',()=>{
 const picker=fs.readFileSync(path.join(root,'site/assets/js/drive-ipc-picker-ui.mjs'),'utf8');
 const app=fs.readFileSync(path.join(root,'site/assets/js/payment-doc-link-ui.mjs'),'utf8');
 const pay=fs.readFileSync(path.join(root,'site/payment.html'),'utf8');
 const drafts=fs.readFileSync(path.join(root,'site/assets/js/payment-emergency-drafts.mjs'),'utf8');
 assert.match(picker,/scope:GOOGLE_DRIVE_SCOPE/);
 assert.match(picker,/choose\.addEventListener\("click"/);
 assert.match(picker,/saveBatchLink\(p,f\.url\)/);
 assert.match(picker,/panel\.hidden=!isAdmin/);
 assert.match(app,/createIpcDrivePicker/);
 assert.match(app,/picker\.onOpen\(\{\.\.\.p,id\},user\.admin\)/);
 assert.match(pay,/window\.__ipcDriveBatchRows/);
 assert.doesNotMatch(drafts,/✅ Firestore đã xác nhận thanh toán/);
 assert.match(drafts,/CHƯA xóa được nháp/);
});
