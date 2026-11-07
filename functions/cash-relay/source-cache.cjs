'use strict';
/*
 * Production-only Payment source cache: one bounded PHU HUNG document rather
 * than a Payment collection scan for every incoming event.
 *
 * A one-time authenticated bootstrap is STILL REQUIRED before this cache may
 * be complete. Creation from CloudEvents alone is not proof of historical
 * completeness. Nothing here runs unless an explicitly reviewed Cloud
 * Function connects it.
 *
 * One transaction reads the source-cache doc and writes it back (1 read,
 * 1 write) for relevant changes, not 0 Firestore operations.
 * No bank account, payment credentials, UNC, attachments or unrelated
 * projects are written to this cache. It lives in PRODUCTION only.
 */
const {createHash}=require('node:crypto');
const COLLECTION='cash_sync_source_cache';
const DOCUMENT='PHU_HUNG';
const PROJECT='PHU HUNG';
const MAX_CACHE_BYTES=700000;
const FIELDS=['project','deleted','processPaymentDate','processActualAmount',
  'paymentMonth','amount','costType','company','contractNo','contractName',
  'contractType','ipcNo','note','remark','remarks','description','content',
  'monthOutcome','carryForwardToMonth','carryForwardFromPaymentId','carriedForwardAt'];
const key=id=>createHash('sha256').update(String(id)).digest('hex');
function scope(raw){
  return raw&&typeof raw==='object'&&
    String(raw.project||'').trim().replace(/\s+/g,' ').toUpperCase()===PROJECT;
}
function projectedPayment(id,raw){
  if(!raw||typeof raw!=='object'||!String(id||'').trim())
    throw Error('Invalid Payment document identity.');
  const value={id:String(id)};
  for(const name of FIELDS){
    let field=raw[name];
    if(field!==undefined&&field!==null){
      // Firebase Timestamp is safely normalized only for this known field.
      // Browser snapshotIso() supports the exact resulting ISO form.
      if(name==='carriedForwardAt'&&typeof field==='object'){
        if(typeof field.toDate==='function')
          field=field.toDate().toISOString();
        else if(Number.isFinite(Number(field.seconds)))
          field=new Date(Number(field.seconds)*1000).toISOString();
      }
      // Only canonical primitive fields, no bank/account/large user blobs.
      if(typeof field!=='string'&&typeof field!=='number'&&typeof field!=='boolean')
        throw Error('Unexpected Payment source field '+name);
      if(typeof field==='string'&&field.length>2048)
        throw Error('Oversized Payment source field '+name);
      if(typeof field==='number'&&!Number.isFinite(field))
        throw Error('Invalid numeric Payment field '+name);
      value[name]=field;
    }
  }
  if(JSON.stringify(value).length>12000)
    throw Error('Oversized Payment source entry.');
  return value;
}
function eventVersion(date){
  const d=String(date||'');
  // CloudEvent time is ISO UTC; equal timestamps across different event IDs
  // are a hard conflict rather than an arbitrary ordering decision.
  if(!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(d)||
     !Number.isFinite(Date.parse(d)))
    throw Error('Missing verified CloudEvent timestamp.');
  return d.replace(/\.(\d+)Z$/,(_,fraction)=>'.'+fraction.padEnd(9,'0')+'Z')
    .replace(/(\d\d:\d\d:\d\d)Z$/,'$1.000000000Z');
}
function mutatePaymentCache(state,{paymentId,before,after,eventId,time}){
  if(!String(paymentId||'').trim()||!String(eventId||'').trim())
    throw Error('CloudEvent missing original Payment document ID.');
  const version=eventVersion(time),id=String(paymentId),hashed=key(id);
  const cache=state&&typeof state==='object'&&!Array.isArray(state)?state:{};
  const rows={...(cache.rows||{})};
  const prior=rows[hashed]||null;
  const relevant=scope(before)||scope(after)||Boolean(prior);
  if(!relevant)return {changed:false,state:cache,reason:'unrelated'};
  if(cache.blocked===true)return {changed:false,state:cache,reason:'cache-blocked'};
  const previousVersion=String(prior?.version||'');
  if(previousVersion>version)return {changed:false,state:cache,reason:'older-event'};
  if(previousVersion===version){
    if(prior?.eventId===eventId)return {changed:false,state:cache,reason:'duplicate'};
    return {changed:true,state:{...cache,blocked:true,blockReason:'same-version-conflict'},
      reason:'review'};
  }
  if(scope(after)&&after?.deleted!==true){
    rows[hashed]={value:projectedPayment(id,after),version,eventId};
  }else{
    // A bounded tombstone protects against delayed older writes reappearing.
    rows[hashed]={value:null,version,eventId};
  }
  const result={schemaVersion:1,project:PROJECT,rows,
    complete:cache.complete===true,baselineDigest:cache.baselineDigest||null,
    blocked:false,lastCloudEventId:eventId};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>MAX_CACHE_BYTES)
    return {changed:true,reason:'review',state:{
      ...cache,blocked:true,blockReason:'project-source-cache-size-limit'}};
  return {changed:true,state:result,reason:'applied'};
}
function readCache(state){
  if(!state||state.schemaVersion!==1||state.project!==PROJECT||
     state.complete!==true||state.blocked===true||
     !/^[a-f0-9]{64}$/.test(String(state.baselineDigest||'')))
    throw Error('Incomplete or unverified PHU HUNG source cache.');
  const payments=[];
  for(const [hash,entry] of Object.entries(state.rows||{})){
    if(!/^[a-f0-9]{64}$/.test(hash)||!entry||!entry.version)
      throw Error('Corrupted PHU HUNG source cache key.');
    if(entry.value!==null){
      if(key(entry.value?.id)!==hash)throw Error('Payment document ID hash mismatch.');
      payments.push(projectedPayment(entry.value.id,entry.value));
    }
  }
  return payments;
}
function createCacheStore(db){
  if(!db||typeof db.runTransaction!=='function')
    throw Error('Firestore atomic transaction required.');
  return {
    async apply(delta){
      return db.runTransaction(async tx=>{
        const ref=db.collection(COLLECTION).doc(DOCUMENT);
        const snap=await tx.get(ref);
        const current=snap.exists?snap.data():null;
        const changed=mutatePaymentCache(current,delta);
        if(changed.changed)tx.set(ref,changed.state);
        return {status:changed.reason,
          complete:changed.state?.complete===true&&!changed.state?.blocked};
      });
    }
  };
}
module.exports={COLLECTION,DOCUMENT,PROJECT,FIELDS,MAX_CACHE_BYTES,
  key,scope,projectedPayment,eventVersion,mutatePaymentCache,readCache,
  createCacheStore};
