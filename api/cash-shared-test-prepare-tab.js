'use strict';
// Explicit, Admin-initiated preparation of a NEW, empty machine-managed TEST
// tab only. No history edits, no Cash Control writes, no production support.
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {readTargets}=require('../server/cash-shared-test-targets.cjs');
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
function fail(code,statusCode=403){throw Object.assign(Error(code),{statusCode})}
async function prepare({env,project,firebaseJwt,googleToken,fetcher=fetch,
  verifyAdmin=verifyFirebaseAdminToken}={}){
  if(env?.VERCEL_ENV!=='preview')fail('PREVIEW_ONLY');
  const target=readTargets(env).get(project);
  if(!target)fail('TEST_PROJECT_NOT_ALLOWED');
  const cfg=readConfig(env);
  if(cfg.project!==env.CASH_SYNC_FIREBASE_PROJECT_ID)fail('STAGING_CONFIG_MISMATCH');
  await verifyAdmin(firebaseJwt,cfg);
  if(!/^[A-Za-z0-9._~-]{20,4096}$/.test(String(googleToken||'')))
    fail('GOOGLE_OAUTH_REQUIRED',401);
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(target.spreadsheetId);
  const headers={Authorization:'Bearer '+googleToken};
  async function google(path,method='GET',body){
    const response=await fetcher(base+path,{method,headers:{
      ...headers,...(body?{'Content-Type':'application/json'}:{})
    },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(14000)});
    if(!response?.ok)fail('GOOGLE_TEST_API_'+(response?.status||'ERROR'),502);
    return response.json();
  }
  const meta=await google('?fields=spreadsheetId,properties(title),sheets(properties(title,hidden))');
  if(meta?.spreadsheetId!==target.spreadsheetId||
     meta?.properties?.title!==target.title||
     !Array.isArray(meta.sheets)||meta.sheets.length<1)
    fail('TEST_FILE_IDENTITY_MISMATCH');
  const other=meta.sheets.filter(x=>x.properties?.title!==target.tab);
  if(!other.length)fail('TEST_HISTORICAL_TAB_REQUIRED');
  let machine=meta.sheets.find(x=>x.properties?.title===target.tab);
  if(machine?.properties?.hidden===true)fail('TEST_TAB_HIDDEN');
  const range=encodeURIComponent("'"+target.tab+"'!A1:O2");
  let created=false;
  if(!machine){
    // Google rejects a duplicate tab title atomically if another request
    // concurrently creates it. Never delete or replace an existing tab.
    await google(':batchUpdate','POST',{requests:[{
      addSheet:{properties:{title:target.tab}}
    }]});
    created=true;
  }
  // Even if we just created this tab, read it before writing any header.
  const existing=await google('/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE');
  const values=Array.isArray(existing?.values)?existing.values:[];
  if(values.length){
    if(JSON.stringify(values[0])!==JSON.stringify(HEADER))
      fail('TEST_TAB_NOT_EMPTY_OR_UNEXPECTED_HEADER');
    // Do not modify an existing tab containing actual TEST transactions.
    return {status:'TEST_TAB_ALREADY_READY',created:false,
      project:target.project,canWrite:false,historyChanged:false,
      googleWrites:created?1:0};
  }
  await google('/values/'+encodeURIComponent("'"+target.tab+"'!A1:O1")+
    '?valueInputOption=RAW','PUT',{values:[HEADER]});
  const check=await google('/values/'+encodeURIComponent("'"+target.tab+"'!A1:O1")+
    '?valueRenderOption=UNFORMATTED_VALUE');
  if(JSON.stringify(check?.values?.[0])!==JSON.stringify(HEADER))
    fail('TEST_HEADER_READBACK_FAILED',409);
  return {status:'TEST_TAB_PREPARED',created,project:target.project,
    canWrite:false,historyChanged:false,googleWrites:created?2:1};
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
  const host=String(req.headers?.host||''),origin=String(req.headers?.origin||'');
  if(!host||origin!=='https://'+host)
    return res.status(403).json({error:'CROSS_ORIGIN'});
  try{
    const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!data||Array.isArray(data)||typeof data!=='object'||
       Object.keys(data).sort().join(',')!=='confirmed,project'||
       data.confirmed!==true||typeof data.project!=='string'||
       data.project.length>80)fail('EXPLICIT_CONFIRMATION_REQUIRED');
    const token=String(req.headers?.authorization||'');
    if(!token.startsWith('Bearer '))fail('GOOGLE_OAUTH_REQUIRED',401);
    const result=await prepare({env:process.env,project:data.project,
      firebaseJwt:String(req.headers['x-firebase-id-token']||''),
      googleToken:token.slice(7)});
    return res.status(200).json(result);
  }catch(error){
    return res.status(error.statusCode||502).json({error:
      /^[A-Z0-9_]+$/.test(error.message)?error.message:'TEST_PREPARE_FAILED'});
  }
}
module.exports=handler;
module.exports._internals={prepare};
