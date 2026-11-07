'use strict';
/*
 * Production-side event-only relay. Never reads Firestore records, never
 * sends payees, money, bank details or raw snapshots to staging. Workload
 * identity must have roles/run.invoker only on the PRIVATE staging receiver.
 */
const {buildEnvelope,ORIGIN,DESTINATION}=require('./relay-bridge.cjs');
function gate(env){
  const project=env?.GCLOUD_PROJECT||env?.GCP_PROJECT;
  if(project!==ORIGIN||env?.CASH_SHEETS_PRODUCTION_RELAY_ENABLED!=='YES')
    return {enabled:false};
  if(env?.CASH_SHEETS_RELAY_TARGET_PROJECT!==DESTINATION)
    throw Error('Unapproved Cloud destination project.');
  const url=String(env?.CASH_SHEETS_RELAY_TARGET_URL||'');
  let parsed;
  try{parsed=new URL(url)}catch{throw Error('Missing verified private relay target URL.')}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||
     parsed.search||parsed.hash||parsed.port||
     !(/\.a\.run\.app$/.test(parsed.hostname)||
       /\.cloudfunctions\.net$/.test(parsed.hostname)))
    throw Error('Relay target must be a direct Google Cloud HTTPS endpoint.');
  if(parsed.pathname!=='/'&&parsed.pathname!=='/ingestCashSyncEvent')
    throw Error('Relay target path is not the approved importer.');
  return {enabled:true,targetUrl:parsed.href};
}
async function sendProductionEvent({env,eventId,source,before,after,
  sender}){
  const release=gate(env);
  if(!release.enabled)return {status:'disabled'};
  const envelope=buildEnvelope({eventId,source,before,after});
  if(!envelope)return {status:'irrelevant'};
  if(typeof sender!=='function')throw Error('OIDC sender is required');
  // Fail closed. The Firebase trigger retries if the private importer returns
  // 429/5xx. Import uses a deterministic eventId for idempotent create().
  const response=await sender(release.targetUrl,envelope);
  if(!['enqueued','duplicate'].includes(response?.status))
    throw Error('TEST importer did not acknowledge the event');
  return {status:response.status};
}
async function googleOidcSender(url,envelope){
  // ADC is the Cloud Function's dedicated service identity. Never use a
  // browser token or checked-in service account private key.
  const {GoogleAuth}=require('google-auth-library');
  const auth=new GoogleAuth();
  const client=await auth.getIdTokenClient(url);
  const response=await client.request({
    url,method:'POST',data:envelope,timeout:15000,
    headers:{'Content-Type':'application/json'}
  });
  return response?.data;
}
module.exports={gate,sendProductionEvent,googleOidcSender};
