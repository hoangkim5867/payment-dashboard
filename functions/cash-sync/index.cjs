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
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {enqueueEvent}=require('./core.cjs');
const {stageEnabled,runWorker}=require('./worker.cjs');
const {createJobStore}=require('./worker-store.cjs');
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
  {...options,document:'cash_sync_outbox/{jobId}'},
  async event=>{
    if(!stageEnabled(process.env))return {status:'disabled'};
    const jobId=String(event.params?.jobId||'');
    return runWorker({
      jobId,env:process.env,store:createJobStore(getFirestore()),
      reconcile:undefined
    });
  }
);
