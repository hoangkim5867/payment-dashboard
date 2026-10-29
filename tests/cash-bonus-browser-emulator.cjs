'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{createRequire}=require('node:module');
const req=createRequire(path.join(__dirname,'firebase-rules/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore'),{getAuth}=req('firebase-admin/auth');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Isolated Emulator only');
const app=initializeApp({projectId:'demo-payment-security'},'cash-bonus-e2e'),db=getFirestore(app),auth=getAuth(app);
const root=path.resolve(__dirname,'../../emulator-site');
const server=http.createServer((request,response)=>{
 const uri=decodeURIComponent(request.url.split('?')[0]),p=path.resolve(root,'.'+uri);
 if(!p.startsWith(root+path.sep)){response.writeHead(403).end();return;}
 fs.readFile(p,(error,data)=>{if(error){response.writeHead(404).end();return;}
 response.setHeader('Content-Type',p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');response.end(data);});
});
(async()=>{
 const uid='HTx2QuATHxh8zgAawwreg88w65M2',email='lehoangoanh@cscecmep.internal',password='EmulatorOnly123!';
 const protectedHistory=JSON.stringify({LEGACY_SALARY:[],LEGACY_FINANCE:[],LEGACY_VNB:[],LEGACY_CASH_SPECIAL:[]});
 const digest=crypto.createHash('sha256').update(protectedHistory).digest('hex');
 await auth.createUser({uid,email,password,emailVerified:false});
 await db.doc('authUsers/'+uid).set({role:'admin'});
 await db.doc('cash_control_private/legacy_seed_20261021_v1').set({schemaVersion:1,payload:protectedHistory,sha256:digest});
 await db.doc('cash_control_private/lehoangoanh').set({salaryRecords:[],manualRecords:[],schemaVersion:3,revision:0});
 await new Promise(resolve=>server.listen(4178,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[],blocked=[];
  await ctx.route('**/*',route=>{const host=new URL(route.request().url).hostname;
    if(['firestore.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com','storage.googleapis.com'].includes(host)){blocked.push(host);return route.abort();}return route.continue();});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:4178/cash-control.html',{waitUntil:'domcontentloaded'});
  await page.locator('#cashAuthUsername').fill('lehoangoanh');
  await page.locator('#cashAuthPassword').fill(password);
  await page.locator('#cashAuthSubmit').click();
  await page.waitForFunction(()=>!document.body.classList.contains('auth-checking')&&document.querySelector('#cashLoginModal')&&!document.querySelector('#cashLoginModal').classList.contains('show'),{},{timeout:30000});
  await page.locator('#addSalaryRecord').click();
  await page.locator('#pyProject').fill('C17-2');
  await page.locator('#pyStaffGroup').selectOption('cn');
  await page.locator('#pyType').selectOption('bonus');
  await page.locator('#pyBonusYear').fill('2024');
  await page.locator('#pyAmount').fill('1000000');
  await page.locator('#pyBonusTaxAmount').fill('120000');
  await page.locator('#pyActualDate').fill('2026-10-27');
  await page.locator('#pyActualDate').dispatchEvent('change');
  assert.match(await page.locator('#pyBonusTaxHelp').innerText(),/Q4\/2026/);
  await page.locator('#saveSalaryRecord').click();
  await page.waitForFunction(()=>!document.querySelector('#salaryRecordModal').classList.contains('show'),{},{timeout:20000});
  let data=(await db.doc('cash_control_private/lehoangoanh').get()).data(),rows=data.salaryRecords||[];
  assert.equal(rows.length,2);
  const bonus=rows.find(x=>x.type==='bonus'),tax=rows.find(x=>x.type==='tax');
  assert.equal(bonus.bonusYear,'2024');assert.equal(tax.linkedBonusId,bonus.id);
  assert.equal(tax.taxPeriod,'2026-Q4');assert.equal(tax.actualDate,'');assert.equal(tax.amountVnd,120000);
  assert.equal(data.manualRecords.filter(x=>x.linkedModule==='payroll').length,2);
  assert.equal(data.manualRecords.find(x=>x.linkedRecordId===tax.id).actualAmount,0);
  assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  console.log('PASS Cash Control bonus+linked PIT local E2E; 2026-Q4 => 2027-01; no production writes');
  await ctx.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1}).finally(()=>deleteApp(app));
