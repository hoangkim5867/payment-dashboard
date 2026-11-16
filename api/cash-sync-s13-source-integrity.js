'use strict';
/* S13-2 October, two signed Firestore document GETs, zero writes.
 * Checks two live manual payroll IDs plus two protected immutable seed IDs.
 * Neither this endpoint nor its response authorizes Production Google sync. */
const {verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {inspectS13}=require('../server/cash-sync-s13-source-integrity.cjs');
const HOST='https://firestore.googleapis.com/v1/projects/cscecmep-payment/databases/(default)/documents';
function stop(code,statusCode=409){throw Object.assign(Error(code),{statusCode})}
function config(env){
 if(env?.VERCEL_ENV!=='production'||
    env.CASH_SYNC_FIREBASE_PROJECT_ID!=='cscecmep-payment'||
    !/^[A-Za-z0-9_-]{4,128}$/.test(env.CASH_SYNC_ADMIN_UID||''))
  stop('S13_PRODUCTION_ADMIN_REQUIRED',403);
 return {project:'cscecmep-payment',uid:env.CASH_SYNC_ADMIN_UID};
}
function valid(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
    Object.keys(body).sort().join(',')!=='month,project,revision,source'||
    body.project!=='S13-2'||body.month!=='2026-10'||
    !Number.isSafeInteger(body.revision)||body.revision<0||
    !Array.isArray(body.source)||body.source.length!==3||
    JSON.stringify(body).length>3000)
  stop('S13_INTEGRITY_SCOPE_INVALID',400);
 return body;
}
async function get(fetcher,id,jwt){
 const response=await fetcher(HOST+'/cash_control_private/'+id,{
  method:'GET',headers:{Authorization:'Bearer '+jwt},
  signal:AbortSignal.timeout(15000)});
 if(!response?.ok)stop('S13_SOURCE_DOCUMENT_UNAVAILABLE',502);
 return response.json();
}
async function verify({env,body,jwt,fetcher=fetch,verifyAdmin=verifyFirebaseAdminToken}={}){
 const auth=config(env); const input=valid(body);
 await verifyAdmin(jwt,auth);
 const [cashDocument,legacySeedDocument]=await Promise.all([
  get(fetcher,'lehoangoanh',jwt),get(fetcher,'legacy_seed_20261021_v1',jwt)]);
 return Object.freeze({
  ...inspectS13({cashDocument,legacySeedDocument,revision:input.revision,
    sourceRows:input.source}),
  firestoreRequests:2,paymentDocumentReads:0,googleReads:0,googleWrites:0
 });
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers?.host||req.headers.origin!=='https://'+req.headers.host)
  return res.status(403).json({error:'CROSS_ORIGIN'});
 try{
  const result=await verify({env:process.env,
   body:typeof req.body==='string'?JSON.parse(req.body):req.body,
   jwt:String(req.headers['x-firebase-id-token']||'')});
  return res.status(200).json(result);
 }catch(e){
  const status=[400,401,403,409,502].includes(e?.statusCode)?e.statusCode:500;
  return res.status(status).json({
   error:/^[A-Z0-9_]+$/.test(String(e?.message||''))?e.message:'S13_INTEGRITY_NOT_VERIFIED',
   canSync:false,sourceComplete:false,googleWrites:0
  });
 }
}
module.exports=handler;
module.exports._internals={config,valid,verify};
