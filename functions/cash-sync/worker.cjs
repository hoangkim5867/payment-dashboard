'use strict';
/*
 * Event-driven Google Sheets outbox coordinator (staging only).
 *
 * No Google / Firestore reads or credentials in this pure module. A caller
 * provides an ATOMIC job-store claim, a reconciler which independently proves
 * its complete source + ledger before it writes, and a store finish operation.
 * The worker MUST NOT mark success merely because a Google HTTP request
 * returned 200; reconciliation must confirm a post-write read-back.
 */
const {PROJECT,FIRST_MONTH}=require('./core.cjs');
const MAX_ATTEMPTS=4;
const WAITING='awaiting-reconciler';
const COMPLETE=new Set(['synced','unchanged']);
const REVIEW='needs-review';
const RETRY='retry-pending';
const ID=/^[a-f0-9]{64}$/;
function stageEnabled(env){
  return env?.CASH_SHEETS_OUTBOX_ENABLED==='YES'&&
    env?.CASH_SHEETS_WORKER_ENABLED==='YES'&&
    (env?.GCLOUD_PROJECT||env?.GCP_PROJECT)==='cash-control-staging';
}
function validateJob(job){
  if(!job||job.schemaVersion!==1||!ID.test(job.id||'')||
     job.project!==PROJECT||!['payment','cash-private'].includes(job.source)||
     !Array.isArray(job.months)||job.months.length===0||job.months.length>12||
     !job.months.every(m=>/^20\d\d-(0[1-9]|1[0-2])$/.test(m)&&m>=FIRST_MONTH)||
     new Set(job.months).size!==job.months.length)
    return {ok:false,reason:'Invalid event or month scope'};
  if(job.needsReview||job.status===REVIEW)
    return {ok:false,reason:'Legacy or missing-source review required'};
  return {ok:true};
}
function isRetryable(err){
  return Boolean(err?.retryable===true||[408,429,500,502,503,504].includes(Number(err?.status)));
}
function classifyFailure(err,attempt){
  if(isRetryable(err)&&attempt<MAX_ATTEMPTS)return RETRY;
  return REVIEW;
}
async function runWorker({jobId,env,store,reconcile,clock=()=>Date.now()}){
  if(!stageEnabled(env))return {status:'disabled'};
  if(!ID.test(String(jobId||'')))return {status:'invalid-id'};
  if(!store||typeof store.claim!=='function'||typeof store.finish!=='function')
    throw Error('An atomic store is mandatory.');
  // No direct Sheets write if a proof-producing reconciler is absent.
  if(typeof reconcile!=='function')return {status:'missing-reconciler'};
  const claimed=await store.claim(jobId,{now:clock(),maxAttempts:MAX_ATTEMPTS});
  if(!claimed)return {status:'already-processing-or-completed'};
  const {job,attempt,token}=claimed;
  const result=validateJob(job);
  if(!result.ok){
    await store.finish(jobId,{token,status:REVIEW,reason:result.reason,attempt});
    return {status:REVIEW,reason:result.reason};
  }
  try{
    // Every affected month must be reconciled and independently read back.
    // It is not safe to reduce a two-month date move to just its new month.
    for(const month of job.months){
      const verified=await reconcile({jobId,project:PROJECT,month,
        target:'PHU_HUNG_VIEW_TEST',attempt});
      if(!verified||!COMPLETE.has(verified.status)||
         verified.proof?.googleReadBackVerified!==true||
         verified.proof?.sourceComplete!==true||
         verified.proof?.historicalLedgerUnchanged!==true){
        const e=Error('Reconciler has not verified source and Google read-back');
        e.retryable=false;
        throw e;
      }
    }
    await store.finish(jobId,{token,status:'synced',attempt,completedAt:clock()});
    return {status:'synced',attempt,months:job.months.length};
  }catch(err){
    const status=classifyFailure(err,attempt);
    await store.finish(jobId,{token,status,attempt,
      reason:isRetryable(err)?'transient-upstream':'source-or-ledger-review'});
    if(status===RETRY){
      const retry=Error('Retryable Sheets reconciliation failure');
      retry.retryable=true;throw retry;
    }
    return {status:REVIEW,attempt};
  }
}
module.exports={MAX_ATTEMPTS,WAITING,REVIEW,RETRY,stageEnabled,validateJob,
  isRetryable,classifyFailure,runWorker};
