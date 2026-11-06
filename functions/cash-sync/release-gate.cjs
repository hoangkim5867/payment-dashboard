'use strict';
/*
 * Deployment gate for unattended CASH -> Sheets writes.
 *
 * TEST code contains an outbox/event receiver and a safe READ-ONLY Google
 * inspector, but it has NO authoritative always-fresh server-side Cash Control
 * projector and NO Sheets writer. A flag must never pretend those components
 * exist. Fail Firebase Functions initialization when someone enables the
 * worker prematurely, rather than consuming events without doing anything.
 *
 * A future implementation must replace this explicit blocker ONLY after
 * providing a real reconciler with source+history+readback evidence, and
 * passing a live TEST acceptance run.
 */
const {TEST_ID}=require('./sheets-inspector.cjs');
function assessRelease({env,sourceReconciler=null,googleWriteAdapter=null}={}){
  const project=env?.GCLOUD_PROJECT||env?.GCP_PROJECT||'';
  const staged=project==='cash-control-staging';
  const sourceReady=typeof sourceReconciler==='function';
  const writerReady=Boolean(googleWriteAdapter&&
    typeof googleWriteAdapter.writeMirror==='function'&&
    typeof googleWriteAdapter.readMirror==='function'&&
    typeof googleWriteAdapter.readHistory==='function');
  const errors=[];
  if(!staged)errors.push('NOT_ISOLATED_FIREBASE_STAGING');
  if(!sourceReady)errors.push('AUTHORITATIVE_SOURCE_MISSING');
  if(!writerReady)errors.push('SERVER_GOOGLE_TEST_WRITER_MISSING');
  if(env?.CASH_SHEETS_AUTHORIZED_TEST_ID!==TEST_ID)
    errors.push('TEST_SPREADSHEET_NOT_CONFIRMED');
  if(env?.CASH_SHEETS_LIVE_READBACK_VERIFIED!=='YES')
    errors.push('LIVE_GOOGLE_READBACK_NOT_CONFIRMED');
  return {ready:errors.length===0,errors,
    autoWriteEnabled:errors.length===0&&env?.CASH_SHEETS_WORKER_ENABLED==='YES'};
}
function assertCanEnableWorker({env,sourceReconciler,googleWriteAdapter}={}){
  if(env?.CASH_SHEETS_WORKER_ENABLED!=='YES')return {status:'off'};
  const r=assessRelease({env,sourceReconciler,googleWriteAdapter});
  if(!r.ready)throw Error('Unsafe TEST Cash Sheets worker activation blocked: '+r.errors.join(','));
  return {status:'ready'};
}
module.exports={assessRelease,assertCanEnableWorker};
