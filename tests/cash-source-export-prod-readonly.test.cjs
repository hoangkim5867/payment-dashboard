'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
test('Cash Control production source export UI has one guarded entry and uses local file only',()=>{
 for(const id of ['ccSyncSourceExportTools','ccSyncSourceMonth','ccSyncSourceExportOnly']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(html,/<details id="ccSyncSourceExportTools"/);
 assert.match(html,/ccSyncSourceExportOnly'\)\?\.addEventListener\('click',ccSyncSourceExportOnly\)/);
 const start=html.indexOf('async function ccSyncSourceExportOnly(){');
 const end=html.indexOf('async function ccSyncMultiProjectManual(){',start);
 assert.ok(start>0&&end>start);
 const code=html.slice(start,end);
 assert.match(code,/!currentAuthUser\|\|!isCashControlOwner\(\)\|\|firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(code,/ccSyncSourceMonth/);
 assert.match(code,/loadProjectPayments\(project,\{force:true,quiet:true,refresh:false\}\)/);
 assert.match(code,/sourceAuthenticated:false,sourceComplete:false/);
 assert.match(code,/ccSyncFoxconnAuditRows\(month\)/);
 assert.match(code,/sourceClass/);
 assert.match(code,/CASH_SYNC_REAL_SOURCE_REVIEW_V1/);
 assert.match(code,/application\/json/);
 assert.doesNotMatch(code,/setDoc\(|addDoc\(|updateDoc\(|deleteDoc\(|writeBatch\(|runTransaction\(|onSnapshot\(|fetch\(|window\.open\(/);
 assert.doesNotMatch(code,/ccGoogleSyncToken|refreshToken|idToken|password/i);
});
test('historical Payment and Google writer functionality not modified by source-only export',()=>{
 assert.match(html,/id="ccSyncPaymentPreflightCount"/);
 assert.match(html,/id="ccSyncPaymentPreflightLoad"/);
 assert.match(html,/id="ccSyncProjectCompareGoogle"/);
 assert.match(html,/id="ccSyncMultiProjectManual"/);
 assert.match(html,/async function ccSyncMultiProjectManual\(\)/);
 assert.match(html,/function ccSyncFoxconnAuditRows\(month\)/);
});
