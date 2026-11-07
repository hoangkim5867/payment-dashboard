'use strict';
/*
 * Deliberately separate from the staging Cash Control web/Firebase app.
 * Deploy only after explicit approval to the production Firebase project.
 * This trigger never reads Firestore, writes Firestore, or touches Sheets.
 */
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {sendProductionEvent,googleOidcSender,gate}=require('./outbound.cjs');
const project=process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT;
if(process.env.CASH_SHEETS_PRODUCTION_RELAY_ENABLED==='YES')gate(process.env);
const opts={region:'asia-southeast1',retry:true,maxInstances:2,concurrency:1,
  timeoutSeconds:40};
async function forward(event,source){
  const before=event.data?.before?.data?.()||null;
  const after=event.data?.after?.data?.()||null;
  return sendProductionEvent({
    env:process.env,eventId:event.id,source,before,after,
    sender:googleOidcSender
  });
}
exports.forwardPhuHungPayment=onDocumentWritten(
  {...opts,document:'payments/{paymentId}'},
  async event=>forward(event,'payment')
);
exports.forwardPhuHungCashControl=onDocumentWritten(
  {...opts,document:'cash_control_private/{docId}'},
  async event=>{
    if(event.params?.docId!=='lehoangoanh')return {status:'irrelevant'};
    return forward(event,'cash-private');
  }
);
