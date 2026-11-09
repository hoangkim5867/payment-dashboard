'use strict';
// Manual Admin-only, read-only inspection of a SINGLE configured project.
// Client provides one project URL and a normalized Cash Control source snapshot.
// No persistence and no Google/Firestore writes; production deployment not enabled.
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {validateLinkDraft}=require('../server/cash-sync-link-draft.cjs');
const {readOnlyProjectAudit}=require('../server/cash-sync-multiproject-google-read.cjs');
async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)
    return res.status(403).json({error:'Invalid origin'});
  try{
    // Explicit safe preview deployment gate. No production access to this endpoint.
    if(process.env.VERCEL_ENV==='production')
      return res.status(403).json({error:'TEST preflight only'});
    const config=readConfig({...process.env,VERCEL_ENV:'preview'});
    await verifyFirebaseAdminToken(String(req.headers['x-firebase-id-token']||''),config);
    const googleAuth=String(req.headers.authorization||'');
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       JSON.stringify(body).length>600000)
      return res.status(413).json({error:'Invalid preflight payload'});
    if(typeof body.project!=='string'||typeof body.url!=='string'||
       !Array.isArray(body.sourceRows)||body.sourceRows.length>6000)
      return res.status(400).json({error:'Invalid project/source'});
    // Explicit one-project registry, no arbitrary Google URL fetch.
    const registry=validateLinkDraft({
      schema:'CASH_SYNC_PROJECT_LINK_DRAFT_V1',
      projects:{[body.project]:body.url}
    },[body.project]);
    const entry=registry.entries[0];
    if(!entry)return res.status(400).json({error:'Missing link'});
    const result=await readOnlyProjectAudit(entry,body.sourceRows,
      body.confirmedOpeningBalance,googleAuth);
    return res.status(200).json(result);
  }catch(e){
    const status=[400,401,403,409,413,502,503].includes(e?.statusCode)?
      e.statusCode:409;
    return res.status(status).json({error:status===409?
      'Preflight could not verify historical data; no changes made':
      String(e.message).slice(0,160),canWrite:false});
  }
}
module.exports=handler;
