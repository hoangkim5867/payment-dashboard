'use strict';
/**
 * Single-project S13-2 original-history proof. No Firebase Payment scans,
 * no Google writes, no release authorization and no source-complete claims.
 * The destination is a server-pinned original ledger, never browser supplied.
 */
const {verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {auditHistory}=require('../server/cash-sync-multi-project-core.cjs');
const PROJECT='cscecmep-payment';
const FILE='1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg';
const GID=1543850344;
const BASELINE=65583133;
const OCTOBER_COST=81463753+3859500+52923736;
const PREFIX='https://sheets.googleapis.com/v4/spreadsheets/';
function fail(code,statusCode=409){
 throw Object.assign(new Error(code),{statusCode});
}
function configured(env){
 if(env?.VERCEL_ENV!=='production'||env.CASH_SYNC_FIREBASE_PROJECT_ID!==PROJECT||
    !/^[A-Za-z0-9_-]{4,128}$/.test(env.CASH_SYNC_ADMIN_UID||''))
  fail('PRODUCTION_ADMIN_REQUIRED',403);
 return {project:PROJECT,uid:env.CASH_SYNC_ADMIN_UID};
}
function validRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='month,project'||
    body.project!=='S13-2'||body.month!=='2026-10')
  fail('S13_SCOPE_ONLY',400);
}
async function jsonGet(fetcher,url,authorization){
 const res=await fetcher(url,{method:'GET',
  headers:{Authorization:'Bearer '+authorization},signal:AbortSignal.timeout(20000)});
 if(!res?.ok)fail('GOOGLE_READ_DENIED',502);
 return res.json();
}
function summarizeHistory(meta,grid){
 if(meta?.spreadsheetId!==FILE||!Array.isArray(meta.sheets))
  fail('GOOGLE_ORIGINAL_FILE_NOT_VERIFIED');
 const prop=meta.sheets.map(x=>x?.properties).find(x=>x?.sheetId===GID);
 if(!prop||prop.hidden===true||!prop.title||typeof prop.title!=='string'||
    prop.title.length>120||/^(DATA_CASHCONTROL|CASHCONTROL_VIEW|DATA_CASHCONTROL_TEST_)/i.test(prop.title))
  fail('GOOGLE_ORIGINAL_GID_NOT_VERIFIED');
 if(!Array.isArray(grid?.values)||grid.values.length>20000)
  fail('GOOGLE_ORIGINAL_HISTORY_INVALID');
 const raw=grid.values;
 let history;
 try{history=auditHistory(raw);}catch{fail('GOOGLE_ORIGINAL_BALANCE_AUDIT_FAILED');}
 const entries=history.entries;
 let inversions=0;
 for(let i=1;i<entries.length;i++)
  if(entries[i].values[0]<entries[i-1].values[0])inversions++;
 const october=entries.filter(x=>x.values[0]>='2026-10-01').length;
 const expectedClosing=BASELINE-OCTOBER_COST;
 const passes=entries.length===258&&inversions===2&&october===0&&
  Math.abs(history.closingBalance-BASELINE)<0.000001&&
  history.maxDate<'2026-10-01';
 return Object.freeze({
  kind:'S13_ORIGINAL_HISTORY_READONLY',project:'S13-2',month:'2026-10',
  fileMatched:true,historyGidMatched:true,
  historyTransactions:entries.length,dateInversions:inversions,
  octoberHistoryRows:october,historyLastDate:history.maxDate,
  historyClosingBalance:history.closingBalance,
  expectedClosingIfSourceVerified:expectedClosing,
  originalHistoryMatched:passes,
  reviewStatus:passes?'HISTORY_BASELINE_MATCHED':'HISTORY_REVIEW_REQUIRED',
  sourceComplete:false,canSync:false,writeAuthorized:false,
  firestoreReads:0,paymentReads:0,googleReads:2,googleWrites:0
 });
}
async function inspect({env,body,firebaseJwt,googleToken,fetcher=fetch,
 verifyAdmin=verifyFirebaseAdminToken}={}){
 const config=configured(env);validRequest(body);
 if(typeof googleToken!=='string'||googleToken.length<20||googleToken.length>4096||
    !/^[A-Za-z0-9._~-]+$/.test(googleToken))
  fail('GOOGLE_READONLY_TOKEN_REQUIRED',401);
 await verifyAdmin(firebaseJwt,config);
 const base=PREFIX+FILE;
 const metadata=await jsonGet(fetcher,base+
  '?fields=spreadsheetId,sheets(properties(sheetId,title,hidden))',googleToken);
 if(metadata?.spreadsheetId!==FILE||!Array.isArray(metadata.sheets))
  fail('GOOGLE_ORIGINAL_FILE_NOT_VERIFIED');
 const tab=metadata.sheets.map(x=>x?.properties).find(x=>x?.sheetId===GID);
 if(!tab||tab.hidden===true||!tab.title||tab.title.length>120||
    /^(DATA_CASHCONTROL|CASHCONTROL_VIEW|DATA_CASHCONTROL_TEST_)/i.test(tab.title))
  fail('GOOGLE_ORIGINAL_GID_NOT_VERIFIED');
 const quoted="'"+tab.title.replace(/'/g,"''")+"'";
 const grid=await jsonGet(fetcher,base+'/values/'+
  encodeURIComponent(quoted+'!A1:O20000')+
  '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER',googleToken);
 return summarizeHistory(metadata,grid);
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers?.host||req.headers.origin!=='https://'+req.headers.host)
  return res.status(403).json({error:'CROSS_ORIGIN'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer '))fail('GOOGLE_READONLY_TOKEN_REQUIRED',401);
  const result=await inspect({env:process.env,body,
   firebaseJwt:String(req.headers['x-firebase-id-token']||''),
   googleToken:auth.slice(7)});
  return res.status(200).json(result);
 }catch(err){
  const status=[400,401,403,405,409,502].includes(err?.statusCode)?
    err.statusCode:500;
  return res.status(status).json({
   error:/^[A-Z0-9_]+$/.test(String(err?.message))?err.message:'S13_PROOF_FAILED',
   googleWrites:0,canSync:false
  });
 }
}
module.exports=handler;
module.exports._internals={configured,validRequest,summarizeHistory,inspect,BASELINE,OCTOBER_COST};
