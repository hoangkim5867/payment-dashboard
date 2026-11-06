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
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {enqueueEvent}=require('../../server/cash-sync-outbox.cjs');
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
