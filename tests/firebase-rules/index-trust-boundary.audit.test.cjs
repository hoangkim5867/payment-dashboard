'use strict';
// Candidate Rules security regression. Run on local Emulator before any deploy.
// Indexed V1 remains disabled; no server-authenticated index writer is activated.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
const {computeIndexV1}=require('../../backend/payment-index-core.cjs');
const {buildSite}=require('../../deployment/build-site.cjs');
let env,db;
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
const base={paymentMonth:month,amount:1000,project:'Phú Hưng',contractNo:'PH-MEP001',ipcNo:'IPC1',createdByUid:'staff'};
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 const rulesPath=process.env.PAYMENT_RULES_AUDIT_FILE||path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY');
 env=await initializeTestEnvironment({projectId:'demo-payment-index-attack',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(rulesPath,'utf8')}});
 await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
  await sdk.setDoc(sdk.doc(c.firestore(),'authUsers/staff'),{role:'Staff'});
  await sdk.setDoc(sdk.doc(c.firestore(),'systemConfig/paymentLookupV1'),{ready:false});
 });db=env.authenticatedContext('staff').firestore();
});
test.after(async()=>{if(env)await env.cleanup()});
test('DENIED: Staff creates arbitrary lookup metadata and removes it',async()=>{
 const ref=sdk.doc(db,'payments/create-forgery');
 await assertFails(sdk.setDoc(ref,{...base,duplicateKeyV1:'forged',mepLookupV1:false,paymentLookupSchemaV1:1}));
 await assertSucceeds(sdk.setDoc(ref,base));
 await assertFails(sdk.updateDoc(ref,{duplicateKeyV1:sdk.deleteField(),paymentLookupSchemaV1:sdk.deleteField()}));
});
test('DENIED: Staff forges index alone or alongside permitted source edit',async()=>{
 for(const [id,patch] of [['index-only',{duplicateKeyV1:'forged',mepLookupV1:true,paymentLookupSchemaV1:99}],['source-and-index',{ipcNo:'IPC2',duplicateKeyV1:'stale',mepLookupV1:false,paymentLookupSchemaV1:1}]]){
  const ref=sdk.doc(db,'payments/'+id);await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),'payments',id),{...base,...computeIndexV1(base)}));
  await assertFails(sdk.updateDoc(ref,patch));
 }
});
test('Staff cannot authorize index activation; privileged business fields stay protected',async()=>{
 await assertFails(sdk.updateDoc(sdk.doc(db,'systemConfig/paymentLookupV1'),{ready:true}));
 await assertFails(sdk.deleteDoc(sdk.doc(db,'systemConfig/paymentLookupV1')));
 const ref=sdk.doc(db,'payments/protected');await sdk.setDoc(ref,base);
 for(const patch of [{processApproval:'done'},{processBanking:'done'},{processActualAmount:1000,processPaymentDate:month+'-01'},{createdByUid:'other'}])await assertFails(sdk.updateDoc(ref,patch));
});
test('merge, batch and transaction cannot modify lookup metadata',async()=>{
 const ref=sdk.doc(db,'payments/metadata-variants');
 await assertSucceeds(sdk.setDoc(ref,base));
 await assertFails(sdk.setDoc(ref,{mepLookupV1:true},{merge:true}));
 const batch=sdk.writeBatch(db);
 batch.update(ref,{duplicateKeyV1:'invalid'});
 await assertFails(batch.commit());
 await assertFails(sdk.runTransaction(db,async tx=>{
  await tx.get(ref);
  tx.update(ref,{paymentLookupSchemaV1:1});
 }));
 await assertSucceeds(sdk.updateDoc(ref,{ipcNo:'IPC-VALID'}));
});
test('release hold refuses unsafe V1 before producing deployment output',()=>{
 assert.throws(()=>buildSite({source:path.join(__dirname,'../../site'),output:path.join(__dirname,'../../build/blocked-index'),target:'production',enableIndexQueries:true}),/release blocked/);
});
