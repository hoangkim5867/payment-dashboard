'use strict';
/* Atomic one-job lease. Each claim/finish is one bounded Firestore transaction.
 * No collection listing, no polling, no bank/payment fields in queue documents.
 */
const {randomUUID}=require('node:crypto');
const {COLLECTION}=require('./core.cjs');
const {WAITING,REVIEW,RETRY}=require('./worker.cjs');
const LEASE_MS=120000;
function createJobStore(db){
  if(!db||typeof db.runTransaction!=='function')throw Error('Firestore transaction API required.');
  const ref=id=>db.collection(COLLECTION).doc(id);
  return {
    async claim(id,{now,maxAttempts}){
      return db.runTransaction(async transaction=>{
        const docRef=ref(id),snap=await transaction.get(docRef);
        if(!snap.exists)return null;
        const job=snap.data()||{};
        if(job.status==='synced'||job.status===REVIEW)return null;
        if(job.status==='processing'&&Number(job.leaseUntil||0)>now){
          const e=Error('Another worker has an active lease; retry later');
          e.retryable=true;throw e;
        }
        if(![WAITING,RETRY,'processing'].includes(job.status))return null;
        const attempt=Number(job.attempt||0)+1;
        if(attempt>maxAttempts){
          transaction.update(docRef,{status:REVIEW,reason:'attempt-limit'});
          return null;
        }
        const token=randomUUID();
        transaction.update(docRef,{status:'processing',attempt,
          leaseToken:token,leaseUntil:now+LEASE_MS});
        return {job,attempt,token};
      });
    },
    async finish(id,{token,status,attempt,reason,completedAt}){
      if(!['synced',REVIEW,RETRY].includes(status))throw Error('Unexpected queue state');
      return db.runTransaction(async transaction=>{
        const docRef=ref(id),snap=await transaction.get(docRef);
        if(!snap.exists)throw Error('Outbox event disappeared');
        const job=snap.data()||{};
        if(job.status!=='processing'||job.leaseToken!==token||
           job.attempt!==attempt)throw Error('Outbox lease lost; no final state written');
        const payload={status,leaseToken:null,leaseUntil:null};
        if(reason)payload.reason=reason;
        if(completedAt)payload.completedAt=new Date(completedAt).toISOString();
        transaction.update(docRef,payload);
      });
    }
  };
}
module.exports={LEASE_MS,createJobStore};
