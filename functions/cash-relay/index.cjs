'use strict';
/*
 * Deliberately separate from the staging Cash Control web/Firebase app.
 * Deploy only after explicit approval to the production Firebase project.
 * This trigger never reads Firestore, writes Firestore, or touches Sheets.
 */
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {sendProductionEvent,googleOidcSender,gate}=require('./outbound.cjs');
const {scope,createCacheStore}=require('./source-cache.cjs');
const project=process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT;
if(process.env.CASH_SHEETS_PRODUCTION_RELAY_ENABLED==='YES'){
  gate(process.env);
  if(process.env.CASH_SHEETS_PRODUCTION_CACHE_ENABLED!=='YES')
    throw Error('Production relay cannot run before scoped source caching is approved.');
}
const opts={region:'asia-southeast1',retry:true,maxInstances:2,concurrency:1,
  timeoutSeconds:40};
async function forward(event,source){
  const before=event.data?.before?.data?.()||null;
  const after=event.data?.after?.data?.()||null;
  if(process.env.CASH_SHEETS_PRODUCTION_RELAY_ENABLED==='YES'&&
     source==='payment'&&(scope(before)||scope(after))){
    if(process.env.CASH_SHEETS_PRODUCTION_CACHE_ENABLED!=='YES')
      throw Error('Source cache must be explicitly enabled before relaying Payment.');
    // Cache only the one changed PHU HUNG Payment document. This costs
    // a scoped Firestore transaction (one doc read + write when changed),
    // not a fresh project/company query per event.
    const {initializeApp,getApps}=require('firebase-admin/app');
    const {getFirestore}=require('firebase-admin/firestore');
    if(!getApps().length)initializeApp();
    await createCacheStore(getFirestore()).apply({
      paymentId:event.params?.paymentId,eventId:event.id,
      time:event.time,before,after
    });
    // If an event loses its lease or source cache is incomplete, the
    // downstream authoritative projector will fail closed.
  }
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
