'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../../emulator-site'),resultDir=path.resolve(__dirname,'ui-evidence');
fs.mkdirSync(resultDir,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(data);});
});
(async()=>{
 await new Promise(r=>server.listen(4173,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
 const results=[];
 try{
  for(const [role,email] of [['admin','lehoangoanh@cscecmep.internal'],['staff','teststaff@cscecmep.internal']]){
   if(process.env.UI_ROLES&&!process.env.UI_ROLES.split(',').includes(role))continue;
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),blocked=[],errors=[];
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com','storage.googleapis.com'].includes(url.hostname)){blocked.push(url.hostname);return route.abort();}
    return route.continue();
   });
   const page=await context.newPage();let allowConfirm=false;const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,600))});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'&&allowConfirm?d.accept():d.dismiss());
   await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#loginUsername').fill(email.split('@')[0]);await page.locator('#loginPassword').fill('EmulatorOnly123!');await page.locator('#loginSubmit').click();
   try{await page.waitForFunction(()=>document.querySelector('#accountName')?.textContent.includes('Emulator'),{},{timeout:30000});}
   catch(error){results.push({role,page:'index.html',loginFailure:await page.locator('#loginError').innerText(),errors,consoleErrors});throw error}
   results.push({role,page:'index.html',authenticated:true,privateCardsVisible:await page.locator('[data-private-card]:visible').count(),adminCardsVisible:await page.locator('[data-admin-card]:visible').count()});
   for(const name of ['payment.html','cash-control.html','plan-review.html','payment-archive.html','contract-master.html','payment-mobile-renderer.html']){
    if(process.env.UI_PAGES&&!process.env.UI_PAGES.split(',').includes(name))continue;
    const before=errors.length;await page.goto('http://127.0.0.1:4173/'+name,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(2500);
    if(role==='admin'&&name==='payment.html'){
      await page.waitForFunction(()=>document.querySelector('#operatorNameDisplay')?.textContent.includes('Emulator')&&document.body.textContent.includes('EMULATOR COMPANY'));
      await page.locator('#exportExcelBtn').click();await page.locator('#exportFullDataBtn').click();
      const pending=page.waitForEvent('download',{timeout:20000});await page.locator('#confirmExportExcelBtn').click();
      const download=await pending,targetFile=path.join(resultDir,'synthetic-payment-export.xlsx');await download.saveAs(targetFile);
      const workbook=await page.evaluate(bytes=>{
        const wb=XLSX.read(new Uint8Array(bytes),{type:'array'});
        return {sheetCount:wb.SheetNames.length,containsFixture:wb.SheetNames.some(n=>JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1})).includes('EMULATOR COMPANY'))};
      },Array.from(fs.readFileSync(targetFile)));
      if(!workbook.sheetCount||!workbook.containsFixture)throw Error('Export readback missing synthetic fixture');
      results.push({role,workflow:'Payment Excel export and workbook readback',pass:true,...workbook});
      await page.locator('#pasteExcelBtn').click();
      await page.locator('#importDefaultPerson').fill('Emulator staff');
      await page.locator('#excelPasteArea').fill('Project\tContract No\tIPC No\tAmount\tCompany\tContract Name\nEATON PARK\tMEP999\tIPC999\t500\tEMULATOR COMPANY\tEmulator import');
      await page.locator('#previewExcelPasteBtn').click();await page.locator('#excelImportPreview').waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('#previewExcelPasteBtn').disabled&&!document.querySelector('#excelImportStatus').textContent.includes('⏳'));
      results.push({role,workflow:'Payment clipboard import preview',previewText:(await page.locator('#excelImportStatus').innerText()).slice(0,500),previewBody:(await page.locator('#excelImportPreview').innerText()).slice(0,1200),confirmEnabled:await page.locator('#confirmExcelImportBtn').isEnabled()});
      if(!await page.locator('#confirmExcelImportBtn').isEnabled())throw Error('Synthetic valid import unexpectedly rejected');
      allowConfirm=true;await page.locator('#confirmExcelImportBtn').click();
      const readImported=()=>page.evaluate(async()=>{
        const sdk=await import('./assets/js/firestore-payment.mjs'),{getApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const {computeIndexV1}=await import('./assets/js/payment-index-core.mjs');
        const db=sdk.getFirestore(getApp()),snap=await sdk.getDocs(sdk.query(sdk.collection(db,'payments'),sdk.where('contractNo','==','MEP999'),sdk.where('ipcNo','==','IPC999')));
        return snap.docs.map(d=>{const row=d.data(),expected=computeIndexV1(row);return {amount:row.amount,indexCorrect:Object.entries(expected).every(([k,v])=>row[k]===v)}});
      });
      let imported=[];for(let i=0;i<30;i++){imported=await readImported();if(imported.length)break;await page.waitForTimeout(200)}
      if(imported.length!==1||imported[0].amount!==500||!imported[0].indexCorrect)throw Error('Import server readback or synchronous index failed');
      await page.locator('#toolsMenuBtn').click();await page.locator('[data-tools-action="undo"]').click();
      for(let i=0;i<30;i++){imported=await readImported();if(!imported.length)break;await page.waitForTimeout(200)}
      if(imported.length)throw Error('Undo failed to remove the synthetic import');
      allowConfirm=false;
      results.push({role,workflow:'Actual browser SDK import and undo with server readback',pass:true,indexWasCorrectAtCommit:true,remainingImportedRows:0});
      await page.locator('#toolsMenuBtn').click();await page.locator('#toolsHistory2026Btn').click();
      await page.waitForFunction(()=>document.querySelector('#h26Total')?.textContent.trim()==='812');
      results.push({role,workflow:'History Center verified private source loaded',rowCount:812,pass:true});
      await page.locator('#closeHistory2026Modal').click();
    }
    if(role==='admin'&&name==='cash-control.html'){
      await page.waitForFunction(()=>!document.body.classList.contains('auth-checking')&&document.querySelector('#cashCloudStatus')?.textContent.includes('đã đồng bộ'),{},{timeout:60000});
      results.push({role,workflow:'Cash owner protected history loaded and cloud synchronized',pass:true});
    }
    if(role==='admin'&&name==='contract-master.html'){
      await page.locator('#mepSectionTab').click();await page.waitForTimeout(1000);
      const body=await page.locator('#mepMasterBody').innerText();
      results.push({role,workflow:'Contract Master MEP lookup',containsFixture:body.includes('EMULATOR COMPANY')});
    }
    if(name==='payment-archive.html'){
      await page.locator('#archiveMonthSelect').selectOption('2026-09');
      await page.waitForFunction(()=>document.body.textContent.includes('TEST-ARCHIVE'));
      results.push({role,workflow:'Archive month detail load',containsFixture:true});
    }
    if(role==='admin'&&name==='plan-review.html'){
      await page.locator('#paymentViewBtn').click();
      await page.locator('[data-project="EATON PARK"]').click();
      await page.locator('#keepAllBtn').click();
      await page.locator('[data-approved-id="ui-payment-0"]').fill('900');
      await page.locator('[data-approved-id="ui-payment-0"]').blur();
      await page.locator('[data-decision="excluded"][data-id="ui-payment-1"]').click();
      await page.locator('#confirmBtn').click();await page.locator('#doConfirmBtn').click();
      await page.locator('#confirmModal').waitFor({state:'hidden',timeout:30000});
      await page.waitForFunction(async()=>{
        const sdk=await import('./assets/js/firestore-payment.mjs'),{getApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const db=sdk.getFirestore(getApp());const snap=await sdk.getDocFromServer(sdk.doc(db,'payments/ui-payment-0'));
        return snap.data()?.planApprovedAmount===900;
      });
      const checked=await page.evaluate(async()=>{
        const sdk=await import('./assets/js/firestore-payment.mjs'),{getApp}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const {computeIndexV1}=await import('./assets/js/payment-index-core.mjs'),db=sdk.getFirestore(getApp());
        const values=[];for(let i=0;i<3;i++){const row=(await sdk.getDocFromServer(sdk.doc(db,'payments/ui-payment-'+i))).data();values.push({amount:row.amount,status:row.planReviewStatus,indexCorrect:Object.entries(computeIndexV1(row)).every(([k,v])=>row[k]===v)})}return values;
      });
      results.push({role,workflow:'Plan Review diagnostic readback',checked,consoleErrors});
      if(checked[0].amount!==900||checked[1].amount!==1001||checked[1].status!=='excluded'||checked[2].amount!==1002||checked.some(x=>!x.indexCorrect))throw Error('Plan Review server readback changed business amounts unexpectedly');
      results.push({role,workflow:'Plan Review approve/reduce/exclude/lock with Payment readback',pass:true,excludedPaymentUnchanged:true,allIndexesCorrect:true});
      await page.locator('[data-project="EATON PARK"]').click();allowConfirm=true;await page.locator('#unlockBtn').click();
      await page.waitForFunction(()=>!document.querySelector('#confirmBtn').disabled);
      allowConfirm=false;
      results.push({role,workflow:'Plan Review unlock',pass:true});
    }
    await page.screenshot({path:path.join(resultDir,role+'-'+name+'.png'),fullPage:false});
    const text=await page.locator('body').innerText();
    results.push({role,page:name,title:await page.title(),pageErrors:errors.slice(before),bodyLength:text.length,visibleDialogs:await page.locator('[role=dialog]:visible').count(),visibleButtonsCount:await page.locator('button:visible').count(),bodyExcerpt:'[Financial UI content deliberately omitted]'});
   }
   results.push({role,blockedProductionRequests:blocked});await context.close();
  }
 }finally{fs.writeFileSync(path.join(resultDir,'smoke-results.json'),JSON.stringify(results,null,2));await browser.close();server.close();}
 console.log('UI smoke complete; see ui-evidence/smoke-results.json. This is not full workflow certification.');
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

