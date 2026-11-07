'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeJob}=require('../functions/cash-sync/core.cjs');
const {runWorker,stageEnabled,validateJob,MAX_ATTEMPTS}=require('../functions/cash-sync/worker.cjs');
const {createJobStore}=require('../functions/cash-sync/worker-store.cjs');
const env={GCLOUD_PROJECT:'cash-control-staging',CASH_SHEETS_OUTBOX_ENABLED:'YES',
  CASH_SHEETS_WORKER_ENABLED:'YES'};
function exampleJob(){
  return makeJob({eventId:'example-event',source:'payment',
    affected:{changed:true,months:['2026-11'],requiresReview:false,reasons:['payment-changed']}});
}
function fakeFirestore(job){
  const data=new Map([[job.id,{...job}]]);
  const stats={reads:0,writes:0,scans:0};
  const db={collection(name){
    assert.ok(['cash_sync_outbox','cash_sync_project_leases'].includes(name));
    return {doc(id){return {id:name==='cash_sync_outbox'?id:'lock:'+id}}};
  },async runTransaction(fn){
    const staged=[];
    const tx={
      async get(ref){stats.reads++;return {
        exists:data.has(ref.id),data:()=>({...data.get(ref.id)})
      }},
      update(ref,patch){staged.push(['update',ref.id,patch])},
      set(ref,value){staged.push(['set',ref.id,value])},
      delete(ref){staged.push(['delete',ref.id])}
    };
    const result=await fn(tx);
    for(const [op,id,payload] of staged){
      if(op==='delete')data.delete(id);
      else if(op==='set')data.set(id,{...payload});
      else data.set(id,{...data.get(id),...payload});
      stats.writes++;
    }
    return result;
  }};
  return {db,stats,data};
}
const proof={googleReadBackVerified:true,sourceComplete:true,historicalLedgerUnchanged:true};
test('worker cannot run in production or without deliberate staging flag',async()=>{
  const j=exampleJob();const f=fakeFirestore(j);
  for(const opts of [{...env,GCLOUD_PROJECT:'cscecmep-payment'},
    {...env,CASH_SHEETS_WORKER_ENABLED:'NO'},
    {...env,CASH_SHEETS_OUTBOX_ENABLED:'NO'}]){
    assert.equal((await runWorker({jobId:j.id,env:opts,store:createJobStore(f.db),
      reconcile:async()=>({status:'synced',proof})})).status,'disabled');
  }
  assert.equal(f.stats.reads,0);assert.equal(f.stats.writes,0);
  assert.equal(stageEnabled(env),true);
});
test('verified read-back completes exactly one job, repeated deliveries do not write',async()=>{
  const j=exampleJob();const f=fakeFirestore(j);const months=[];
  const args={jobId:j.id,env,store:createJobStore(f.db),
    reconcile:async input=>{months.push(input.month);return {status:'synced',proof}}};
  assert.equal((await runWorker(args)).status,'synced');
  assert.deepEqual(months,['2026-11']);
  assert.equal(f.data.get(j.id).status,'synced');
  assert.equal((await runWorker(args)).status,'already-processing-or-completed');
  assert.equal(f.stats.writes,4,'job + project lock claims and releases without scans');
  assert.equal(f.stats.scans,0,'no query/list/polling');
});
test('moving a payment month must verify both months before completion',async()=>{
  const j=exampleJob();j.months=['2026-10','2026-11'];const f=fakeFirestore(j);
  const seen=[];
  const result=await runWorker({jobId:j.id,env,store:createJobStore(f.db),
    reconcile:async p=>{seen.push(p.month);return {status:'unchanged',proof}}});
  assert.equal(result.months,2);assert.deepEqual(seen,['2026-10','2026-11']);
});
test('success is impossible without both authoritative source proof and Sheets readback',async()=>{
  const j=exampleJob();const f=fakeFirestore(j);
  const result=await runWorker({jobId:j.id,env,store:createJobStore(f.db),
    reconcile:async()=>({status:'synced',
      proof:{googleReadBackVerified:true,sourceComplete:false,
        historicalLedgerUnchanged:true}})});
  assert.equal(result.status,'needs-review');
  assert.equal(f.data.get(j.id).status,'needs-review');
});
test('retryable errors are bounded and end in a review state',async()=>{
  const j=exampleJob();const f=fakeFirestore(j);
  const args={jobId:j.id,env,store:createJobStore(f.db),
    reconcile:async()=>{const e=Error('Google temporarily unavailable');e.status=503;throw e}};
  for(let attempt=1;attempt<MAX_ATTEMPTS;attempt++){
    await assert.rejects(runWorker(args),/Retryable/);
    assert.equal(f.data.get(j.id).attempt,attempt);
    assert.equal(f.data.get(j.id).status,'retry-pending');
  }
  const result=await runWorker(args);
  assert.equal(result.status,'needs-review');
  assert.equal(f.data.get(j.id).attempt,MAX_ATTEMPTS);
  assert.equal(f.data.get(j.id).status,'needs-review');
});
test('active lease blocks concurrent workers; subsequent retry may reclaim expired lease',async()=>{
  const j=exampleJob();const f=fakeFirestore(j),store=createJobStore(f.db);
  const claimed=await store.claim(j.id,{now:1000,maxAttempts:MAX_ATTEMPTS});
  assert.equal(claimed.attempt,1);
  await assert.rejects(store.claim(j.id,{now:2000,maxAttempts:MAX_ATTEMPTS}),/active lease/);
  const reclaimed=await store.claim(j.id,{now:1000+121000,maxAttempts:MAX_ATTEMPTS});
  assert.equal(reclaimed.attempt,2);
  await assert.rejects(store.finish(j.id,{token:claimed.token,status:'synced',attempt:1}),
    /lease lost/);
  await store.finish(j.id,{token:reclaimed.token,status:'synced',attempt:2,completedAt:123000});
  assert.equal(f.data.get(j.id).status,'synced');
});
test('two different PHU HUNG events cannot write to Sheets concurrently',async()=>{
  const first=exampleJob();
  const second=makeJob({eventId:'second-event',source:'payment',
    affected:{changed:true,months:['2026-11'],requiresReview:false,reasons:['payment-changed']}});
  const f=fakeFirestore(first);
  f.data.set(second.id,{...second});
  const store=createJobStore(f.db);
  const one=await store.claim(first.id,{now:1000,maxAttempts:MAX_ATTEMPTS});
  assert.equal(f.data.get('lock:PHU_HUNG').ownerJobId,first.id);
  await assert.rejects(store.claim(second.id,{now:2000,maxAttempts:MAX_ATTEMPTS}),
    /another in-flight/);
  assert.equal(f.data.get(second.id).status,'awaiting-reconciler');
  await store.finish(first.id,{token:one.token,status:'synced',attempt:1,completedAt:3000});
  assert.equal(f.data.has('lock:PHU_HUNG'),false);
  const two=await store.claim(second.id,{now:4000,maxAttempts:MAX_ATTEMPTS});
  assert.equal(two.attempt,1,'lock contention does not burn a retry attempt');
  await store.finish(second.id,{token:two.token,status:'synced',attempt:1,completedAt:5000});
  assert.equal(f.data.get(second.id).status,'synced');
  assert.equal(f.stats.scans,0);
});
test('stale owner cannot release newer project lock after lease expiration',async()=>{
  const first=exampleJob();
  const second=makeJob({eventId:'next-event',source:'cash-private',
    affected:{changed:true,months:['2026-11'],requiresReview:false,reasons:['manualRecords-changed']}});
  const f=fakeFirestore(first);f.data.set(second.id,{...second});
  const store=createJobStore(f.db);
  const old=await store.claim(first.id,{now:0,maxAttempts:MAX_ATTEMPTS});
  const next=await store.claim(second.id,{now:120001,maxAttempts:MAX_ATTEMPTS});
  await assert.rejects(store.finish(first.id,{
    token:old.token,status:'synced',attempt:1}),/lease lost/);
  assert.equal(f.data.get('lock:PHU_HUNG').ownerJobId,second.id);
  await store.finish(second.id,{token:next.token,status:'synced',attempt:1});
  assert.equal(f.data.get(first.id).status,'processing','stale event cannot claim completed');
});
test('bad IDs, missing month scope, manual-review jobs never reach Google',async()=>{
  const j=exampleJob();
  j.months=[];assert.equal(validateJob(j).ok,false);
  const f=fakeFirestore(j);let calls=0;
  const answer=await runWorker({jobId:j.id,env,store:createJobStore(f.db),
    reconcile:async()=>{calls++;return {status:'synced',proof}}});
  assert.equal(answer.status,'needs-review');assert.equal(calls,0);
  assert.equal((await runWorker({jobId:'bad-id',env,store:createJobStore(f.db),
    reconcile:async()=>({status:'synced',proof})})).status,'invalid-id');
});
