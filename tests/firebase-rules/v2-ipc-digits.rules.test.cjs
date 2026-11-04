'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
const core=require('../../backend/payment-index-v2-core.cjs');
let env,staff,admin,writers;
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
const base={project:'ELYSIAN',contractNo:'LAB-002',ipcNo:'IPC017',paymentMonth:month,amount:100,
  createdByUid:'staff',createdBy:'Staff',source:'excel-paste'};
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Firestore Emulator is required');
 const {createPaymentWriters}=await import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-writers.mjs')));
 env=await initializeTestEnvironment({projectId:'demo-payment-index-v2',firestore:{
   host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.V2_STAGING_ONLY'),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await sdk.setDoc(sdk.doc(db,'authUsers/staff'),{role:'Staff',active:true,disabled:false});
   await sdk.setDoc(sdk.doc(db,'authUsers/admin'),{role:'Admin',active:true,disabled:false});
 });
 staff=env.authenticatedContext('staff').firestore();
 admin=env.authenticatedContext('admin').firestore();
 writers=createPaymentWriters(sdk,core.computeIndexV2,
   {indexFields:['ipcDigitsV2'],sourceFields:['ipcNo']});
});
test.after(async()=>{if(env)await env.cleanup();});
test('Staff can add a Payment; authenticated Rules verify exact indexed IPC digits',async()=>{
 const ref=await writers.addDoc(sdk.collection(staff,'payments'),base);
 const record=(await sdk.getDoc(ref)).data();
 assert.equal(record.ipcDigitsV2,'017');
 assert.equal(record.duplicateKeyV1,undefined);
 assert.equal((await sdk.getDocs(sdk.query(sdk.collection(staff,'payments'),sdk.where('ipcDigitsV2','==','017')))).size,1);
});
test('Staff cannot forge, delete or tamper with the new key',async()=>{
 const ref=sdk.doc(staff,'payments/forgery');
 await assert.rejects(sdk.setDoc(ref,{...base,ipcDigitsV2:'999'}));
 await assert.rejects(sdk.setDoc(ref,{...base,duplicateKeyV1:'fake',ipcDigitsV2:'017'}));
 await writers.setDoc(ref,base);
 await assert.rejects(sdk.updateDoc(ref,{ipcDigitsV2:'999'}));
 await assert.rejects(sdk.updateDoc(ref,{ipcDigitsV2:sdk.deleteField()}));
 await assert.rejects(sdk.updateDoc(ref,{ipcNo:'IPC999'})); // stale index denied
 await assert.rejects(sdk.updateDoc(ref,{duplicateKeyV1:'forged'}));
 await assert.rejects(sdk.updateDoc(ref,{mepLookupV1:true}));
 await assert.rejects(sdk.updateDoc(ref,{paymentLookupSchemaV1:1}));
 const before=(await sdk.getDoc(ref)).data();
 assert.equal(before.ipcNo,'IPC017');assert.equal(before.ipcDigitsV2,'017');
});
test('Staff source edits update the lookup field atomically; normal fields remain editable',async()=>{
 const ref=sdk.doc(staff,'payments/edit');await writers.setDoc(ref,base);
 await writers.updateDoc(ref,{ipcNo:'IPC018',remark:'Updated'});
 const row=(await sdk.getDoc(ref)).data();
 assert.equal(row.ipcNo,'IPC018');assert.equal(row.ipcDigitsV2,'018');assert.equal(row.remark,'Updated');
 const old=await sdk.getDocs(sdk.query(sdk.collection(staff,'payments'),sdk.where('ipcDigitsV2','==','017')));
 assert.ok(!old.docs.some(d=>d.id==='edit'));
});
test('Non-owner Admin also cannot commit malformed key; compatible staff workflow preserves it',async()=>{
 const ref=sdk.doc(admin,'payments/admin-test');
 await assert.rejects(sdk.setDoc(ref,{...base,ipcDigitsV2:'wrong'}));
 await writers.setDoc(ref,{...base,createdByUid:'admin'});
 const row=(await sdk.getDoc(ref)).data();assert.equal(row.ipcDigitsV2,'017');
 const staffRef=sdk.doc(staff,'payments/workflow');await writers.setDoc(staffRef,base);
 await sdk.updateDoc(staffRef,{processPaper:'done'});
 assert.equal((await sdk.getDoc(staffRef)).data().ipcDigitsV2,'017');
});

test('Legacy rows without V2 remain editable for workflow, but IPC changes need a valid key',async()=>{
 const ref=sdk.doc(staff,'payments/legacy-v2-transition');
 await env.withSecurityRulesDisabled(async ctx=>{
   await sdk.setDoc(sdk.doc(ctx.firestore(),'payments/legacy-v2-transition'),base);
 });
 await sdk.updateDoc(ref,{processPaper:'in-review'});
 assert.equal((await sdk.getDoc(ref)).data().ipcDigitsV2,undefined);
 await assert.rejects(sdk.updateDoc(ref,{ipcNo:'IPC099'}));
 await writers.updateDoc(ref,{ipcNo:'IPC099'});
 assert.equal((await sdk.getDoc(ref)).data().ipcDigitsV2,'099');
 await assert.rejects(sdk.updateDoc(ref,{ipcDigitsV2:sdk.deleteField()}));
});
