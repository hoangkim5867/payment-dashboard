'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeApp:adminApp,deleteApp:deleteAdmin}=require('firebase-admin/app'),{getAuth:adminAuth}=require('firebase-admin/auth'),{getFirestore:adminStore}=require('firebase-admin/firestore');
const {initializeApp,deleteApp}=require('firebase/app');
const {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,terminate}=require('firebase/firestore');
test('real Auth Emulator disabled account denies new sign-in; profile disable revokes existing token data access',async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Local emulators required');
 const admin=adminApp({projectId:'demo-payment-security'},'disable-admin'),adb=adminStore(admin),aa=adminAuth(admin);
 const uid='disabled-auth-fixture';try{await aa.deleteUser(uid)}catch(e){if(e.code!=='auth/user-not-found')throw e}
 await aa.createUser({uid,email:'disabled-test@cscecmep.internal',password:'EmulatorOnly123!',emailVerified:true});
 await adb.collection('authUsers').doc(uid).set({role:'staff'});await adb.collection('payments').doc('disabled-check').set({amount:1});
 const app=initializeApp({projectId:'demo-payment-security',apiKey:'demo-api-key'},'disable-client'),auth=getAuth(app),db=getFirestore(app);
 connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);
 try{
  await signInWithEmailAndPassword(auth,'disabled-test@cscecmep.internal','EmulatorOnly123!');
  assert.equal((await getDocFromServer(doc(db,'payments/disabled-check'))).exists(),true);
  await aa.updateUser(uid,{disabled:true});
  // Firebase Rules cannot read the Auth user record. Deny the profile first
  // when disabling an account so previously-issued ID tokens cannot read data.
  await adb.collection('authUsers').doc(uid).update({disabled:true});
  await assert.rejects(getDocFromServer(doc(db,'payments/disabled-check')),e=>e.code==='permission-denied');
  await signOut(auth);
  await assert.rejects(signInWithEmailAndPassword(auth,'disabled-test@cscecmep.internal','EmulatorOnly123!'),e=>e.code==='auth/user-disabled');
 }finally{await terminate(db);await deleteApp(app);await deleteAdmin(admin)}
});
