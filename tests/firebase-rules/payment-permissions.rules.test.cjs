'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
let env;const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
const previous=month==='2026-01'?'2025-12':month.slice(0,5)+String(Number(month.slice(5))-1).padStart(2,'0');
const pending={paymentMonth:month,amount:1000,project:'EATON PARK',contractNo:'C1',ipcNo:'IPC1',createdByUid:'staff',deleted:false};
const as=uid=>env.authenticatedContext(uid).firestore();
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 env=await initializeTestEnvironment({projectId:'demo-payment-permission-policy',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
 await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  for(const [uid,role] of [['admin','Admin'],['staff','Staff'],['other','Staff']])await sdk.setDoc(sdk.doc(db,'authUsers',uid),{role,temporaryPaymentMonthAccess:previous});
  for(const [id,row] of Object.entries({pending,old:{...pending,paymentMonth:previous},paid:{...pending,processActualAmount:1000,processPaymentDate:month+'-01'},cancelled:{...pending,monthOutcome:'cancelled'},carried:{...pending,monthOutcome:'carried_forward'},deleted:{...pending,deleted:true},ownImport:{...pending,source:'excel-paste',importBatchId:'own'},otherImport:{...pending,source:'excel-paste',importBatchId:'other',createdByUid:'other'}}))await sdk.setDoc(sdk.doc(db,'payments',id),row);
 });
});
test.after(async()=>{if(env)await env.cleanup()});
test('Staff creates pending current month and edits standard form/process fields',async()=>{
 await assertSucceeds(sdk.setDoc(sdk.doc(as('staff'),'payments/new'),pending));
 await assertSucceeds(sdk.updateDoc(sdk.doc(as('staff'),'payments/new'),{amount:1200,remark:'Updated',processPlatformPlan:'done',processPaper:'completed',processSettlement:'done',processPaymentNo:'TEST',processPlatformPayment:'done'}));
});
test('Staff may choose a plan month in Add/Import but cannot forge creator or admin results',async()=>{
 for(const value of [previous,'2099-01'])await assertSucceeds(sdk.setDoc(sdk.doc(as('staff'),'payments/chosen-month-'+value),{...pending,paymentMonth:value}));
 for(const patch of [{createdByUid:'other'},{processActualAmount:1000,processPaymentDate:month+'-01'},{processApproval:'done'},{processBanking:'done'},{monthOutcome:'cancelled'},{uncDriveFileId:'forged'},{planReviewStatus:'included'}])await assertFails(sdk.setDoc(sdk.doc(as('staff'),'payments/forged'),{...pending,...patch}));
});
for(const field of ['processActualAmount','processPaymentDate','processApproval','processBanking','monthOutcome','deleted','archived','archiveState','uncDriveFileId','planReviewStatus','createdByUid'])test('Staff cannot mutate privileged field '+field,async()=>{
 const value=['deleted','archived'].includes(field)?true:field==='processActualAmount'?500:field==='paymentMonth'?previous:'forged';
 await assertFails(sdk.updateDoc(sdk.doc(as('staff'),'payments/pending'),{[field]:value}));
});
test('Staff Bulk Edit can move a pending current row to another plan month',async()=>{
 const ref=sdk.doc(as('staff'),'payments/move');await assertSucceeds(sdk.setDoc(ref,pending));
 await assertSucceeds(sdk.updateDoc(ref,{paymentMonth:previous}));
 await assertFails(sdk.updateDoc(ref,{remark:'cannot edit historical row after moving'}));
});
test('Staff can finish a paid current-month workflow without changing the payment result',async()=>{
 const ref=sdk.doc(as('staff'),'payments/paid');
 await assertSucceeds(sdk.updateDoc(ref,{processPlatformPlan:'done',processPaper:'stamp_request',processSettlement:'done'}));
 await assertSucceeds(sdk.updateDoc(ref,{processPaymentNo:'PLAN-PAID',processPlatformPayment:'done'}));
 const snap=await sdk.getDoc(ref);
 assert.equal(snap.data().processPaymentDate,month+'-01');
 assert.equal(snap.data().processActualAmount,1000);
 for(const patch of [
  {processActualAmount:2000},{processPaymentDate:month+'-02'},
  {amount:1200},{paymentMonth:previous},{processApproval:'done'},
  {processBanking:'done'},{uncDriveFileId:'forged'},
  {processPlatformPlan:'',processActualAmount:2000},
  {remark:'Should remain locked'}
 ])await assertFails(sdk.updateDoc(ref,patch));
});
test('Staff cannot edit paid workflow in historical month, or cancelled/carried/deleted rows',async()=>{
 for(const id of ['old','cancelled','carried','deleted']) {
  await assertFails(sdk.updateDoc(sdk.doc(as('staff'),'payments',id),{processPlatformPlan:'done'}));
 }
 const ref=sdk.doc(as('admin'),'payments/old');
 await assertSucceeds(sdk.updateDoc(ref,{processActualAmount:1000,processPaymentDate:previous+'-01'}));
 await assertFails(sdk.updateDoc(sdk.doc(as('staff'),'payments/old'),{processPlatformPlan:'done'}));
});
for(const id of ['old','paid','cancelled','carried','deleted'])test('Staff cannot edit locked row '+id,async()=>{await assertFails(sdk.updateDoc(sdk.doc(as('staff'),'payments',id),{amount:1}))});
test('historic view grant remains read-only and duplicate lookup remains permitted',async()=>{
 await assertSucceeds(sdk.getDoc(sdk.doc(as('staff'),'payments/old')));
 await assertSucceeds(sdk.getDocs(sdk.collection(as('staff'),'payments')));
 await assertFails(sdk.updateDoc(sdk.doc(as('staff'),'payments/old'),{amount:1}));
});
test('Staff Undo is limited to own current-month import, normal purge denied',async()=>{
 await assertSucceeds(sdk.deleteDoc(sdk.doc(as('staff'),'payments/ownImport')));
 for(const id of ['pending','old','paid','otherImport'])await assertFails(sdk.deleteDoc(sdk.doc(as('staff'),'payments',id)));
});
test('Admin historical correction, carry, payment result, UNC and purge remain available',async()=>{
 await assertSucceeds(sdk.updateDoc(sdk.doc(as('admin'),'payments/old'),{amount:950,ipcNo:'IPC-CORRECTED',processActualAmount:950,processPaymentDate:previous+'-01',uncDriveFileId:'test-only'}));
 await assertSucceeds(sdk.updateDoc(sdk.doc(as('admin'),'payments/pending'),{monthOutcome:'carried_forward'}));
 await assertSucceeds(sdk.deleteDoc(sdk.doc(as('admin'),'payments/deleted')));
});
test('profile privacy, role escalation and nested bypass are denied',async()=>{
 await assertSucceeds(sdk.getDoc(sdk.doc(as('staff'),'authUsers/staff')));
 await assertFails(sdk.getDoc(sdk.doc(as('staff'),'authUsers/other')));
 await assertFails(sdk.getDocs(sdk.collection(as('staff'),'authUsers')));
 await assertSucceeds(sdk.getDocs(sdk.collection(as('admin'),'authUsers')));
 await assertFails(sdk.updateDoc(sdk.doc(as('staff'),'authUsers/staff'),{role:'Admin'}));
 await assertFails(sdk.setDoc(sdk.doc(as('staff'),'payments/pending/nested/bypass'),{amount:1}));
});
test('both create and update reject invalid month/type and oversized critical fields',async()=>{
 const ref=sdk.doc(as('admin'),'payments/validation');await assertSucceeds(sdk.setDoc(ref,pending));
 for(const patch of [{paymentMonth:'2026-13'},{paymentMonth:123},{amount:{}},{project:'x'.repeat(4097)}]){
  await assertFails(sdk.setDoc(sdk.doc(as('admin'),'payments/invalid'),{...pending,...patch}));
  await assertFails(sdk.updateDoc(ref,patch));
 }
});

