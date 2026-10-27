'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const a=require('firebase-admin/app'),aa=require('firebase-admin/auth'),ad=require('firebase-admin/firestore');
const app=require('firebase/app'),auth=require('firebase/auth'),s=require('firebase/firestore');
test('real unverified Auth Emulator owner signs in and uses Cash and Plan; disabled profile revokes existing token',async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Both local Emulators required');
 // Auth Emulator routes fake Web API keys to its configured demo project.
 const projectId='demo-payment-security',uid='HTx2QuATHxh8zgAawwreg88w65M2';
 const admin=a.initializeApp({projectId},'owner-auth-regression');
 let env,web,db;
 try{
  env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
  const users=aa.getAuth(admin),store=ad.getFirestore(admin);
  try{await users.deleteUser(uid)}catch(e){if(e.code!=='auth/user-not-found')throw e}
  await users.createUser({uid,email:'lehoangoanh@cscecmep.internal',password:'EmulatorOnly123!',emailVerified:false});
  await store.doc('authUsers/'+uid).set({role:'admin'});
  await store.doc('cash_control_private/owner-auth-test').set({manualRecords:[],revision:1});
  await store.doc('payments/owner-auth-test').set({paymentMonth:'2026-10',amount:100});
  web=app.initializeApp({projectId,apiKey:'emulator-only-key'},'owner-auth-web');
  const login=auth.getAuth(web);auth.connectAuthEmulator(login,'http://127.0.0.1:9099',{disableWarnings:true});
  db=s.getFirestore(web);s.connectFirestoreEmulator(db,'127.0.0.1',8080);
  const result=await auth.signInWithEmailAndPassword(login,'lehoangoanh@cscecmep.internal','EmulatorOnly123!');
  assert.equal(result.user.uid,uid);assert.equal(result.user.emailVerified,false);
  assert.equal((await result.user.getIdTokenResult()).claims.email_verified,false);
  assert.equal((await s.getDocFromServer(s.doc(db,'cash_control_private/owner-auth-test'))).data().revision,1);
  await s.updateDoc(s.doc(db,'cash_control_private/owner-auth-test'),{revision:2});
  await s.updateDoc(s.doc(db,'payments/owner-auth-test'),{planLocked:true});
  await store.doc('authUsers/'+uid).update({disabled:true});
  await assert.rejects(s.getDocFromServer(s.doc(db,'cash_control_private/owner-auth-test')),e=>e.code==='permission-denied');
  await assert.rejects(s.updateDoc(s.doc(db,'payments/owner-auth-test'),{planLocked:false}),e=>e.code==='permission-denied');
 }finally{
  const store=ad.getFirestore(admin);
  await store.doc('authUsers/'+uid).set({role:'admin'});
  await store.doc('cash_control_private/owner-auth-test').delete();await store.doc('payments/owner-auth-test').delete();
  if(db)await s.terminate(db);if(web)await app.deleteApp(web);if(env)await env.cleanup();await a.deleteApp(admin);
 }
});
