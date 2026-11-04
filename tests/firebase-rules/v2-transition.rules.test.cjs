'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
const {computeIndexV2}=require('../../backend/payment-index-v2-core.cjs');
let env,staff,admin;
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
const base={project:'ELYSIAN',contractNo:'LAB-002',ipcNo:'IPC017',paymentMonth:month,amount:100,createdByUid:'staff',source:'excel-paste'};
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 env=await initializeTestEnvironment({projectId:'demo-payment-v2-transition',firestore:{
  host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.V2_TRANSITION_REVIEW_ONLY'),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await sdk.setDoc(sdk.doc(db,'authUsers/staff'),{role:'Staff',active:true,disabled:false});
   await sdk.setDoc(sdk.doc(db,'authUsers/admin'),{role:'Admin',active:true,disabled:false});
 });
 staff=env.authenticatedContext('staff').firestore();
 admin=env.authenticatedContext('admin').firestore();
});
test.after(async()=>{if(env)await env.cleanup()});
test('Transition Rules keep legacy Staff create operational with missing V2',async()=>{
 const ref=sdk.doc(staff,'payments/legacy-new');
 await sdk.setDoc(ref,base);
 const row=(await sdk.getDoc(ref)).data();
 assert.equal(row.contractDigitsV2,undefined);
 await sdk.updateDoc(ref,{processPaper:'received'});
 await sdk.updateDoc(ref,{contractNo:'LAB-003'}); // legacy contract edits remain available only during transition
 assert.equal((await sdk.getDoc(ref)).data().contractDigitsV2,undefined);
});
test('Transition Rules reject any forged supplied contract key and V1 metadata',async()=>{
 await assert.rejects(sdk.setDoc(sdk.doc(staff,'payments/bad-v2'),{...base,contractDigitsV2:'999'}));
 await assert.rejects(sdk.setDoc(sdk.doc(staff,'payments/bad-v1'),{...base,duplicateKeyV1:'false'}));
 const indexed=sdk.doc(staff,'payments/indexed');
 await sdk.setDoc(indexed,{...base,...computeIndexV2(base)});
 await assert.rejects(sdk.updateDoc(indexed,{contractDigitsV2:'999'}));
 await assert.rejects(sdk.updateDoc(indexed,{contractDigitsV2:sdk.deleteField()}));
 await sdk.updateDoc(indexed,{contractNo:'LAB-003'}); // old cached Staff client leaves stale index temporarily
 assert.equal((await sdk.getDoc(indexed)).data().contractDigitsV2,'002');
 await sdk.updateDoc(indexed,{contractNo:'LAB-003',...computeIndexV2({...base,contractNo:'LAB-003'})});
 const row=(await sdk.getDoc(indexed)).data();
 assert.equal(row.contractNo,'LAB-003');assert.equal(row.contractDigitsV2,'003');
});
test('Transition Rules allow Admin legacy creates, Staff cannot set protected marker',async()=>{
 const a=sdk.doc(admin,'payments/admin-legacy');
 await sdk.setDoc(a,{...base,createdByUid:'admin'});
 assert.equal((await sdk.getDoc(a)).exists(),true);
 await assert.rejects(sdk.setDoc(sdk.doc(staff,'systemConfig/paymentLookupV2'),{ready:true,schemaVersion:2}));
});
