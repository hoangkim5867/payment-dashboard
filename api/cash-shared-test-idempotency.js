'use strict';
/*
 * FOXCONN Google TEST transport smoke test (NOT a Cash Control source sync).
 * One explicitly confirmed, deterministic SIMULATED record at machine-tab row 2.
 * Never append, never touch original history/VIEW, never scan Firestore.
 * A second call is a strict no-op; any unexpected existing data fails closed.
 * Production and real Google workbooks are never eligible.
 */
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {readTargets}=require('../server/cash-shared-test-targets.cjs');
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const {auditHistory,sha}=require('../server/cash-sync-multi-project-core.cjs');
const SAMPLE=Object.freeze([
  'TEST_ONLY_FOXCONN_IDEMPOTENCY_V1','FOXCONN','2026-11-13',
  'SIMULATED_TEST_ONLY','DO NOT POST TO ACCOUNTS','TEST-LAB-000',
  'TEST-IPC-000',0,0,1,0,0,0,0,0
]);
// Single reviewed pilot: FOXCONN repaid ELYSIAN on 26 Oct. The Admin
// reads the existing stable ID from the technical TEST tab.
function repaymentRow(sourceId){
 if(!/^FOXCONN:transfer:[A-Za-z0-9_-]{3,180}:out$/.test(String(sourceId||'')))
   stop('FOXCONN_TEST_TRANSFER_SOURCE_ID_INVALID',400);
 return [sourceId,'FOXCONN','2026-10-26','TRANSFER','Điều chuyển nội bộ','','',
   -5700000000,0,0,0,0,0,0,0];
}
const BASELINE_COUNT=271, BASELINE_BALANCE=35246364496;
function stop(code,statusCode=409){throw Object.assign(Error(code),{statusCode})}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function readStage(matrix){
 if(!Array.isArray(matrix)||!matrix.length||!same(matrix[0],HEADER))
   stop('TEST_MACHINE_HEADER_CHANGED');
 if(matrix.length===1)return 'EMPTY';
 if(matrix.length===2&&same(matrix[1],SAMPLE))return 'EXISTS';
 stop('TEST_MACHINE_TAB_CONTAINS_OTHER_DATA');
}
async function run({env,project='FOXCONN',action='preview',confirm,sourceId,
 firebaseJwt,googleToken,fetcher=fetch,verifyAdmin=verifyFirebaseAdminToken}={}){
 if(env?.VERCEL_ENV!=='preview'||env.CASH_SYNC_FIREBASE_PROJECT_ID!=='cash-control-staging')
   stop('TEST_PREVIEW_STAGING_ONLY',403);
 if(project!=='FOXCONN'||!['preview','commit'].includes(action))
   stop('ONLY_FOXCONN_TEST',400);
 const real=sourceId!==undefined;
 if(real&&(sourceId!==null||action!=='preview'))stop('FOXCONN_TEST_REPLAY_READ_ONLY',403);
 if(action==='commit'&&confirm!=='WRITE_TEST_SAMPLE_ONLY')
   stop('TEST_SAMPLE_CONFIRMATION_REQUIRED',403);
 const target=readTargets(env).get('FOXCONN');
 if(!target||target.isTestCopy!==true||target.tab!=='DATA_CASHCONTROL_TEST_FOXCONN')
   stop('FOXCONN_TEST_TARGET_NOT_ALLOWLISTED',403);
 const config=readConfig(env);
 if(config.project!=='cash-control-staging')stop('TEST_ADMIN_CONFIG_MISMATCH',403);
 await verifyAdmin(firebaseJwt,config);
 if(typeof googleToken!=='string'||!/^[A-Za-z0-9._~-]{20,4096}$/.test(googleToken))
   stop('GOOGLE_OAUTH_REQUIRED',401);
 let reads=0,writes=0;
 const root='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(target.spreadsheetId);
 async function google(endpoint,method='GET',body){
   const r=await fetcher(root+endpoint,{
     method,headers:{Authorization:'Bearer '+googleToken,
       ...(body?{'Content-Type':'application/json'}:{})},
     ...(body?{body:JSON.stringify(body)}:{}),
     signal:AbortSignal.timeout(20000)
   });
   if(method==='GET')reads++;else writes++;
   if(!r?.ok)stop('GOOGLE_TEST_HTTP_'+String(r?.status||'ERROR'),502);
   return r.json();
 }
 const range=(name,cells)=>'/values/'+encodeURIComponent(
   "'"+name.replace(/'/g,"''")+"'!"+cells)+
   '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
 const metadata=await google('?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,hidden,gridProperties(rowCount)))');
 if(metadata?.spreadsheetId!==target.spreadsheetId||
    metadata?.properties?.title!==target.title||
    !Array.isArray(metadata.sheets))stop('FOXCONN_TEST_FILE_MISMATCH');
 const tabs=metadata.sheets.map(x=>x?.properties).filter(Boolean);
 const machine=tabs.find(x=>x.title===target.tab);
 if(!machine||machine.hidden===true||!Number.isInteger(machine.sheetId)||
   machine.gridProperties?.rowCount<(real?3:2))
   stop('FOXCONN_TEST_MACHINE_TAB_INVALID');
 const candidates=tabs.filter(x=>x.hidden!==true&&x.title!==target.tab&&
   !['DATA_CASHCONTROL','CASHCONTROL_VIEW','DATA_CASHCONTROL_DEMO','PHU_HUNG_VIEW_TEST'].includes(x.title));
 const matched=candidates.filter(x=>String(x.title).trim().toUpperCase()==='FOXCONN');
 const original=matched.length===1?matched[0]:
   candidates.length===1?candidates[0]:null;
 if(!original||!Number.isInteger(original.sheetId)||
    original.sheetId===machine.sheetId)
   stop('FOXCONN_TEST_HISTORY_TAB_AMBIGUOUS');
 const oldHistory=await google(range(original.title,'A1:O20000'));
 const oldMirror=await google(range(target.tab,'A1:O20000'));
 if(!Array.isArray(oldHistory.values))stop('FOXCONN_TEST_HISTORY_MISSING');
 let baseline;
 try{baseline=auditHistory(oldHistory.values,{foxconn:true});}
 catch{stop('FOXCONN_TEST_HISTORY_REVIEW_REQUIRED')}
 if(baseline.entries.length!==BASELINE_COUNT||
    Math.abs(baseline.closingBalance-BASELINE_BALANCE)>0.000001)
   stop('FOXCONN_TEST_BASELINE_NOT_RECONCILED');
 const matrix=oldMirror.values;
 // The no-input button replays only the source ID from the independently
 // read-back pilot row. A blank/missing pilot never triggers a write.
 const record=real?repaymentRow(matrix?.[2]?.[0]):SAMPLE;
 if(real&&baseline.entries.some(({values:v})=>v[0]===record[2]&&
    (v[6]===record[7]||v.slice(7).includes(-record[7]))))
   stop('FOXCONN_TEST_TRANSFER_ALREADY_IN_HISTORY');
 const prefix=real?[HEADER,SAMPLE]:[HEADER];
 const expected=[...prefix,record];
 const stage=same(matrix,expected)?'EXISTS':same(matrix,prefix)?'EMPTY':
   real?stop('TEST_MACHINE_TAB_CONTAINS_OTHER_DATA'):readStage(matrix);
 const result={project:'FOXCONN',kind:real?'VERIFIED_FOXCONN_REPAYMENT_TEST':'SIMULATED_TEST_ONLY',
   historyTransactions:BASELINE_COUNT,historyBalance:BASELINE_BALANCE,
   historyUntouched:true,sourceIsCashControl:real,canWriteProduction:false,
   sampleId:record[0],
   ...(real?{projectedBalance:baseline.closingBalance+record[7]}:{}),sampleRows:stage==='EXISTS'?1:0};
 if(action==='preview')
   return {...result,mode:'preview',needsTestWrite:stage==='EMPTY',
     googleReads:reads,googleWrites:0,firestoreReads:0};
 if(stage==='EXISTS'){
   // Even an unchanged TEST sample requires a fresh historical check.
   return {...result,mode:'unchanged',sampleRows:1,
     googleReads:reads,googleWrites:0,firestoreReads:0};
 }
 // Refuse to overwrite or append other TEST data: write ONLY fixed A2:O2,
 // so even concurrent identical attempts cannot create multiple rows.
 // The machine tab must be empty apart from the canonical TEST header.
 await google(':batchUpdate','POST',{requests:[{updateCells:{
   range:{sheetId:machine.sheetId,startRowIndex:prefix.length,endRowIndex:prefix.length+1,
     startColumnIndex:0,endColumnIndex:15},
   rows:[{values:record.map(value=>({
     userEnteredValue:typeof value==='number'?
       {numberValue:value}:{stringValue:value}
   }))}],fields:'userEnteredValue'
 }}],includeSpreadsheetInResponse:false});
 const [newMirror,newHistory]=await Promise.all([
   google(range(target.tab,'A1:O20000')),
   google(range(original.title,'A1:O20000'))
 ]);
 if(!same(newHistory.values,oldHistory.values)||
    !same(newMirror.values,expected)){
   stop('TEST_WRITE_UNCERTAIN_DO_NOT_RETRY',409);
 }
 return {...result,mode:'verified',sampleRows:1,historyUntouched:true,
   googleReads:reads,googleWrites:writes,firestoreReads:0};
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers?.host||req.headers?.origin!=='https://'+req.headers.host)
   return res.status(403).json({error:'CROSS_ORIGIN'});
 try{
   const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!data||typeof data!=='object'||Array.isArray(data)||
      Object.keys(data).some(key=>!['action','confirm','project','sourceId'].includes(key))||
      data.project!=='FOXCONN'||!['preview','commit'].includes(data.action))
      stop('INVALID_TEST_REQUEST',400);
   const token=String(req.headers?.authorization||'');
   if(!token.startsWith('Bearer '))stop('GOOGLE_OAUTH_REQUIRED',401);
   const response=await run({env:process.env,project:data.project,
     action:data.action,confirm:data.confirm,sourceId:data.sourceId,
     firebaseJwt:String(req.headers['x-firebase-id-token']||''),
     googleToken:token.slice(7)});
   return res.status(200).json(response);
 }catch(error){
   const status=[400,401,403,409,502].includes(error.statusCode)?
     error.statusCode:500;
   return res.status(status).json({error:
     /^[A-Z0-9_]+$/.test(String(error.message||''))?
       error.message:'FOXCONN_TEST_SMOKE_FAILED',writesUnknown:
       error.message==='TEST_WRITE_UNCERTAIN_DO_NOT_RETRY'});
 }
}
module.exports=handler;
module.exports._internals={run,SAMPLE,readStage};
