'use strict';
// Server-only assembly of TEST safety checks. No route is registered for this
// module: do not expose it until server-side trusted source/history snapshots
// and staging Firestore Rules have been independently verified.
const {readConfig,verifyFirebaseAdminToken}=require('./cash-sync-guard.cjs');
const {readTargets,allowTarget}=require('./cash-shared-test-targets.cjs');
const {makeLock}=require('./cash-shared-test-firestore-lock.cjs');
const transportModule=require('../site/assets/js/cash-shared-google-test-transport.js');
const planner=require('../site/assets/js/cash-shared-test-sync-planner.js');
const coordinator=require('../site/assets/js/cash-shared-test-write-coordinator.js');
function stop(reason){throw Error(reason)}
async function runGuardedTestSync({env,firebaseJwt,googleToken,project,month,
  targetId,tab,confirmed,trustedSnapshot,fetcher=fetch,
  verifyAdmin=verifyFirebaseAdminToken}={}){
  // No production fallback, even if legacy PHU HUNG's production write gate
  // has been approved for its unrelated test copy.
  if(env?.VERCEL_ENV!=='preview')stop('SHARED_TEST_PREVIEW_ONLY');
  const allowed=readTargets(env);
  const target=allowTarget(allowed,project,targetId,tab);
  if(!confirmed)stop('SHARED_TEST_CONFIRMATION_REQUIRED');
  if(typeof trustedSnapshot!=='function')stop('SHARED_TEST_TRUSTED_SOURCE_REQUIRED');
  if(typeof googleToken!=='string'||!googleToken.trim())
    stop('SHARED_TEST_GOOGLE_AUTH_REQUIRED');
  const config=readConfig(env);
  if(config.project!==env.CASH_SYNC_FIREBASE_PROJECT_ID)
    stop('SHARED_TEST_FIREBASE_PROJECT_MISMATCH');
  // verifyAdmin is only injectable to run offline unit tests; production
  // callers must use the default JWT signature verifier.
  await verifyAdmin(firebaseJwt,config);
  // This is an atomic Firestore create-only lock. Do not use an in-memory mutex
  // in Vercel serverless; separate instances must contend on the same document.
  const manager=makeLock({project:config.project,uid:config.uid,
    token:firebaseJwt,fetcher});
  const lock=await manager.acquire(project);
  let canRelease=true;
  try{
    await lock.assertHeld();
    // This must be constructed by trusted server code, NOT from request.body.
    // The absence of an independently verified data loader blocks writing.
    const proof=await trustedSnapshot({target,month});
    if(!proof||!Array.isArray(proof.source)||!proof.source.length||
       !Array.isArray(proof.history)||!Number.isFinite(proof.openingBalance)||
       proof.sourceComplete!==true||proof.historyComplete!==true||
       proof.baselineRevalidated!==true)
      stop('SHARED_TEST_SOURCE_NOT_PROVEN');
    const request=transportModule.authenticatedRequest({
      accessToken:googleToken,fetcher
    });
    const transport=transportModule.create({
      target,request,exclusiveLock:lock,openingBalance:proof.openingBalance,
      history:proof.history,amountColumns:project==='FOXCONN'?8:7
    });
    const result=await coordinator.syncTest({
      target,month,source:proof.source,
      evidence:{sourceComplete:true,historyComplete:true,
        baselineRevalidated:true},transport,planner,confirmed:true,
      exclusiveTestLock:true
    });
    await lock.assertHeld();
    return result;
  }catch(error){
    const problem=String(error?.message||error);
    // If Google might have accepted a write, keep the Firestore lock until
    // a human confirms the TEST destination. Never auto-retry or auto-unlock.
    if(/TEST_WRITE_UNCERTAIN|TEST_HISTORY_OR_OPENING_CHANGED_AFTER_WRITE|TEST_EXISTING_ROW_MODIFIED|TEST_MIRROR_DUPLICATE_ID|TEST_WRITE_READBACK_MISMATCH|TEST_EXTRA_ROWS_AFTER_WRITE|TEST_BALANCE_MISMATCH|GOOGLE_TEST_HTTP_5\d\d/.test(problem))
      canRelease=false;
    throw error;
  }finally{
    if(canRelease)await lock.release();
  }
}
module.exports={runGuardedTestSync};
