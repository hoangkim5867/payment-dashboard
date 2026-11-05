'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

test('V2 workflow-only Payment writes never require transaction reads',async()=>{
  const {createPaymentWriters}=await import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-writers.mjs')));
  const calls=[];
  const sdk={
    updateDoc:async(ref,...args)=>{calls.push({type:'update',args});},
    setDoc:async(ref,...args)=>{calls.push({type:'set',args});},
    writeBatch:()=>({
      update:(...args)=>calls.push({type:'batch-update',args}),
      set:(...args)=>calls.push({type:'batch-set',args}),
      delete:(...args)=>calls.push({type:'batch-delete',args}),
      commit:async()=>calls.push({type:'commit'})
    }),
    runTransaction:async()=>{calls.push({type:'transaction'});throw Error('Unexpected transaction');}
  };
  const ref={path:'payments/p1',parent:{path:'payments'},firestore:{}};
  const writers=createPaymentWriters(sdk,doc=>({contractDigitsV2:doc.contractNo||''}),{
    indexFields:['contractDigitsV2'],sourceFields:['contractNo']
  });
  await writers.updateDoc(ref,{processPaper:'done',updatedAt:{_methodName:'serverTimestamp'}});
  await writers.setDoc(ref,{processPlatformPayment:'done'},{merge:true});
  await writers.setDoc(ref,{processSignature:'done'},{mergeFields:['processSignature']});
  const batch=writers.writeBatch({});
  batch.update(ref,{processPaymentDate:'2026-11-05'});
  batch.set(ref,{processPaper:'done'},{merge:true});
  // Repeated edits of the same Payment in one batch still take the guarded path;
  // keep this batch to a single workflow update.
  const b2=writers.writeBatch({});
  b2.update(ref,{processPaymentDate:'2026-11-05'});
  await b2.commit();
  assert.deepEqual(calls.map(c=>c.type),['update','set','set','batch-update','commit']);
});
test('V2 source changes retain transaction/index guards',async()=>{
  const {createPaymentWriters}=await import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-writers.mjs')));
  let transactions=0;
  const sdk={
    runTransaction:async()=>{transactions++;return 'guarded';},
    updateDoc:async()=>{throw Error('Should not directly update source')},
    setDoc:async()=>{throw Error('Should not directly merge source')}
  };
  const ref={path:'payments/p2',parent:{path:'payments'},firestore:{}};
  const writers=createPaymentWriters(sdk,doc=>({contractDigitsV2:doc.contractNo||''}),{
    indexFields:['contractDigitsV2'],sourceFields:['contractNo']
  });
  assert.equal(await writers.updateDoc(ref,{contractNo:'NEW'}),'guarded');
  assert.equal(await writers.setDoc(ref,{contractNo:'NEW'},{merge:true}),'guarded');
  assert.equal(await writers.updateDoc(ref,{contractDigitsV2:'forged'}),'guarded');
  assert.equal(transactions,3);
});
