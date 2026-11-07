'use strict';
/*
 * ONE-TIME, expressly approved PRODUCTION bootstrap procedure.
 * This file does not register any Cloud Function, scheduled job, or command.
 * A future authorized operator must run it only in a reviewed maintenance
 * window after confirming project-scoped read access and a complete event
 * capture window; it cannot self-certify the accounting source.
 *
 * One scoped where(project == PHU HUNG) query is permitted only ONCE, not
 * once per source change. The transaction merges newer event versions and
 * leaves the source cache incomplete until independent full ledger review.
 */
const {COLLECTION,DOCUMENT,PROJECT}=require('./source-cache.cjs');
const {bootstrapCache}=require('./source-bootstrap.cjs');
const MAX_BOOTSTRAP_ROWS=10000;
function requireApproval(env){
  const project=env?.GCLOUD_PROJECT||env?.GCP_PROJECT;
  if(project!=='cscecmep-payment'||
    env?.CASH_SHEETS_SOURCE_BOOTSTRAP_APPROVED!=='YES'||
    env?.CASH_SHEETS_PRODUCTION_CACHE_ENABLED!=='YES'||
    env?.CASH_SHEETS_PRODUCTION_RELAY_ENABLED!=='YES')
    throw Error('One-time PHU HUNG production source bootstrap is NOT authorized.');
}
async function prepareOneTimeBootstrap({db,env}={}){
  requireApproval(env);
  if(!db||typeof db.runTransaction!=='function'||
     typeof db.collection!=='function')
    throw Error('Authenticated server Firestore API required.');
  const ref=db.collection(COLLECTION).doc(DOCUMENT);
  const initial=await ref.get();
  if(initial.exists&&initial.data()?.bootstrapCaptured===true)
    throw Error('PHU HUNG source was already bootstrapped; no rescan.');
  // One deliberate project-only query. Never query entire Payment collection.
  const snapshot=await db.collection('payments')
    .where('project','==',PROJECT).get();
  if(!snapshot||!Number.isInteger(snapshot.size)||
     snapshot.size>MAX_BOOTSTRAP_ROWS||
     !snapshot.readTime||typeof snapshot.docs?.map!=='function')
    throw Error('Unverified or oversized scoped Payment bootstrap snapshot.');
  const rows=snapshot.docs.map(doc=>({
    id:doc.id,data:doc.data(),updateTime:doc.updateTime
  }));
  const result=await db.runTransaction(async tx=>{
    const currentSnap=await tx.get(ref);
    const current=currentSnap.exists?currentSnap.data():null;
    if(current?.bootstrapCaptured===true)
      throw Error('Concurrent source bootstrap already completed.');
    const prepared=bootstrapCache({
      snapshotRows:rows,readTime:snapshot.readTime,current
    });
    // Always incomplete. A separate approved parity check must prove both
    // legacy aliases and financial history before activation.
    tx.set(ref,prepared.state);
    return {status:'captured-for-audit',sourceCount:prepared.sourceRows,
      inFlightEventsKept:prepared.pendingChangesKept,
      sourceComplete:false,googleSyncActivated:false,
      addedFirestoreReads:snapshot.size+2};
  });
  return result;
}
module.exports={MAX_BOOTSTRAP_ROWS,requireApproval,prepareOneTimeBootstrap};
