'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds:yes,assertFails:no}=require('@firebase/rules-unit-testing');
const s=require('firebase/firestore');
const OWNER='HTx2QuATHxh8zgAawwreg88w65M2',EMAIL='lehoangoanh@cscecmep.internal';
let env;
const context=(uid=OWNER,claims={email:EMAIL,email_verified:false})=>env.authenticatedContext(uid,claims).firestore();
const cash=db=>s.doc(db,'cash_control_private/identity-test');
async function profile(data){await env.withSecurityRulesDisabled(c=>s.setDoc(s.doc(c.firestore(),'authUsers',OWNER),data));}
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator only');
 env=await initializeTestEnvironment({projectId:'demo-payment-owner-identity',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  for(const [id,role]of [[OWNER,'admin'],['other-admin','admin'],['staff','staff']])await s.setDoc(s.doc(c.firestore(),'authUsers',id),{role});
  await s.setDoc(cash(c.firestore()),{manualRecords:[],schemaVersion:3,revision:1});
  await s.setDoc(s.doc(c.firestore(),'payments/plan-identity'),{paymentMonth:'2026-10',amount:100});
 });
});
test.after(async()=>{if(env)await env.cleanup()});
test('existing internal owner with email_verified=false can read, create and update Cash',async()=>{
 const db=context();await yes(s.getDoc(cash(db)));
 await yes(s.setDoc(s.doc(db,'cash_control_private/identity-new'),{manualRecords:[],schemaVersion:3,revision:1}));
 await yes(s.updateDoc(cash(db),{revision:2}));
});
test('owner token without email_verified retains access',async()=>{await yes(s.getDoc(cash(context(OWNER,{email:EMAIL}))));});
test('verified or unverified email alone cannot impersonate owner UID',async()=>{
 for(const uid of ['other-admin','staff'])for(const verified of [false,true]){
  const db=context(uid,{email:EMAIL,email_verified:verified});
  await no(s.getDoc(cash(db)));await no(s.updateDoc(cash(db),{revision:99}));
  await no(s.updateDoc(s.doc(db,'payments/plan-identity'),{planLocked:true}));
 }
});
test('correct owner UID with wrong or absent email is denied',async()=>{
 for(const claims of [{email:'other@example.com',email_verified:true},{}])await no(s.getDoc(cash(context(OWNER,claims))));
});
test('disabled, inactive and invalid owner profiles revoke Cash and Plan access',async()=>{
 try{for(const data of [{role:'admin',disabled:true},{role:'admin',active:false},{role:'visitor'}]){
  await profile(data);const db=context();await no(s.getDoc(cash(db)));
  await no(s.updateDoc(cash(db),{revision:99}));
  await no(s.updateDoc(s.doc(db,'payments/plan-identity'),{planLocked:true}));
 }}finally{await profile({role:'admin'});}
});
test('missing owner profile denies and cannot self-bootstrap',async()=>{
 try{await env.withSecurityRulesDisabled(c=>s.deleteDoc(s.doc(c.firestore(),'authUsers',OWNER)));
  await no(s.getDoc(cash(context())));await no(s.setDoc(s.doc(context(),'authUsers',OWNER),{role:'admin'}));
 }finally{await profile({role:'admin'});}
});
test('unverified owner retains Plan Review and funding snapshot merge operations',async()=>{
 const db=context();await yes(s.updateDoc(s.doc(db,'payments/plan-identity'),{planLocked:true,planApprovedAmount:90}));
 const p=s.doc(db,'cash_flow_monthly_snapshots/2026-10');
 await yes(s.setDoc(p,{month:'2026-10',balances:{TEST:{balance:1}}}));
 await yes(s.setDoc(p,{projectLocks:{TEST:{locked:true}}},{merge:true}));
 await yes(s.getDoc(p));
});
test('identity repair preserves schema checks, private deletion and anonymous denial',async()=>{
 await no(s.updateDoc(cash(context()),{manualRecords:'invalid'}));
 await no(s.deleteDoc(cash(context())));
 await no(s.getDoc(cash(env.unauthenticatedContext().firestore())));
});
