'use strict';
/*
 * Signed-by-IAM, privacy-minimal cross-project relay payload.
 * A production Cloud Function gets Firestore before/after in the event itself,
 * projects ONLY scope/months into the envelope, and sends no finance records.
 * Staging requires a PRIVATE Cloud Functions v2 HTTP endpoint and only grants
 * roles/run.invoker to the dedicated production relay service identity.
 */
const {affectedForPayment,affectedForCashPrivate,makeJob,COLLECTION}=require('./core.cjs');
const ORIGIN='cscecmep-payment',DESTINATION='cash-control-staging';
const ALLOWED_REASONS=new Set(['payment-changed','manualRecords-changed',
  'salaryRecords-changed','invalid-manualRecords','invalid-salaryRecords',
  'legacyOverrides-requires-history','deletedLegacy-requires-history',
  'openingStart-requires-history']);
const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;
const eventIdOk=x=>typeof x==='string'&&x.length>=1&&x.length<=512&&
  /^[\x21-\x7e]+$/.test(x);
const enabled=(env,project,flag)=>(
  (env?.GCLOUD_PROJECT||env?.GCP_PROJECT)===project&&env?.[flag]==='YES');
function buildEnvelope({eventId,source,before,after}){
  if(!eventIdOk(eventId)||!['payment','cash-private'].includes(source))
    throw Error('Invalid production CloudEvent identity');
  const affected=source==='payment'?affectedForPayment(before,after):
    affectedForCashPrivate(before,after);
  if(!affected.changed)return null;
  const job=makeJob({eventId,source,affected});
  return {schemaVersion:1,originProject:ORIGIN,jobId:job.id,
    source,project:job.project,eventId,months:job.months,
    needsReview:job.needsReview,reasons:job.reasons};
}
function validateEnvelope(value){
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Error('Relay envelope must be an object.');
  const keys=['schemaVersion','originProject','jobId','source','project',
    'eventId','months','needsReview','reasons'];
  if(Object.keys(value).length!==keys.length||
     Object.keys(value).some(k=>!keys.includes(k)))
    throw Error('Relay envelope includes unknown fields.');
  if(value.schemaVersion!==1||value.originProject!==ORIGIN||
     value.project!=='PHU HUNG'||!eventIdOk(value.eventId)||
     !['payment','cash-private'].includes(value.source)||
     typeof value.needsReview!=='boolean'||
     !Array.isArray(value.months)||value.months.length>12||
     !Array.isArray(value.reasons)||value.reasons.length<1||
     value.reasons.length>8)
    throw Error('Invalid relay envelope scope.');
  if(value.months.some(m=>typeof m!=='string'||!MONTH.test(m)||m<'2026-10')||
     new Set(value.months).size!==value.months.length||
     value.reasons.some(r=>!ALLOWED_REASONS.has(r))||
     new Set(value.reasons).size!==value.reasons.length||
     (!value.months.length&&!value.needsReview))
    throw Error('Invalid relay months or reason codes.');
  const reviewReasons=value.reasons.some(r=>r.startsWith('invalid-')||
    r.endsWith('-requires-history'));
  if(reviewReasons&&!value.needsReview)
    throw Error('Unsafe relay event cannot bypass mandatory review.');
  const expected=makeJob({
    eventId:value.eventId,source:value.source,
    affected:{changed:true,months:value.months,
      requiresReview:value.needsReview,reasons:value.reasons}
  });
  if(value.jobId!==expected.id)
    throw Error('Event identity/hash does not match payload.');
  return {...expected,originProject:ORIGIN,
    relayedAt:new Date().toISOString()};
}
async function ingestEnvelope({env,envelope,writer}){
  if(!enabled(env,DESTINATION,'CASH_SHEETS_RELAY_INGEST_ENABLED'))
    return {status:'disabled'};
  const job=validateEnvelope(envelope);
  if(!writer||typeof writer.create!=='function')
    throw Error('Bounded Firestore outbox writer required.');
  try{
    await writer.create(COLLECTION,job.id,job);
    return {status:'enqueued'};
  }catch(error){
    if(error?.code===6||error?.code==='already-exists')
      return {status:'duplicate'};
    throw error;
  }
}
module.exports={ORIGIN,DESTINATION,ALLOWED_REASONS,
  buildEnvelope,validateEnvelope,ingestEnvelope,enabled};
