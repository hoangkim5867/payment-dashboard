'use strict';
// Read-only, authenticated Google TEST target probe.
// Does not require source snapshots; never requests transaction rows.
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {readTargets}=require('../server/cash-shared-test-targets.cjs');
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const MAX_JSON_BYTES=3000;
function fail(message,statusCode=403){const err=new Error(message);err.statusCode=statusCode;throw err}
async function probe({env,project,firebaseJwt,googleToken,fetcher=fetch,
  verifyAdmin=verifyFirebaseAdminToken}={}){
  if(env?.VERCEL_ENV!=='preview')fail('PREVIEW_ONLY');
  const targets=readTargets(env);
  const target=targets.get(project);
  if(!target)fail('PROJECT_NOT_ALLOWLISTED');
  const config=readConfig(env);
  if(config.project!==env.CASH_SYNC_FIREBASE_PROJECT_ID)
    fail('FIREBASE_PROJECT_MISMATCH');
  await verifyAdmin(firebaseJwt,config);
  if(typeof googleToken!=='string'||!/^[A-Za-z0-9._~-]{20,4096}$/.test(googleToken))
    fail('GOOGLE_TOKEN_REQUIRED',401);
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+
    encodeURIComponent(target.spreadsheetId);
  const headers={Authorization:'Bearer '+googleToken};
  const fetchJson=async(url)=>{
    const response=await fetcher(url,{
      method:'GET',headers,signal:AbortSignal.timeout(10000)});
    if(!response?.ok)fail('GOOGLE_TEST_READ_DENIED_'+(response?.status||'ERROR'),502);
    return response.json();
  };
  const meta=await fetchJson(base+
    '?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId,hidden))');
  if(meta.spreadsheetId!==target.spreadsheetId||
     meta.properties?.title!==target.title||
     !Array.isArray(meta.sheets))
    fail('TEST_SHEET_IDENTITY_MISMATCH');
  const entry=meta.sheets.find(s=>s.properties?.title===target.tab);
  if(!entry||entry.properties?.hidden===true)fail('TEST_TAB_NOT_READY');
  const range=encodeURIComponent("'"+target.tab+"'!A1:O1");
  const header=await fetchJson(base+'/values/'+range+
    '?valueRenderOption=UNFORMATTED_VALUE');
  if(JSON.stringify(header.values?.[0])!==JSON.stringify(HEADER))
    fail('TEST_HEADER_NOT_READY');
  return Object.freeze({project:target.project,
    fileVerified:true,tabVerified:true,headerVerified:true,
    canWrite:false,writes:0,firestoreReads:0,googleReads:2});
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
  const origin=String(req.headers?.origin||'');
  const host=String(req.headers?.host||'');
  if(!host||origin!=='https://'+host)
    return res.status(403).json({error:'CROSS_ORIGIN'});
  try{
    const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!data||typeof data!=='object'||Array.isArray(data)||
       JSON.stringify(data).length>MAX_JSON_BYTES||
       Object.keys(data).sort().join(',')!=='project'||
       typeof data.project!=='string'||data.project.length>100)
      fail('INVALID_REQUEST');
    const auth=String(req.headers?.authorization||'');
    if(!auth.startsWith('Bearer '))fail('GOOGLE_TOKEN_REQUIRED',401);
    const result=await probe({env:process.env,project:data.project,
      firebaseJwt:String(req.headers['x-firebase-id-token']||''),
      googleToken:auth.slice(7)});
    return res.status(200).json(result);
  }catch(error){
    // Never relay OAuth token, financial rows, Google spreadsheet ID, or
    // privileged Admin identifiers to callers.
    return res.status(error.statusCode||502).json({
      error:/^[A-Z0-9_]+$/.test(error.message)?error.message:
        'GOOGLE_TEST_VERIFICATION_FAILED'});
  }
}
module.exports=handler;
module.exports._internals={probe};
