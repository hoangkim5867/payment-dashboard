'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc,deleteDoc,deleteField,serverTimestamp}=require('firebase/firestore');
const ADMIN='HTx2QuATHxh8zgAawwreg88w65M2';
let env;
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local emulator required');
 env=await initializeTestEnvironment({projectId:'demo-payment-risk-matrix',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const [uid,data] of Object.entries({[ADMIN]:{role:'Admin'},otherAdmin:{role:'Admin'},staff:{role:'Staff'},disabled:{role:'Staff',disabled:true},inactive:{role:'Staff',active:false},invalid:{role:'Visitor'}}))await setDoc(doc(db,'authUsers',uid),data);
  for(const p of ['payments/seed','activityLogs/seed','cash_control_private/seed','paymentHistorySources2026/raw','systemConfig/paymentLookupV1'])await setDoc(doc(db,p),{amount:1});
 });
});
test.after(async()=>{if(env)await env.cleanup()});
const dbFor=(uid,claims={})=>uid?env.authenticatedContext(uid,claims).firestore():env.unauthenticatedContext().firestore();
for(const uid of [null,'unknown','disabled','inactive','invalid'])test(`deny all protected access for ${uid}`,async()=>{
 const db=dbFor(uid,{email:'lehoangoanh@cscecmep.internal',email_verified:true});
 for(const p of ['authUsers/staff','payments/seed','activityLogs/seed','cash_control_private/seed','paymentHistorySources2026/raw','systemConfig/paymentLookupV1']){
  await assertFails(getDoc(doc(db,p)));await assertFails(setDoc(doc(db,p),{amount:2}));
 }
});
test('Staff current-month own import CRUD preserved, cannot change profiles or marker',async()=>{
 const db=dbFor('staff');
 await assertSucceeds(getDoc(doc(db,'authUsers/staff')));
 await assertFails(updateDoc(doc(db,'authUsers/staff'),{role:'Admin'}));
 await assertFails(setDoc(doc(db,'authUsers/forged'),{role:'Admin'}));
 const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
 await assertSucceeds(setDoc(doc(db,'payments/crud'),{amount:2,paymentMonth:month,createdByUid:'staff',source:'excel-paste',importBatchId:'test-own'}));
 await assertSucceeds(updateDoc(doc(db,'payments/crud'),{amount:3}));
 await assertSucceeds(deleteDoc(doc(db,'payments/crud')));
 await assertFails(setDoc(doc(db,'systemConfig/paymentLookupV1'),{ready:true}));
});
test('audit logs are append-only and bind the actor UID',async()=>{
 const db=dbFor('staff');
 await assertSucceeds(setDoc(doc(db,'activityLogs/new'),{operatorUid:'staff',action:'EDIT',createdAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db,'activityLogs/forged'),{operatorUid:ADMIN,action:'EDIT',createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db,'activityLogs/seed'),{amount:0}));
 await assertFails(deleteDoc(doc(db,'activityLogs/seed')));
 await assertFails(deleteDoc(doc(dbFor(ADMIN),'activityLogs/seed')));
});
test('Cash private requires approved owner UID and email, including unverified internal account',async()=>{
 await assertFails(getDoc(doc(dbFor('staff',{email:'lehoangoanh@cscecmep.internal',email_verified:false}),'cash_control_private/seed')));
 await assertFails(getDoc(doc(dbFor('staff',{email:'staff@example.com',email_verified:true}),'cash_control_private/seed')));
 await assertSucceeds(getDoc(doc(dbFor(ADMIN,{email:'lehoangoanh@cscecmep.internal',email_verified:true}),'cash_control_private/seed')));
 await assertSucceeds(getDoc(doc(dbFor(ADMIN,{email:'lehoangoanh@cscecmep.internal',email_verified:false}),'cash_control_private/seed')));
 await assertFails(getDoc(doc(dbFor('staff',{email:'lehoangoanh@cscecmep.internal',email_verified:true}),'cash_control_private/seed')));
 await assertFails(getDoc(doc(dbFor(ADMIN,{email:'other@example.com',email_verified:true}),'cash_control_private/seed')));
});
test('trusted Admin profile management remains available',async()=>{
 await assertSucceeds(setDoc(doc(dbFor(ADMIN),'authUsers/new-staff'),{role:'Staff',displayName:'Test'}));
 await assertSucceeds(updateDoc(doc(dbFor(ADMIN),'authUsers/new-staff'),{disabled:true}));
});

test('only owner Admin can set/remove IPC dossier links, Staff may read',async()=>{
 const paymentId='link-policy-test';
 const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'payments',paymentId),{paymentMonth:month,amount:100,project:'ELYSIAN',contractNo:'SUPL-050',ipcNo:'IPC001'});
 });
 const owner=doc(dbFor(ADMIN),'payments',paymentId);
 const staff=doc(dbFor('staff'),'payments',paymentId);
 const otherAdmin=doc(dbFor('otherAdmin'),'payments',paymentId);
 const url='https://drive.google.com/drive/folders/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn';
 await assertSucceeds(updateDoc(owner,{ipcDocumentUrl:url,ipcDocumentUpdatedByUid:ADMIN,ipcDocumentUpdatedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(staff));
 await assertFails(updateDoc(staff,{ipcDocumentUrl:'https://drive.google.com/file/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/view'}));
 await assertFails(updateDoc(otherAdmin,{ipcDocumentUrl:url,ipcDocumentUpdatedByUid:'otherAdmin',ipcDocumentUpdatedAt:serverTimestamp()}));
 await assertFails(updateDoc(owner,{ipcDocumentUrl:'https://example.org/invalid',ipcDocumentUpdatedByUid:ADMIN}));
 await assertSucceeds(updateDoc(staff,{processPaper:'done'}));
 await assertFails(setDoc(doc(dbFor('staff'),'payments','staff-forged-dossier'),{paymentMonth:month,amount:100,createdByUid:'staff',ipcDocumentUrl:url}));
 await assertSucceeds(updateDoc(owner,{ipcDocumentUrl:deleteField(),ipcDocumentUpdatedByUid:deleteField(),ipcDocumentUpdatedAt:deleteField()}));
});
