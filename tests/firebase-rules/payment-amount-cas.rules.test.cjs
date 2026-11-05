'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
let env, db, paymentRef;
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
before(async()=>{
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Requires local Firestore Emulator');
  const rules=fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.AMOUNT_CAS_FROM_USER_20261104_STAGING_ONLY'),'utf8');
  env=await initializeTestEnvironment({projectId:'demo-payment-amount-cas',firestore:{host:'127.0.0.1',port:8080,rules}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await sdk.setDoc(sdk.doc(db,'authUsers/staff-cas'),{role:'Staff',active:true,disabled:false});
    await sdk.setDoc(sdk.doc(db,'payments/amount-cas'),{
      project:'EATON',contractNo:'LAB-007',contractDigitsV2:'007',ipcNo:'IPC014',
      paymentMonth:month,amount:1400000000,createdByUid:'staff-cas',deleted:false,
      updatedAt:sdk.Timestamp.fromMillis(1730000000000),bankAccount:'bank unchanged',
      processPaper:'done'
    });
  });
  db=env.authenticatedContext('staff-cas').firestore();
  paymentRef=sdk.doc(db,'payments/amount-cas');
});
after(async()=>{if(env)await env.cleanup();});
test('Staff amount-only CAS succeeds and preserves unrelated payment fields',async()=>{
  await assertSucceeds(sdk.updateDoc(paymentRef,{
    amount:1500000000,
    amountEditGuard:{baseAmount:1400000000,nonce:'123e4567-e89b-12d3-a456-426614174000'},
    updatedAt:sdk.serverTimestamp(),updatedByUid:'staff-cas',updatedBy:'Staff'
  }));
  const snapshot=await sdk.getDoc(paymentRef);
  assert.equal(snapshot.data().amount,1500000000);
  assert.equal(snapshot.data().bankAccount,'bank unchanged');
  assert.equal(snapshot.data().processPaper,'done');
});
test('stale Staff amount CAS is denied without overwriting newer amount',async()=>{
  await assertFails(sdk.updateDoc(paymentRef,{
    amount:1800000000,
    amountEditGuard:{baseAmount:1400000000,nonce:'123e4567-e89b-12d3-a456-426614174001'},
    updatedAt:sdk.serverTimestamp(),updatedByUid:'staff-cas'
  }));
  assert.equal((await sdk.getDoc(paymentRef)).data().amount,1500000000);
});
test('Staff amount guard cannot carry extra mutations',async()=>{
  await assertFails(sdk.updateDoc(paymentRef,{
    amount:1800000000,
    processPaper:'changed',
    amountEditGuard:{baseAmount:1500000000,nonce:'123e4567-e89b-12d3-a456-426614174002'},
    updatedAt:sdk.serverTimestamp(),updatedByUid:'staff-cas'
  }));
  assert.equal((await sdk.getDoc(paymentRef)).data().amount,1500000000);
});
