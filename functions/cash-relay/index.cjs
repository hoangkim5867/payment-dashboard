'use strict';
/*
 * Deliberately separate from the staging Cash Control web/Firebase app.
 * Deploy only after explicit approval to the production Firebase project.
 * This trigger never reads Firestore, writes Firestore, or touches Sheets.
 */
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {sendProductionEvent,googleOidcSender,gate}=require('./outbound.cjs');
const {scope,sameAccountingProjection,createCacheStore}=require('./source-cache.cjs');
const {onRequest}=require('firebase-functions/v2/https');
const {isSourceAuthorized,createCanonicalSourceReader}=require('./canonical-source-reader.cjs');
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
     source==='payment'&&(scope(before)||scope(after))&&
     !sameAccountingProjection(event.params?.paymentId,before,after)){
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
      // Native Firestore after.updateTime is authoritative for creations
      // and edits; deletion must use CloudEvent time because no after doc.
      time:event.data?.after?.updateTime||event.time,before,after
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

/*
 * Separate IAM-PRIVATE canonical source endpoint for the TEST service
 * identity. Never public. Only 13-column normalized Cash Control rows
 * can leave production; raw Payment, bank data, protected history and
 * Firestore credentials are never returned.
 */
exports.readPhuHungCanonicalSource=onRequest(
  {region:'asia-southeast1',invoker:'private',maxInstances:1,
    concurrency:1,timeoutSeconds:60},
  async(req,res)=>{
    if(!isSourceAuthorized(process.env)){
      res.status(503).json({status:'disabled'});return;
    }
    if(req.method!=='POST'||
       !String(req.headers['content-type']||'').startsWith('application/json')){
      res.status(405).json({status:'rejected'});return;
    }
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).sort().join(',')!=='month,project'||
       JSON.stringify(body).length>128){
      res.status(400).json({status:'invalid'});return;
    }
    try{
      const {initializeApp,getApps}=require('firebase-admin/app');
      const {getFirestore}=require('firebase-admin/firestore');
      if(!getApps().length)initializeApp();
      const reader=createCanonicalSourceReader({db:getFirestore()});
      const source=await reader(body);
      res.status(200).json(source);
    }catch(error){
      // Never disclose raw financial/source details or credentials.
      const msg=String(error?.message||'');
      if(/scope|request/.test(msg)){
        res.status(400).json({status:'invalid'});return;
      }
      if(/bootstrap audit|Incomplete server source|revision\/records|Protected history/.test(msg)){
        res.status(409).json({status:'source-not-yet-verified'});return;
      }
      res.status(503).json({status:'source-unavailable'});
    }
  }
);
