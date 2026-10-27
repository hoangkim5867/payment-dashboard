'use strict';
// Run ONLY with a Firestore Emulator, project demo-payment-security. No live data.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const rules=fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8');
const admin='HTx2QuATHxh8zgAawwreg88w65M2';
let env;
test.before(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Use Firebase Emulator; DO NOT run against production');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 env=await initializeTestEnvironment({projectId:'demo-payment-security',firestore:{host,port:Number(port),rules}});
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await db.doc(`authUsers/${admin}`).set({role:'Admin'});
  await db.doc('authUsers/staff-approved').set({role:'Staff'});
  await db.doc('paymentHistorySources2026/raw').set({rowCount:812,rows:[{amount:1}]});
  await db.doc('systemConfig/paymentLookupV1').set({ready:false,schemaVersion:1});
  await db.doc('cash_control_private/history').set({amount:1});
  await db.doc('payments/seed').set({amount:1});
 });
});
test.after(async()=>{if(env)await env.cleanup();});
test('anonymous/unapproved access denied',async()=>{
 await assertFails(env.unauthenticatedContext().firestore().doc('paymentHistorySources2026/raw').get());
 await assertFails(env.authenticatedContext('unapproved').firestore().doc('paymentHistorySources2026/raw').get());
});
test('approved Staff may read private historical source for MEP; cannot overwrite',async()=>{
 const db=env.authenticatedContext('staff-approved').firestore();
 await assertSucceeds(db.doc('paymentHistorySources2026/raw').get());
 await assertFails(db.doc('paymentHistorySources2026/raw').update({rowCount:0}));
 await assertFails(db.collection('paymentHistorySources2026').get());
 await assertFails(db.doc('systemConfig/paymentLookupV1').update({ready:true}));
 await assertSucceeds(db.doc('payments/seed').get()); // existing broad Rules left intact
});
test('trusted Admin may write protected history and marker',async()=>{
 const db=env.authenticatedContext(admin).firestore();
 await assertSucceeds(db.doc('paymentHistorySources2026/raw').update({rowCount:812}));
 await assertSucceeds(db.doc('systemConfig/paymentLookupV1').update({ready:false}));
});
test('Cash Control private email gate still works',async()=>{
 await assertFails(env.authenticatedContext('staff-approved',{email:'staff@example.com'}).firestore().doc('cash_control_private/history').get());
 await assertSucceeds(env.authenticatedContext(admin,{email:'lehoangoanh@cscecmep.internal',email_verified:true}).firestore().doc('cash_control_private/history').get());
});
