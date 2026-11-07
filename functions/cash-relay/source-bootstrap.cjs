'use strict';
/*
 * An explicit, ONE-TIME source-cache bootstrap from a consistent,
 * project-scoped Firestore query result (never a company-wide scan).
 *
 * This pure module does not run queries, create a Cloud Function, or write
 * production data. The future authorized operator must provide:
 *  - PHU HUNG project-only query snapshot and Firestore readTime
 *  - subsequent event stream already captured in source-cache with versions
 *  - external verification of legacy aliases and historical reconciliation
 *
 * It intentionally leaves complete=false: a simple backfill is NOT enough
 * to authorize finance writes, and no boolean can be supplied by a caller to
 * silently override that.
 */
const {createHash}=require('node:crypto');
const {PROJECT,MAX_CACHE_BYTES,key,projectedPayment,scope,
  eventVersion}=require('./source-cache.cjs');
function version(value){
  if(typeof value==='string')return eventVersion(value);
  if(value&&Number.isInteger(value.seconds)&&Number.isInteger(value.nanoseconds)&&
     value.nanoseconds>=0&&value.nanoseconds<1e9){
    const whole=new Date(value.seconds*1000).toISOString().slice(0,19);
    return whole+'.'+String(value.nanoseconds).padStart(9,'0')+'Z';
  }
  throw Error('Firestore snapshot missing exact commit/read timestamp.');
}
function bootstrapCache({snapshotRows,readTime,current}={}){
  if(!Array.isArray(snapshotRows)||snapshotRows.length>10000)
    throw Error('Missing or oversized PHU HUNG project query snapshot.');
  const at=version(readTime),rows={},seen=new Set();
  for(const record of snapshotRows){
    const id=String(record?.id||'');
    if(!id||seen.has(id)||!scope(record?.data))
      throw Error('Non-PHU HUNG or duplicate Payment in scoped bootstrap.');
    seen.add(id);
    const updated=version(record.updateTime);
    if(updated>at)throw Error('Bootstrap contains a document newer than query readTime.');
    if(record.data.deleted===true)continue;
    rows[key(id)]={value:projectedPayment(id,record.data),
      version:updated,eventId:'bootstrap:'+updated};
  }
  // Event deliveries can overlap a snapshot. Preserve anything written after
  // its readTime, even if the query omitted a later move/deletion.
  const old=current&&typeof current==='object'&&!Array.isArray(current)?current:{};
  if(old.blocked===true)throw Error('Conflicted cache requires operator review.');
  if(old.project&&old.project!==PROJECT)throw Error('Unrelated source-cache project.');
  for(const [hash,item] of Object.entries(old.rows||{})){
    if(!/^[a-f0-9]{64}$/.test(hash)||!item?.version)
      throw Error('Invalid pending source-cache row.');
    const v=version(item.version);
    if(v>at)rows[hash]=item;
    if(v===at&&item.eventId!==rows[hash]?.eventId)
      throw Error('Same-timestamp event during bootstrap requires review.');
  }
  const digest=createHash('sha256').update(JSON.stringify(
    Object.entries(rows).sort(([a],[b])=>a.localeCompare(b))
  )).digest('hex');
  const next={schemaVersion:1,project:PROJECT,rows,blocked:false,
    baselineDigest:digest,baselineReadTime:at,
    bootstrapCaptured:true,complete:false,
    // Separate external parity verification must explicitly seal completeness.
    sourceVerified:false};
  if(Buffer.byteLength(JSON.stringify(next),'utf8')>MAX_CACHE_BYTES)
    throw Error('Project source-cache exceeds safe Firestore document size.');
  return {state:next,sourceRows:snapshotRows.length,
    pendingChangesKept:Object.values(old.rows||{})
      .filter(x=>version(x.version)>at).length,
    readyForFinancialWrites:false};
}
module.exports={version,bootstrapCache};
