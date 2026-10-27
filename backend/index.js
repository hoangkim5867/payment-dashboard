'use strict';
// Firebase Cloud Functions v2, requires Blaze plan. Deploy ONLY after explicit
// production approval and staging verification. Not connected in this ZIP.
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {computeIndexV1,needsIndexRepair}=require('./payment-index-core.cjs');
if(!getApps().length)initializeApp();
exports.maintainPaymentIndexV1=onDocumentWritten({document:'payments/{paymentId}',region:'asia-southeast1'},async event=>{
  if(!event.data?.after?.exists)return;
  const ref=getFirestore().collection('payments').doc(event.params.paymentId);
  // Transaction computes against CURRENT document, not potentially stale event;
  // handles out-of-order triggers, concurrent edits, and avoids infinite loop.
  await getFirestore().runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)return;
    const data=snap.data();
    if(!needsIndexRepair(data))return;
    tx.update(ref,computeIndexV1(data));
  });
});
