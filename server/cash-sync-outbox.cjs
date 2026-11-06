'use strict';
/*
 * Cash Control → Sheets: event-driven invalidation outbox (TEST ONLY).
 * No Google tokens, financial row payloads, timers or Firestore queries.
 * This does NOT write Google Sheets; a separately authorized reconciler must
 * consume these jobs after validating a complete source and ledger baseline.
 */
const {createHash}=require('node:crypto');
const PROJECT='PHU HUNG';
const FIRST_MONTH='2026-10';
const COLLECTION='cash_sync_outbox';
const sourceArrays=['manualRecords','salaryRecords'];
const uncertainKeys=['legacyOverrides','deletedLegacy','openingStart'];
const stable=x=>JSON.stringify(x===undefined?null:x);
function projectKey(value){
  const x=String(value??'').normalize('NFKC').replace(/[\s_\-]+/g,'').toUpperCase();
  return x==='PHUHUNG'?PROJECT:null;
}
function dateMonth(value){
  const raw=String(value??'').trim();
  const m=/^(20\d\d)-(0[1-9]|1[0-2])(?:-([0-2]\d|3[01]))?/.exec(raw);
  if(!m)return null;
  const month=m[1]+'-'+m[2];
  return month>=FIRST_MONTH?month:null;
}
function recordRelevant(record){
  return record&&typeof record==='object'&&
    [record.project,record.fromProject,record.toProject].some(projectKey);
}
function monthsOf(record){
  return [...new Set([record?.actualDate,record?.processPaymentDate,
    record?.paidDate,record?.paymentDate,record?.date]
    .map(dateMonth).filter(Boolean))];
}
function emptyResult(){return {months:[],requiresReview:false,changed:false,reasons:[]}}
function createAccumulator(){
  const months=new Set(),reasons=new Set();
  let changed=false,requiresReview=false;
  return {
    add(record,reason){
      if(!recordRelevant(record))return;
      changed=true;reasons.add(reason);
      const found=monthsOf(record);
      if(!found.length)requiresReview=true;
      found.forEach(m=>months.add(m));
    },
    unknown(reason){changed=true;requiresReview=true;reasons.add(reason)},
    result(){return {months:[...months].sort(),requiresReview,changed,
      reasons:[...reasons].sort()}}
  };
}
function affectedForPayment(before,after){
  const acc=createAccumulator();
  if(stable(before)===stable(after))return emptyResult();
  if(recordRelevant(before)||recordRelevant(after)){
    // Include both old and new months to handle dates moved across periods.
    acc.add(before,'payment-changed');
    acc.add(after,'payment-changed');
  }
  return acc.result();
}
function recordIndex(rows){
  if(!Array.isArray(rows)||rows.length>10000)return null;
  const map=new Map();
  for(const row of rows){
    const id=String(row?.id??'');
    if(!id||id.length>256||map.has(id))return null;
    map.set(id,row);
  }
  return map;
}
function affectedForCashPrivate(before,after){
  const b=before||{},a=after||{},acc=createAccumulator();
  for(const field of sourceArrays){
    const oldIndex=recordIndex(b[field]||[]);
    const newIndex=recordIndex(a[field]||[]);
    if(!oldIndex||!newIndex){acc.unknown('invalid-'+field);continue}
    for(const id of new Set([...oldIndex.keys(),...newIndex.keys()])){
      const old=oldIndex.get(id),next=newIndex.get(id);
      if(stable(old)===stable(next))continue;
      acc.add(old,field+'-changed');
      acc.add(next,field+'-changed');
    }
  }
  // Overrides/deletions/opening balances refer to legacy data that is not
  // included in this Firestore document. Do not guess its project/month.
  for(const key of uncertainKeys){
    if(stable(b[key])!==stable(a[key]))acc.unknown(key+'-requires-history');
  }
  return acc.result();
}
function makeJob({eventId,source,affected,createdAt}){
  if(!['cash-private','payment'].includes(source)||
     typeof eventId!=='string'||!eventId||eventId.length>512||
     !affected?.changed)throw Error('No valid relevant change.');
  const id=createHash('sha256').update(source+'\0'+eventId).digest('hex');
  return {id,source,project:PROJECT,months:affected.months,
    needsReview:affected.requiresReview,reasons:affected.reasons,
    status:affected.requiresReview?'needs-review':'pending',
    schemaVersion:1,eventId,createdAt:createdAt||new Date().toISOString()};
}
function enabledForStaging(env){
  return env?.CASH_SHEETS_OUTBOX_ENABLED==='YES'&&
    (env?.GCLOUD_PROJECT||env?.GCP_PROJECT)==='cash-control-staging';
}
async function enqueueEvent({eventId,source,before,after,env,writer}){
  if(!enabledForStaging(env))return {status:'disabled'};
  const affected=source==='payment'
    ?affectedForPayment(before,after)
    :source==='cash-private'?affectedForCashPrivate(before,after)
    :null;
  if(!affected)throw Error('Unexpected source type.');
  if(!affected.changed)return {status:'irrelevant'};
  const job=makeJob({eventId,source,affected});
  if(!writer||typeof writer.create!=='function')throw Error('Missing outbox writer.');
  try{
    await writer.create(COLLECTION,job.id,job);
    return {status:'enqueued',job};
  }catch(error){
    // Firestore create() is atomic: retry of same event can safely no-op.
    if(error?.code===6||error?.code==='already-exists')
      return {status:'duplicate',id:job.id};
    throw error; // trigger retries transient errors; never silently drop jobs
  }
}
module.exports={COLLECTION,PROJECT,FIRST_MONTH,projectKey,dateMonth,
  affectedForPayment,affectedForCashPrivate,makeJob,enabledForStaging,enqueueEvent};
