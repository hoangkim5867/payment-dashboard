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
 await auth.createUser({uid,email,password:'SyntheticTestOnly123!',emailVerified:true});
 await db.doc('authUsers/'+uid).set({role:'staff',displayName:'Synthetic Test User',email,username:'pr11synthetic'});
 await db.doc('contracts/pr11-test-contract').set({
  project:'TEST PROJECT',contractNo:'TEST-PR11-MEP-SUPL-001',company:'SYNTHETIC COMPANY',
  bankAccount:'12345678',contractName:'Synthetic test contract',costType:'材料款',contractType:'材料款',status:'Active'
 });
 await new Promise(resolve=>server.listen(4178,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try{
  for(const [file,ipc] of [['payment.html','901'],['payment-mobile-renderer.html','902']]){
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
   await page.waitForFunction(()=>document.querySelector('#operatorNameDisplay')?.textContent?.includes('Synthetic Test'),{},{timeout:30000});
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
   assert.deepEqual(blocked,[],'Test tried connecting to production backend');
   assert.deepEqual(errors,[],'Browser JavaScript error');
   const after=await page.evaluate(()=>window.__paymentReadAudit?.summary());
   const beforeCalls=before.groups.reduce((n,x)=>n+x.calls,0),afterCalls=after.groups.reduce((n,x)=>n+x.calls,0);
   console.log(JSON.stringify({file,pass:true,saveAck:true,serverReadback:true,readTraceCallsBefore:beforeCalls,readTraceCallsAfter:afterCalls,scope:'localhost-emulator'}));
   await ctx.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1}).finally(()=>deleteApp(app));
