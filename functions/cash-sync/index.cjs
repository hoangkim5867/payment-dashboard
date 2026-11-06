'use strict';
/*
 * Firebase Cloud Functions v2 ENTRYPOINT — NOT deployed by Vercel.
 * Install/deploy only to the separate cash-control-staging Firebase project.
 *
 * Two Firestore on-write event listeners enqueue small invalidation markers.
 * They do not read Firebase documents, poll Payment, hold Google OAuth tokens
 * or write Google Sheets. A separate, independently authorized reconciler
 * is required before any unattended financial sheet mutation.
 */
const {onDocumentWritten,onDocumentCreated}=require('firebase-functions/v2/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {runReadProbe,validateCaller}=require('./service-probe.cjs');
const {createAdcInspector}=require('./sheets-inspector.cjs');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {enqueueEvent}=require('./core.cjs');
const {stageEnabled,runWorker}=require('./worker.cjs');
const {createJobStore}=require('./worker-store.cjs');
const {assertCanEnableWorker}=require('./release-gate.cjs');
// No server-side canonical projector or TEST writer is connected yet.
// Refuse to deploy a misleading active worker; TEST read probe is separate.
assertCanEnableWorker({env:process.env});
if(!getApps().length)initializeApp();
const region='asia-southeast1';
const options={region,retry:true,maxInstances:2,concurrency:1};
const writer={
  create:(collection,id,job)=>getFirestore().collection(collection).doc(id).create(job)
};
async function route(event,source){
  const before=event.data?.before?.data?.()||null;
  const after=event.data?.after?.data?.()||null;
  return enqueueEvent({
    eventId:event.id,source,before,after,env:process.env,writer
  });
}
exports.captureCashControlChange=onDocumentWritten(
  {...options,document:'cash_control_private/{docId}'},
  async event=>{
    if(event.params.docId!=='lehoangoanh')return;
    return route(event,'cash-private');
  }
);
exports.capturePaymentChange=onDocumentWritten(
  {...options,document:'payments/{paymentId}'},
  async event=>route(event,'payment')
);

/*
 * Separate, deliberately gated queue consumer. Cloud Functions deployment
 * does NOT imply it can write Sheets. Until an authoritative full-source
 * reconciler is implemented, the coordinator returns missing-reconciler
 * before claiming a job. No source is fabricated from the event alone.
 */
exports.processCashSyncOutbox=onDocumentCreated(
  {...options,timeoutSeconds:90,document:'cash_sync_outbox/{jobId}'},
  async event=>{
    if(!stageEnabled(process.env))return {status:'disabled'};
    const jobId=String(event.params?.jobId||'');
    return runWorker({
      jobId,env:process.env,store:createJobStore(getFirestore()),
      reconcile:undefined
    });
  }
);

/*
 * Opt-in read-only TEST diagnostic. A browser/Admin ID token is required.
 * This never returns spreadsheet rows and cannot write anything. Disabled
 * until the isolated staging Firebase project's env and Google sharing
 * have been explicitly configured and verified.
 */
exports.checkCashSheetsTestAccess=onCall(
  {region,maxInstances:1},
  async request=>{
    try{validateCaller({env:process.env,auth:request.auth})}
    catch(error){
      throw new HttpsError(error?.code==='permission-denied'
        ?'permission-denied':'failed-precondition','TEST Sheets probe unavailable.');
    }
    return runReadProbe({
      env:process.env,auth:request.auth,
      inspectorFactory:createAdcInspector
    });
  }
);
