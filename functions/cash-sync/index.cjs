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
const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {runReadProbe,validateCaller}=require('./service-probe.cjs');
const {createAdcInspector}=require('./sheets-inspector.cjs');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {enqueueEvent}=require('./core.cjs');
const {stageEnabled,runWorker}=require('./worker.cjs');
const {createJobStore}=require('./worker-store.cjs');
const {assertCanEnableWorker}=require('./release-gate.cjs');
const {ingestEnvelope,DESTINATION}=require('./relay-bridge.cjs');
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

/*
 * IAM-PRIVATE cross-project event intake: only the explicitly approved
 * production relay service account may receive roles/run.invoker on this
 * Cloud Run function. Payload contains only event ID, project, month and
 * controlled reason codes. No payee, bank, amount, Firebase source snapshot.
 * Never expose a public or unauthenticated invocation role.
 */
exports.ingestCashSyncEvent=onRequest(
  {region,invoker:'private',maxInstances:1,concurrency:1,timeoutSeconds:30},
  async (request,response)=>{
    if((process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT)!==DESTINATION||
       process.env.CASH_SHEETS_RELAY_INGEST_ENABLED!=='YES'){
      response.status(503).json({status:'disabled'});return;
    }
    if(request.method!=='POST'||
       !String(request.headers['content-type']||'').startsWith('application/json')){
      response.status(405).json({status:'rejected'});return;
    }
    const payload=request.body;
    if(!payload||typeof payload!=='object'||
       Buffer.byteLength(JSON.stringify(payload),'utf8')>2048){
      response.status(400).json({status:'invalid'});return;
    }
    try{
      const outcome=await ingestEnvelope({
        env:process.env,envelope:payload,writer
      });
      response.status(outcome.status==='disabled'?503:200).json(outcome);
    }catch(error){
      if(error?.code===6||error?.code==='already-exists'){
        response.status(200).json({status:'duplicate'});return;
      }
      if(/envelope|event|payload|scope|months|reason|identity|hash|Invalid/.test(
        String(error?.message||''))){
        response.status(400).json({status:'invalid'});return;
      }
      // A 5xx makes the production CloudEvent relay retry. Never log or
      // return raw financial request bodies or Google credentials.
      response.status(503).json({status:'retry'});
    }
  }
);
