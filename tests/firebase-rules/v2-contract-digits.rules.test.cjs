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
   {indexFields:['contractDigitsV2'],sourceFields:['contractNo']});
});
test.after(async()=>{if(env)await env.cleanup();});
test('Staff can add a Payment; authenticated Rules verify exact indexed contract digits',async()=>{
 const ref=await writers.addDoc(sdk.collection(staff,'payments'),base);
 const record=(await sdk.getDoc(ref)).data();
 assert.equal(record.contractDigitsV2,'002');
 assert.equal(record.duplicateKeyV1,undefined);
 assert.equal((await sdk.getDocs(sdk.query(sdk.collection(staff,'payments'),sdk.where('contractDigitsV2','==','002')))).size,1);
});
test('Staff cannot forge, delete or tamper with the new key',async()=>{
 const ref=sdk.doc(staff,'payments/forgery');
 await assert.rejects(sdk.setDoc(ref,{...base,contractDigitsV2:'999'}));
 await assert.rejects(sdk.setDoc(ref,{...base,duplicateKeyV1:'fake',contractDigitsV2:'002'}));
 await writers.setDoc(ref,base);
 await assert.rejects(sdk.updateDoc(ref,{contractDigitsV2:'999'}));
 await assert.rejects(sdk.updateDoc(ref,{contractDigitsV2:sdk.deleteField()}));
 await assert.rejects(sdk.updateDoc(ref,{contractNo:'LAB-999'})); // stale index denied
 await assert.rejects(sdk.updateDoc(ref,{duplicateKeyV1:'forged'}));
 await assert.rejects(sdk.updateDoc(ref,{mepLookupV1:true}));
 await assert.rejects(sdk.updateDoc(ref,{paymentLookupSchemaV1:1}));
 const before=(await sdk.getDoc(ref)).data();
 assert.equal(before.contractNo,'LAB-002');assert.equal(before.contractDigitsV2,'002');
});
test('Staff source edits update the lookup field atomically; normal fields remain editable',async()=>{
 const ref=sdk.doc(staff,'payments/edit');await writers.setDoc(ref,base);
 await writers.updateDoc(ref,{contractNo:'LAB-003',ipcNo:'IPC018',remark:'Updated'});
 const row=(await sdk.getDoc(ref)).data();
 assert.equal(row.contractNo,'LAB-003');assert.equal(row.contractDigitsV2,'003');assert.equal(row.remark,'Updated');
 const old=await sdk.getDocs(sdk.query(sdk.collection(staff,'payments'),sdk.where('contractDigitsV2','==','002')));
 assert.ok(!old.docs.some(d=>d.id==='edit'));
});
test('Non-owner Admin also cannot commit malformed key; compatible staff workflow preserves it',async()=>{
 const ref=sdk.doc(admin,'payments/admin-test');
 await assert.rejects(sdk.setDoc(ref,{...base,contractDigitsV2:'wrong'}));
 await writers.setDoc(ref,{...base,createdByUid:'admin'});
 const row=(await sdk.getDoc(ref)).data();assert.equal(row.contractDigitsV2,'002');
 const staffRef=sdk.doc(staff,'payments/workflow');await writers.setDoc(staffRef,base);
 await sdk.updateDoc(staffRef,{processPaper:'done'});
 assert.equal((await sdk.getDoc(staffRef)).data().contractDigitsV2,'002');
});

test('Legacy rows without V2 remain editable for workflow, but contract changes need a valid key',async()=>{
 const ref=sdk.doc(staff,'payments/legacy-v2-transition');
 await env.withSecurityRulesDisabled(async ctx=>{
   await sdk.setDoc(sdk.doc(ctx.firestore(),'payments/legacy-v2-transition'),base);
 });
 await sdk.updateDoc(ref,{processPaper:'in-review',ipcNo:'IPC018'});
 assert.equal((await sdk.getDoc(ref)).data().contractDigitsV2,undefined);
 await assert.rejects(sdk.updateDoc(ref,{contractNo:'LAB-099'}));
 await writers.updateDoc(ref,{contractNo:'LAB-099'});
 assert.equal((await sdk.getDoc(ref)).data().contractDigitsV2,'099');
 await assert.rejects(sdk.updateDoc(ref,{contractDigitsV2:sdk.deleteField()}));
});

test('EATON P/P1 contract spelling aliases stay in one candidate query',async()=>{
 const a=sdk.doc(admin,'payments/eaton-p');
 const b=sdk.doc(admin,'payments/eaton-p1');
 await writers.setDoc(a,{...base,contractNo:'EATONPARKPMEP008',createdByUid:'admin'});
 await writers.setDoc(b,{...base,contractNo:'EATONPARKP1MEP008',createdByUid:'admin'});
 const docs=await sdk.getDocs(sdk.query(sdk.collection(admin,'payments'),sdk.where('contractDigitsV2','==','008')));
 assert.ok(docs.docs.some(d=>d.id==='eaton-p'));
 assert.ok(docs.docs.some(d=>d.id==='eaton-p1'));
});
