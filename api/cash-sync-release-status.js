'use strict';
/* Metadata-only, Admin-authenticated. NO Google OAuth, no Google/Firebase reads
 * beyond Firebase JWKS public key cache. Never authorizes a write. */
const {verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {verifyTestAdmin}=require('../server/cash-sync-s13-test-admin.cjs');
const {inspectRelease}=require('../server/cash-sync-release-audit.cjs');
function stop(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
async function releaseInfo({env,token,body,verifyProduction=verifyFirebaseAdminToken,
 verifyPreview=verifyTestAdmin}={}){
 if(!env||!['production','preview'].includes(env.VERCEL_ENV))
   stop('RELEASE_ENV_UNSUPPORTED',403);
 if(env.VERCEL_ENV==='production'){
  const project=env.CASH_SYNC_FIREBASE_PROJECT_ID,uid=env.CASH_SYNC_ADMIN_UID;
  if(project!=='cscecmep-payment'||!/^[A-Za-z0-9_-]{4,128}$/.test(uid||''))
   stop('TRUSTED_PRODUCTION_ADMIN_NOT_CONFIGURED',503);
  await verifyProduction(token,{project,uid});
 }else await verifyPreview(token,env);
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='projects'||
    JSON.stringify(body).length>12000)stop('INVALID_RELEASE_REQUEST');
 return inspectRelease({env,projects:body.projects});
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)
   return res.status(403).json({error:'CROSS_ORIGIN'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const report=await releaseInfo({env:process.env,
   token:String(req.headers['x-firebase-id-token']||''),body});
  return res.status(200).json(report);
 }catch(e){
  const status=[400,403,405,409,503].includes(e?.statusCode)?e.statusCode:500;
  const message=String(e?.message||'');
  return res.status(status).json({error:/^[A-Z0-9_]+$/.test(message)?
    message:'RELEASE_AUDIT_DENIED',googleWrites:0,firestoreReads:0});
 }
}
module.exports=handler;
module.exports._internals={releaseInfo};
