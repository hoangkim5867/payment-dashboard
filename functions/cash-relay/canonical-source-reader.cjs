'use strict';
/*
 * IAM-PRIVATE production canonical finance source reader.
 *
 * Only after an audited, explicitly sealed PHU HUNG source cache exists,
 * read exactly THREE Firestore documents in ONE read-only transaction:
 *   cash_sync_source_cache/PHU_HUNG
 *   cash_control_private/lehoangoanh
 *   cash_control_private/legacy_seed_20261021_v1
 * No Payment collection scan occurs per Google Sheets event.
 *
 * The returned values are the *exact* Cash Control 13-column export and
 * hashed source IDs, never account numbers, bank data, UNC attachments, raw
 * Firestore source documents or historical seed records. It must be called
 * via private Cloud Run IAM by only the authorized staging service identity.
 *
 * All flags OFF in deployed production. This is not a live endpoint yet.
 */
const {createHash}=require('node:crypto');
const {COLLECTION,DOCUMENT,PROJECT,readCache}=require('./source-cache.cjs');
const {LEGACY_SEED_ID,verifyProtectedHistory}=require('./protected-history.cjs');
const {projectExactCashMonth}=require('./full-projector.cjs');
const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;
function isSourceAuthorized(env){
  return (env?.GCLOUD_PROJECT||env?.GCP_PROJECT)==='cscecmep-payment'&&
    env?.CASH_SHEETS_PRODUCTION_SOURCE_READ_ENABLED==='YES';
}
function requireRequest({env,project,month}={}){
  if(!isSourceAuthorized(env)||project!==PROJECT||
    typeof month!=='string'||!MONTH.test(month)||month<'2026-10')
    throw Error('Authenticated production source request unavailable.');
}
function createCanonicalSourceReader({db,verifySeed=verifyProtectedHistory,
  projectMonth=projectExactCashMonth}={}){
  if(!db||typeof db.runTransaction!=='function'||typeof db.collection!=='function')
    throw Error('Authenticated production Firestore service required.');
  return async function getCanonicalMonth({project,month}={}){
    if(project!==PROJECT||!MONTH.test(String(month||''))||month<'2026-10')
      throw Error('Unapproved finance source scope.');
    const cacheRef=db.collection(COLLECTION).doc(DOCUMENT);
    const privateRef=db.collection('cash_control_private').doc('lehoangoanh');
    const legacyRef=db.collection('cash_control_private').doc(LEGACY_SEED_ID);
    return db.runTransaction(async tx=>{
      // Transactional read snapshot ensures cache/private/seed are observed
      // consistently without any 2-phase cross-document race.
      const [cacheDoc,privateDoc,seedDoc]=[
        await tx.get(cacheRef),await tx.get(privateRef),await tx.get(legacyRef)
      ];
      if(!cacheDoc.exists||!privateDoc.exists||!seedDoc.exists)
        throw Error('Incomplete server source: protected documents missing.');
      const cache=cacheDoc.data();
      if(cache?.complete!==true||cache?.sourceVerified!==true||
         cache?.bootstrapCaptured!==true||cache?.blocked===true)
        throw Error('PHU HUNG source cache has not passed full bootstrap audit.');
      const payments=readCache(cache);
      const cash=privateDoc.data();
      if(!cash||!Array.isArray(cash.manualRecords)||
         !Array.isArray(cash.salaryRecords)||
         !Number.isSafeInteger(Number(cash.revision||0))||
         Number(cash.revision||0)<0)
        throw Error('Cash Control revision/records are not complete.');
      const legacy=verifySeed(seedDoc.data());
      if(legacy?.integrityVerified!==true)
        throw Error('Protected history source has not been verified.');
      const projected=projectMonth({
        month,project,payments,cashPrivate:cash,legacySeed:legacy.history
      });
      if(!projected||!Array.isArray(projected.rows)||
         projected.rows.some(r=>r.project!==PROJECT||r.month!==month))
        throw Error('Invalid source-locked financial projection.');
      const proof=createHash('sha256').update(JSON.stringify({
        month,project,baselineDigest:cache.baselineDigest,
        privateRevision:Number(cash.revision||0),legacyDigest:legacy.digest,
        rows:projected.rows.map(r=>[r.id,r.hash])
      })).digest('hex');
      return {schemaVersion:1,project,month,rows:projected.rows,
        sourceComplete:true,authoritative:true,sourceProof:proof,
        sourceRowCount:projected.rows.length,
        sourceReads:3,sourceProofKind:'consistent-production-transaction'};
    },{readOnly:true,maxAttempts:3});
  };
}
module.exports={MONTH,isSourceAuthorized,requireRequest,createCanonicalSourceReader};
