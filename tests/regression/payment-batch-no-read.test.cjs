'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const index=require('../../backend/payment-index-core.cjs');
const imported=import(pathToFileURL(path.resolve(__dirname,'../../site/assets/js/payment-writers.mjs')));
function harness(){
 const calls={batches:0,transactions:0,reads:0,commits:[]};
 const sdk={
  writeBatch:()=>{calls.batches++;const ops=[];return {
   set:(...args)=>ops.push(['set',...args]),
   update:(...args)=>ops.push(['update',...args]),
   delete:(...args)=>ops.push(['delete',...args]),
   commit:async()=>{calls.commits.push(ops);}
  }},
  runTransaction:async(db,fn)=>{
   calls.transactions++;const ops=[];
   const tx={
    get:async()=>{calls.reads++;return {exists:()=>true,data:()=>({project:'PH',contractNo:'C',ipcNo:'IPC',paymentMonth:'2026-10'})}},
    set:(...args)=>ops.push(['set',...args]),update:(...args)=>ops.push(['update',...args]),delete:(...args)=>ops.push(['delete',...args])
   };
   await fn(tx);calls.commits.push(ops);
  }
 };
 const ref=id=>({path:'payments/'+id,parent:{path:'payments'},id});
 return {sdk,calls,ref};
}
test('full-set Excel-style batch preserves indexes, writes atomically, performs no transaction reads',async()=>{
 const {createPaymentWriters}=await imported,h=harness(),writer=createPaymentWriters(h.sdk,index.computeIndexV1),batch=writer.writeBatch({});
 for(let i=0;i<400;i++)batch.set(h.ref('row-'+i),{project:'PH',contractNo:'C'+i,ipcNo:'IPC'+i,paymentMonth:'2026-10',amount:123});
 await batch.commit();
 assert.equal(h.calls.transactions,0);assert.equal(h.calls.reads,0);assert.equal(h.calls.batches,1);
 assert.equal(h.calls.commits[0].length,400);
 for(const op of h.calls.commits[0])assert.deepEqual(Object.fromEntries(Object.entries(index.computeIndexV1(op[2]))),Object.fromEntries(Object.entries(op[2]).filter(([k])=>['duplicateKeyV1','mepLookupV1','paymentLookupSchemaV1'].includes(k))));
 await assert.rejects(batch.commit(),/already been committed/);
});
test('full sets and deletes remain one batch without reads',async()=>{
 const {createPaymentWriters}=await imported,h=harness(),batch=createPaymentWriters(h.sdk,index.computeIndexV1).writeBatch({});
 batch.set(h.ref('first'),{project:'PH',ipcNo:'A'});batch.delete(h.ref('second'));await batch.commit();
 assert.equal(h.calls.transactions,0);assert.equal(h.calls.batches,1);assert.equal(h.calls.commits[0].length,2);
});
test('updates, merges and repeated payment paths retain previous transaction behavior',async()=>{
 const {createPaymentWriters}=await imported;
 for(const make of [b=>b.update(b.ref,{amount:20}),b=>b.set(b.ref,{amount:1},{merge:true}),b=>{b.set(b.ref,{project:'PH'});b.update(b.ref,{ipcNo:'NEXT'});}]) {
  const h=harness(),batch=createPaymentWriters(h.sdk,index.computeIndexV1).writeBatch({});
  const b={ref:h.ref('one'),set:batch.set,update:batch.update};make(b);await batch.commit();
  assert.equal(h.calls.transactions,1);assert.ok(h.calls.reads>=1);assert.equal(h.calls.batches,0);
 }
});
test('full-set source transforms retain transaction validation',async()=>{
 const {createPaymentWriters}=await imported,h=harness(),batch=createPaymentWriters(h.sdk,index.computeIndexV1).writeBatch({});
 batch.set(h.ref('one'),{project:{_methodName:'serverTimestamp'},ipcNo:'1'});
 await assert.rejects(batch.commit(),/Unsupported transform/);
 assert.equal(h.calls.transactions,1);assert.equal(h.calls.batches,0);
});

test('existing transaction reads each payment only once including index maintenance',async()=>{
 const {createPaymentWriters}=await imported,h=harness();
 const writer=createPaymentWriters(h.sdk,index.computeIndexV1);
 const ref=h.ref('same');
 await writer.runTransaction({},async tx=>{
  const snapshot=await tx.get(ref);
  assert.equal(snapshot.exists(),true);
  tx.update(ref,{ipcNo:'IPC-EDIT'});
 });
 assert.equal(h.calls.transactions,1);
 assert.equal(h.calls.reads,1,'Do not read again inside wrapper flush');
 assert.equal(h.calls.commits[0].length,1);
});
