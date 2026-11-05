'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createRequire}=require('node:module');
const firebaseRequire=createRequire(path.join(__dirname,'firebase-rules/package.json'));
const {initializeApp,deleteApp}=firebaseRequire('firebase-admin/app');
const {getFirestore}=firebaseRequire('firebase-admin/firestore');
const {getAuth}=firebaseRequire('firebase-admin/auth');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')
 throw Error('Only isolated local Emulators are permitted');
const root=path.resolve(__dirname,'../../emulator-site');
const app=initializeApp({projectId:'demo-payment-security'});
const db=getFirestore(app),auth=getAuth(app);
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split('?')[0]==='/'?'/payment.html':req.url.split('?')[0]);
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,bytes)=>{
  if(err){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
  res.end(bytes);
 });
});
(async()=>{
 const email='pr11synthetic@cscecmep.internal',uid='pr11-synthetic-user';
 try { await auth.createUser({uid,email,password:'SyntheticTestOnly123!',emailVerified:true}); }
 catch(error) { if(error.code!=='auth/uid-already-exists')throw error; }
 await db.doc('authUsers/'+uid).set({role:'staff',displayName:'Synthetic Test User',email,username:'pr11synthetic'});
 // Synthetic emulator-only marker, never written to production.
 // Required because desktop Excel preview now refuses unbounded full-collection reads.
 await db.doc('systemConfig/paymentLookupV2').set({
  ready:true,schemaVersion:2,activationVersion:3,candidateType:'contractDigitsV2',
  rulesVerified:true,backfillVerified:true,synchronousWritersVerified:true,
  continuousMaintenance:true,verifiedPaymentCount:1
 });
 await db.doc('contracts/pr11-test-contract').set({
  project:'TEST PROJECT',contractNo:'TEST-PR11-MEP-SUPL-001',company:'SYNTHETIC COMPANY',
  bankAccount:'12345678',contractName:'Synthetic test contract',costType:'材料款',contractType:'材料款',status:'Active'
 });
 await new Promise(resolve=>server.listen(4178,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.PAYMENT_TEST_BROWSER_CHANNEL?{channel:process.env.PAYMENT_TEST_BROWSER_CHANNEL}:{})});
 try{
  const runId=String(Date.now());
  const cases=[['payment.html','staff'],['payment-mobile-renderer.html','staff'],['payment.html','admin'],['payment-mobile-renderer.html','admin']];
  for(const [caseIndex,[file,role]] of cases.entries()){
   const ipc=runId+caseIndex;
   await db.doc('authUsers/'+uid).update({role});
   const ctx=await browser.newContext({viewport:{width:1440,height:960}});
   const errors=[],blocked=[];
   await ctx.route('**/*',route=>{
    const hostname=new URL(route.request().url()).hostname;
    if(['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com','storage.googleapis.com'].includes(hostname)){
     blocked.push(hostname);return route.abort();
    }
    return route.continue();
   });
   const page=await ctx.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>d.accept());
   await page.goto('http://127.0.0.1:4178/'+file+'?firestoreAudit=1',{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#authUsernameInput').fill('pr11synthetic');
   await page.locator('#authPasswordInput').fill('SyntheticTestOnly123!');
   await page.locator('#authLoginBtn').click();
   try { await page.waitForFunction(()=>document.querySelector('#operatorNameDisplay')?.textContent?.includes('Synthetic Test'),{},{timeout:30000}); }
   catch(error) { console.error(JSON.stringify({file,role,errors,blocked,login:await page.locator('#authLoginError').textContent(),operator:await page.locator('#operatorNameDisplay').textContent()})); throw error; }
   await page.locator('#addPaymentBtn').click();
   await page.locator('#paymentModal.show').waitFor({timeout:20000});
   await page.locator('#formPerson').fill('Synthetic Test User');
   await page.locator('#formProject').selectOption('TEST PROJECT');
   await page.locator('#formContractNo').selectOption('TEST-PR11-MEP-SUPL-001');
   await page.locator('#formIPC').fill(ipc);
   await page.locator('#formAmount').fill('15203');
   const before=await page.evaluate(()=>window.__paymentReadAudit?.summary());
   assert(before,'Opt-in read attribution missing');
   await page.locator('#savePaymentBtn').click();
   await page.locator('#paymentModal.show').waitFor({state:'hidden',timeout:30000});
   const rows=(await db.collection('payments').get()).docs.map(x=>x.data());
   const row=rows.find(x=>String(x.ipcNo||'').endsWith(ipc));
   assert(row,file+': Payment server readback missing');
   assert.equal(row.amount,15203);
   assert.equal(row.company,'SYNTHETIC COMPANY');
   for(const key of ['duplicateKeyV1','mepLookupV1','paymentLookupSchemaV1'])assert.equal(row[key],undefined);
   const excelIpc=ipc+'9';
   const clipboard='Project\tContract No\tIPC No\tAmount\tCompany\tContract Name\nTEST PROJECT\tTEST-PR11-MEP-SUPL-001\t'+excelIpc+'\t500\tSYNTHETIC COMPANY\tSynthetic test contract';
   async function preview(){
    await page.locator('#pasteExcelBtn').click();
    await page.locator('#importDefaultPerson').fill('Synthetic Test User');
    await page.locator('#excelPasteArea').fill(clipboard);
    await page.locator('#previewExcelPasteBtn').click();
    await page.waitForFunction(()=>!document.querySelector('#previewExcelPasteBtn').disabled&&!document.querySelector('#excelImportStatus').textContent.includes('⏳'));
   }
   if(file==='payment.html'){
     // The isolated Rules intentionally do not expose V2 marker.
     // Desktop must reject an unsafe full-history fallback.
     await preview();
     assert.match(await page.locator('#excelImportStatus').innerText(),/Tra cứu trùng IPC V2 chưa sẵn sàng/);
     assert.equal(await page.locator('#confirmExcelImportBtn').isEnabled(),false);
     await page.locator('#closePasteExcelModal').click();
   }else{
   await preview();
   assert(await page.locator('#confirmExcelImportBtn').isEnabled(),await page.locator('#excelImportStatus').innerText());
   await page.locator('#confirmExcelImportBtn').click();
   const readImported=async()=>{
    const snap=await db.collection('payments').where('createdByUid','==',uid).get();
    return snap.docs.filter(d=>String(d.data().ipcNo||'').endsWith(excelIpc));
   };
   await page.waitForFunction(async suffix=>{
    const sdk=await import('./assets/js/firestore-payment.mjs');
    const {getApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const browserDb=sdk.getFirestore(getApp()); await sdk.waitForPendingWrites(browserDb);
    const snap=await sdk.getDocsFromServer(sdk.collection(browserDb,'payments'));
    return snap.docs.some(d=>String(d.data().ipcNo||'').endsWith(suffix));
   },excelIpc,{timeout:30000});
   const imported=await readImported();assert.equal(imported.length,1);assert.equal(imported[0].data().amount,500);
   for(const key of ['duplicateKeyV1','mepLookupV1','paymentLookupSchemaV1'])assert.equal(imported[0].data()[key],undefined);
   await page.locator('#closePasteExcelModal').waitFor({state:'hidden',timeout:30000});
   await preview();
   assert.equal(await page.locator('#excelImportPreview .import-duplicate-risk').count(),1,'Legacy duplicate warning must remain visible');
   await page.locator('#excelPasteArea').fill(clipboard+'\n'+clipboard.split('\n')[1]);
   await page.locator('#previewExcelPasteBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#previewExcelPasteBtn').disabled&&!document.querySelector('#excelImportStatus').textContent.includes('⏳'));
   assert.equal(await page.locator('#confirmExcelImportBtn').isEnabled(),false,'Identical rows inside one paste must be blocked');
   if(await page.locator('#closePasteExcelModal').isVisible())await page.locator('#closePasteExcelModal').click();
   await page.locator('#toolsMenuBtn').click();await page.locator('[data-tools-action="undo"]').click();
   await page.waitForFunction(async suffix=>{
    const sdk=await import('./assets/js/firestore-payment.mjs');
    const {getApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const browserDb=sdk.getFirestore(getApp()); await sdk.waitForPendingWrites(browserDb);
    const snap=await sdk.getDocsFromServer(sdk.collection(browserDb,'payments'));
    return !snap.docs.some(d=>String(d.data().ipcNo||'').endsWith(suffix));
   },excelIpc,{timeout:30000});
   assert.equal((await readImported()).length,0);
   }
   assert.deepEqual(blocked,[],'Test tried connecting to production backend');
   assert.deepEqual(errors,[],'Browser JavaScript error');
   const after=await page.evaluate(()=>window.__paymentReadAudit?.summary());
   const beforeCalls=before.groups.reduce((n,x)=>n+x.calls,0),afterCalls=after.groups.reduce((n,x)=>n+x.calls,0);
   console.log(JSON.stringify({file,role,pass:true,saveAck:true,serverReadback:true,excelImport:file!=='payment.html',indexFallbackBlocked:file==='payment.html',legacyDuplicateWarning:file!=='payment.html',inPasteDuplicateBlocked:file!=='payment.html',undo:file!=='payment.html',noClientMetadata:true,readTraceCallsBefore:beforeCalls,readTraceCallsAfter:afterCalls,scope:'localhost-emulator'}));
   await ctx.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1}).finally(()=>deleteApp(app));
