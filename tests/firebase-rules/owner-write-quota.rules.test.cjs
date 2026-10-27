'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
const ROOT=path.resolve(__dirname,'../..');
const OWNER='HTx2QuATHxh8zgAawwreg88w65M2';
const MAIL='lehoangoanh@cscecmep.internal';
test('owner writes Payment even without authUsers; Staff and unknown accounts cannot',async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Firestore emulator only');
 const env=await initializeTestEnvironment({projectId:'demo-payment-owner-quota',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(ROOT,'security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
 try{
   await env.clearFirestore();
   await env.withSecurityRulesDisabled(async c=>{
     const db=c.firestore();
     await sdk.setDoc(sdk.doc(db,'payments','existing'),{paymentMonth:'2026-10',amount:100,processPaper:''});
   });
   const owner=env.authenticatedContext(OWNER,{email:MAIL}).firestore();
   const fake=env.authenticatedContext('untrusted',{email:MAIL}).firestore();
   const staff=env.authenticatedContext('staff',{email:'staff@example.test'}).firestore();
   await assertSucceeds(sdk.updateDoc(sdk.doc(owner,'payments','existing'),{processPaper:'done',amount:200}));
   await assertFails(sdk.updateDoc(sdk.doc(fake,'payments','existing'),{amount:300}));
   await assertFails(sdk.updateDoc(sdk.doc(staff,'payments','existing'),{amount:300}));
   await assertFails(sdk.setDoc(sdk.doc(owner,'payments','new'),{paymentMonth:'2026-10',amount:100}));
   await assertFails(sdk.deleteDoc(sdk.doc(owner,'payments','existing')));
   await assertFails(sdk.updateDoc(sdk.doc(owner,'payments','existing'),{paymentMonth:'INVALID'}));
   await env.withSecurityRulesDisabled(async c=>{
     const saved=await sdk.getDoc(sdk.doc(c.firestore(),'payments','existing'));
     assert.equal(saved.data().amount,200);
   });
 }finally{await env.cleanup();}
});
