'use strict';
/* Admin-only, read-only lookup of verified-but-NOT-YET-APPROVED
 * Cash Control Google destinations.
 * This endpoint never reads Google, Payment or Firebase documents and never
 * enables any target for writes. Active allowlist is deliberately ignored.
 */
const {verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {parseAllowlist}=require('../server/cash-sync-multi-targets.cjs');
function fail(code,statusCode=409){throw Object.assign(Error(code),{statusCode});}
async function inspect({env,token,verifyAdmin=verifyFirebaseAdminToken}={}){
 if(!env||env.VERCEL_ENV!=='production'||
    env.CASH_SYNC_FIREBASE_PROJECT_ID!=='cscecmep-payment'||
    !/^[A-Za-z0-9_-]{4,128}$/.test(env.CASH_SYNC_ADMIN_UID||''))
   fail('PRODUCTION_ADMIN_REQUIRED',403);
 return Promise.resolve(verifyAdmin(token,{project:'cscecmep-payment',
   uid:env.CASH_SYNC_ADMIN_UID})).then(()=>{
   let pending;
   try{pending=parseAllowlist(env.CASH_SYNC_MULTI_PENDING_TARGETS);}
   catch{fail('PENDING_TARGET_MAPPING_INVALID',503);}
   if(!pending.size||pending.size>35)fail('PENDING_TARGET_MAPPING_MISSING',503);
   const projects=Array.from(pending,([project,entry])=>({
     project,spreadsheetId:entry.spreadsheetId,
     historySheetId:entry.historySheetId,
     link:'https://docs.google.com/spreadsheets/d/'+entry.spreadsheetId+
       '/edit#gid='+entry.historySheetId
   }));
   return Object.freeze({
     kind:'CASH_SYNC_PENDING_TARGET_LINKS_READONLY_V1',
     projects,configured:projects.length,
     canWrite:false,sourceComplete:false,openingBalancesVerified:false,
     firestoreReads:0,googleReads:0,googleWrites:0
   });
 });
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers?.host||req.headers?.origin!=='https://'+req.headers.host)
   return res.status(403).json({error:'CROSS_ORIGIN',googleWrites:0});
 try{
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||Array.isArray(body)||Object.keys(body).join(',')!=='action'||
     body.action!=='pending_links')fail('INVALID_REQUEST',400);
   const token=String(req.headers['x-firebase-id-token']||'');
   return res.status(200).json(await inspect({env:process.env,token}));
 }catch(error){
   const status=[400,403,405,409,503].includes(error?.statusCode)?
     error.statusCode:500;
   return res.status(status).json({error:/^[A-Z0-9_]+$/.test(String(error.message))?
     error.message:'PENDING_LINK_READ_FAILED',googleWrites:0});
 }
}
module.exports=handler;
module.exports._internals={inspect};
