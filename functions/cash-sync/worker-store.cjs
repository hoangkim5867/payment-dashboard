'use strict';
/*
 * Atomic project-wide staging lease, shared across all PHU HUNG outbox jobs.
 *
 * Locking only one outbox document permits concurrent different events to
 * race and overwrite the same Sheets mirror. This store acquires the job and
 * project lock in ONE Firestore transaction; completion releases both. No
 * collection scans, no polling or financial row data in the lock.
 *
 * Function execution must be strictly shorter than LEASE_MS. A future Sheets
 * adapter must implement its own revalidation and idempotent writes, since
 * no Firestore lease alone can make an external Sheets API call atomic.
 */
const {randomUUID}=require('node:crypto');
const {COLLECTION,PROJECT}=require('./core.cjs');
const {WAITING,REVIEW,RETRY}=require('./worker.cjs');
const LOCK_COLLECTION='cash_sync_project_leases';
const LOCK_ID='PHU_HUNG';
const LEASE_MS=120000;

function createJobStore(db){
  if(!db||typeof db.runTransaction!=='function')throw Error('Firestore transaction API required.');
  const jobRef=id=>db.collection(COLLECTION).doc(id);
  const projectRef=()=>db.collection(LOCK_COLLECTION).doc(LOCK_ID);
  return {
    async claim(id,{now,maxAttempts}){
      if(!Number.isFinite(now)||!Number.isSafeInteger(maxAttempts)||maxAttempts<1)
        throw Error('Invalid worker lease request.');
      return db.runTransaction(async transaction=>{
        const docRef=jobRef(id),lockRef=projectRef();
        // Firestore requires all transaction reads before any writes.
        const snap=await transaction.get(docRef);
        if(!snap.exists)return null;
        const job=snap.data()||{};
        if(job.project!==PROJECT||job.status==='synced'||job.status===REVIEW)
          return null;
        if(job.status==='processing'&&Number(job.leaseUntil||0)>now){
          const e=Error('This event already has an active lease.');
          e.retryable=true;throw e;
        }
        if(![WAITING,RETRY,'processing'].includes(job.status))return null;
        const lockSnap=await transaction.get(lockRef);
        const lock=lockSnap.exists?lockSnap.data()||{}:null;
        if(lock&&Number(lock.leaseUntil||0)>now){
          const e=Error('PHU HUNG has another in-flight Sheets reconciliation.');
          e.retryable=true;throw e;
        }
        const attempt=Number(job.attempt||0)+1;
        if(attempt>maxAttempts){
          transaction.update(docRef,{status:REVIEW,reason:'attempt-limit'});
          return null;
        }
        const token=randomUUID(),leaseUntil=now+LEASE_MS;
        transaction.update(docRef,{status:'processing',attempt,
          leaseToken:token,leaseUntil});
        transaction.set(lockRef,{
          project:PROJECT,ownerJobId:id,leaseToken:token,leaseUntil
        });
        return {job,attempt,token};
      });
    },
    async finish(id,{token,status,attempt,reason,completedAt}){
      if(!['synced',REVIEW,RETRY].includes(status)||!token)
        throw Error('Unexpected queue state.');
      return db.runTransaction(async transaction=>{
        const docRef=jobRef(id),lockRef=projectRef();
        const snap=await transaction.get(docRef);
        const lockSnap=await transaction.get(lockRef);
        if(!snap.exists||!lockSnap.exists)
          throw Error('Outbox job or project lease disappeared.');
        const job=snap.data()||{},lock=lockSnap.data()||{};
        if(job.status!=='processing'||job.leaseToken!==token||
           job.attempt!==attempt||lock.ownerJobId!==id||
           lock.leaseToken!==token||lock.project!==PROJECT)
          throw Error('Outbox or project lease lost; no final state written.');
        const payload={status,leaseToken:null,leaseUntil:null};
        if(reason)payload.reason=reason;
        if(completedAt)payload.completedAt=new Date(completedAt).toISOString();
        transaction.update(docRef,payload);
        transaction.delete(lockRef);
      });
    }
  };
}
module.exports={LOCK_COLLECTION,LOCK_ID,LEASE_MS,createJobStore};
