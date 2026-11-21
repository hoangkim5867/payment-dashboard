'use strict';
/* FOXCONN Google TEST history audit, Admin-initiated and READ ONLY.
 * Does not read Firebase documents, authorize writes or use a browser-supplied
 * Google file ID. All Google requests are GETs against a server allowlisted
 * TEST workbook. Historical rows are not relayed to the client.
 */
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {readTargets}=require('../server/cash-shared-test-targets.cjs');
const {auditHistory}=require('../server/cash-sync-multi-project-core.cjs');
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const MAX_ROWS=20000;
function fail(message,code=409){
 throw Object.assign(new Error(message),{statusCode:code});
}
async function audit({env,project='FOXCONN',firebaseJwt,googleToken,
  fetcher=fetch,verifyAdmin=verifyFirebaseAdminToken}={}){
 if(env?.VERCEL_ENV!=='preview')fail('TEST_PREVIEW_ONLY',403);
 if(project!=='FOXCONN')fail('ONLY_FOXCONN_TEST',403);
 const targets=readTargets(env);
 const target=targets.get(project);
 if(!target||target.isTestCopy!==true)fail('FOXCONN_TEST_NOT_CONFIGURED',403);
 const config=readConfig(env);
 await verifyAdmin(firebaseJwt,config);
 if(typeof googleToken!=='string'||
   !/^[A-Za-z0-9._~-]{20,4096}$/.test(googleToken))
   fail('GOOGLE_TOKEN_REQUIRED',401);
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+
   encodeURIComponent(target.spreadsheetId);
 const headers={Authorization:'Bearer '+googleToken};
 let reads=0;
 async function google(path){
   const result=await fetcher(base+path,{
     method:'GET',headers,signal:AbortSignal.timeout(18000)
   });
   reads++;
   if(!result?.ok)fail('GOOGLE_TEST_READ_'+String(result?.status||'ERROR'),502);
   return result.json();
 }
 const meta=await google('?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId,hidden))');
 if(meta?.spreadsheetId!==target.spreadsheetId||
    meta?.properties?.title!==target.title||!Array.isArray(meta.sheets))
    fail('FOXCONN_TEST_FILE_MISMATCH');
 const tabs=meta.sheets.map(s=>s?.properties).filter(Boolean);
 const machine=tabs.find(p=>p.title===target.tab);
 if(!machine||machine.hidden===true)fail('FOXCONN_TEST_MACHINE_TAB_MISSING');
 const excluded=new Set([target.tab,'DATA_CASHCONTROL','CASHCONTROL_VIEW',
   'DATA_CASHCONTROL_DEMO','PHU_HUNG_VIEW_TEST']);
 const historicCandidates=tabs.filter(p=>p.hidden!==true&&
   typeof p.title==='string'&&!excluded.has(p.title));
 const exact=historicCandidates.filter(p=>p.title.trim().toUpperCase()==='FOXCONN');
 const history=exact.length===1?exact[0]:
   historicCandidates.length===1?historicCandidates[0]:null;
 if(!history)fail('FOXCONN_TEST_HISTORY_TAB_AMBIGUOUS');
 const machineRange=encodeURIComponent("'"+target.tab.replace(/'/g,"''")+"'!A1:O1");
 const machineHeader=await google('/values/'+machineRange+
   '?valueRenderOption=UNFORMATTED_VALUE');
 if(JSON.stringify(machineHeader.values?.[0])!==JSON.stringify(HEADER))
   fail('FOXCONN_TEST_MACHINE_HEADER_MISMATCH');
 const historyRange=encodeURIComponent("'"+history.title.replace(/'/g,"''")+"'!A1:O"+MAX_ROWS);
 const book=await google('/values/'+historyRange+
   '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
 if(!Array.isArray(book.values)||book.values.length>MAX_ROWS)
   fail('FOXCONN_TEST_HISTORY_ROWS_INVALID');
 let result;
 try{result=auditHistory(book.values,{foxconn:true});}
 catch{fail('FOXCONN_TEST_HISTORY_BALANCE_REVIEW_REQUIRED');}
 let regressions=0;
 for(let i=1;i<result.entries.length;i++){
   if(result.entries[i].values[0]<result.entries[i-1].values[0])regressions++;
 }
 return Object.freeze({
   project:'FOXCONN',mode:'history-audit',fileVerified:true,
   historicalRows:result.entries.length,closingBalance:result.closingBalance,
   dateRegressions:regressions,
   matchesPreviousBaseline:result.entries.length===271&&
     Math.abs(result.closingBalance-35246364496)<0.000001,
   historicalFingerprint:result.fingerprint,
   originalUntouched:true,canWrite:false,writes:0,
   firestoreReads:0,googleReads:reads
 });
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers?.host||req.headers?.origin!=='https://'+req.headers.host)
   return res.status(403).json({error:'CROSS_ORIGIN'});
 try{
   const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).join(',')!=='project'||input.project!=='FOXCONN')
     fail('ONLY_FOXCONN_TEST',400);
   const auth=String(req.headers.authorization||'');
   if(!auth.startsWith('Bearer '))fail('GOOGLE_TOKEN_REQUIRED',401);
   const result=await audit({env:process.env,project:input.project,
     firebaseJwt:String(req.headers['x-firebase-id-token']||''),
     googleToken:auth.slice(7)});
   return res.status(200).json(result);
 }catch(err){
   return res.status(err.statusCode||500).json({error:
     /^[A-Z0-9_]+$/.test(String(err.message||''))?
       err.message:'FOXCONN_TEST_HISTORY_AUDIT_FAILED',writes:0});
 }
}
module.exports=handler;
module.exports._internals={audit};
