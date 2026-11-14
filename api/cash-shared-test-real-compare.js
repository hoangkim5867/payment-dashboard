'use strict';
/*
 * Admin-only, Preview-only read-only matching of imported REAL-shaped
 * Cash Control records with the original FOXCONN Google TEST history.
 * This is NOT source authentication and NEVER grants Google writes.
 * All source content is transient: do not log, store, or echo cell values.
 */
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {readTargets}=require('../server/cash-shared-test-targets.cjs');
const core=require('../server/cash-sync-multi-project-core.cjs');
const {auditHistory,parseValues,idSignature,planMonth,sha}=core;
const HISTORY_COUNT=271,HISTORY_BALANCE=35246364496;
const stop=(reason,statusCode=409)=>{throw Object.assign(Error(reason),{statusCode});};
function validateSource({project,month,source}={}){
 if(project!=='FOXCONN'||!/^2026-(10|11|12)$/.test(month)||
    !Array.isArray(source)||source.length<1||source.length>3000)
   stop('FOXCONN_TEST_SOURCE_NOT_READY',400);
 if(JSON.stringify(source).length>600000)
   stop('FOXCONN_TEST_SOURCE_TOO_LARGE',413);
 const unique=new Set(),normalized=[];
 for(let i=0;i<source.length;i++){
   const r=source[i],id=String(r?.id||'');
   if(!/^[^\x00-\x1f]{3,300}$/.test(id)||unique.has(id)||
      r?.project!=='FOXCONN'||r?.month!==month||
      !Array.isArray(r.values)||r.values.length!==14)
     stop('FOXCONN_TEST_SOURCE_ID_OR_MONTH_INVALID',409);
   unique.add(id);
   const values=parseValues(r.values,{foxconn:true});
   if(!values[0].startsWith(month+'-')||sha(values)!==r.hash)
     stop('FOXCONN_TEST_SOURCE_HASH_OR_DATE_INVALID',409);
   const sourceClass=String(r.sourceClass||'UNKNOWN');
   if(!['PAYMENT','CASH','PAYROLL','TRANSFER','MIXED','UNKNOWN'].includes(sourceClass))
     stop('FOXCONN_TEST_SOURCE_KIND_INVALID',409);
   normalized.push({id,project:'FOXCONN',month,values,hash:r.hash,sourceClass});
 }
 return normalized;
}
const normalizedText=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const payrollCostLabel=value=>/^(?:职工薪酬|職工薪酬|CHI PHÍ NHÂN SỰ|PERSONNEL COSTS?)$/.test(normalizedText(value));
function paymentKey(v){
 const contract=normalizedText(v[2]),ipc=normalizedText(v[4]).replace(/^IPC\s+(?=IPC)/,'');
 return contract&&ipc?JSON.stringify([v[0],contract,ipc,...v.slice(6)]):null;
}
function personnelKey(v){
 return payrollCostLabel(v[5])&&!v[2].trim()&&!v[4].trim()&&
   v[10]>0&&v.slice(6).every((amount,i)=>i===4||amount===0)
   ?JSON.stringify([v[0],v[10]]):null;
}
function compareSourceToHistory(source,raw,month){
 const history=auditHistory(raw,{foxconn:true});
 if(history.entries.length!==HISTORY_COUNT||
    Math.abs(history.closingBalance-HISTORY_BALANCE)>0.000001)
   stop('FOXCONN_TEST_HISTORY_BASELINE_CHANGED');
 const exact=new Map(),payments=new Map(),personnel=new Map();
 const add=(index,key,row)=>{
   if(key!==null)index.set(key,[...(index.get(key)||[]),row]);
 };
 for(const row of history.entries){
   add(exact,idSignature(row.values),row.sheetRow);
   add(payments,paymentKey(row.values),row.sheetRow);
   add(personnel,personnelKey(row.values),row.sheetRow);
 }
 const candidates=source.map(r=>{
   if(r.sourceClass==='PAYMENT')return payments.get(paymentKey(r.values))||[];
   const strict=exact.get(idSignature(r.values))||[];
   if(strict.length||!['CASH','PAYROLL'].includes(r.sourceClass))return strict;
   return personnel.get(personnelKey(r.values))||[];
 });
 const claims=new Map();
 for(const matches of candidates)
   for(const sheetRow of matches)claims.set(sheetRow,(claims.get(sheetRow)||0)+1);
 const issues=[],entries=[];
 let historic=0,newAfter=0,ambiguous=0,olderMissing=0,
   identityMissing=0,counterpartReview=0,sourceKindReview=0;
 for(let i=0;i<source.length;i++){
   const r=source[i],matching=candidates[i];
   // Classify source semantics BEFORE counting eligible historical matches
   // or newer candidates. A transfer, unclear kind or Payment lacking HĐ/IPC
   // must never inflate "new" or "matched" figures just because date/amount fits.
   let status;
   if(r.sourceClass==='PAYMENT'&&
      (!String(r.values[2]).trim()||!String(r.values[4]).trim())){
     status='PAYMENT_CONTRACT_IPC_MISSING';identityMissing++;
   }else if(r.sourceClass==='TRANSFER'){
     // Both sides of an inter-project transfer need independent verification.
     status='TRANSFER_COUNTERPART_UNVERIFIED';counterpartReview++;
   }else if(r.sourceClass==='MIXED'||r.sourceClass==='UNKNOWN'){
     status='SOURCE_KIND_UNVERIFIED';sourceKindReview++;
   }else if(matching.length>1||(matching.length===1&&claims.get(matching[0])>1)){status='AMBIGUOUS_HISTORY';ambiguous++;}
   else if(matching.length===1){status='EXACT_HISTORY_MATCH';historic++;}
   else if(r.values[0]<=history.maxDate){
     status='UNMATCHED_BEFORE_LAST_HISTORY_DATE';olderMissing++;
   }else{status='NEWER_THAN_HISTORY_CANDIDATE';newAfter++;}
   if(status!=='EXACT_HISTORY_MATCH')issues.push({
      sourcePosition:i+1,reason:status,
      googleRow:matching.length===1?matching[0]:null
   });
   entries.push({sourcePosition:i+1,status});
 }
 let coreStatus='BLOCKED',coreChanges=0;
 try{
   const plan=planMonth({project:'FOXCONN',month,source,
      history:raw,mirror:[],foxconn:true});
   coreStatus=plan.status;
   if(plan.status==='CANDIDATES_ONLY')coreChanges=plan.changes.length;
 }catch{coreStatus='REVIEW_REQUIRED';}
 // Offline planMonth has no source-kind information. Do not surface its
 // technical append count as an actionable candidate when kinds are unresolved.
 if(identityMissing+counterpartReview+sourceKindReview>0){
   coreStatus='REVIEW_REQUIRED';coreChanges=0;
 }
 return Object.freeze({
  project:'FOXCONN',month,sourceRows:source.length,
  historyTransactions:history.entries.length,
  closingBalance:history.closingBalance,
  currentHistoryFingerprint:history.fingerprint,
  historyBalanceConsistent:true,
  // Without an earlier trusted fingerprint, same count and closing balance
  // do NOT prove that original history cells are unchanged.
  historicalSnapshotUnchanged:null,
  exactHistoryMatched:historic,newAfterHistoryCandidates:newAfter,
  olderUnmatched:olderMissing,ambiguousMatches:ambiguous,
  missingPaymentIdentity:identityMissing,
  transferCounterpartsUnverified:counterpartReview,
  sourceKindUnverified:sourceKindReview,
  coreStatus,coreChanges,issues:issues.slice(0,100),
  sourceAuthenticated:false,sourceComplete:false,
  canSync:false,canWrite:false,googleWrites:0,firestoreReads:0,
  // Allow candidate display only; no source values or sensitive Payment data.
  resultType:'REAL_FORMAT_SOURCE_READ_ONLY_TEST'
 });
}
async function run({env,project,month,source,firebaseJwt,googleToken,
 fetcher=fetch,verifyAdmin=verifyFirebaseAdminToken}={}){
 if(env?.VERCEL_ENV!=='preview'||
    env?.CASH_SYNC_FIREBASE_PROJECT_ID!=='cash-control-staging')
   stop('ONLY_STAGING_TEST_PREVIEW',403);
 const normalized=validateSource({project,month,source});
 const target=readTargets(env).get('FOXCONN');
 if(!target||target.isTestCopy!==true||
    target.tab!=='DATA_CASHCONTROL_TEST_FOXCONN')
   stop('FOXCONN_TEST_TARGET_NOT_ALLOWED',403);
 const cfg=readConfig(env);
 if(cfg.project!=='cash-control-staging')
   stop('STAGING_ADMIN_CONFIG_MISMATCH',403);
 await verifyAdmin(firebaseJwt,cfg);
 if(typeof googleToken!=='string'||
    !/^[A-Za-z0-9._~-]{20,4096}$/.test(googleToken))
   stop('GOOGLE_AUTH_MISSING',401);
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+
   encodeURIComponent(target.spreadsheetId);
 const headers={Authorization:'Bearer '+googleToken};
 let googleReads=0;
 const get=async endpoint=>{
   const reply=await fetcher(base+endpoint,{
     method:'GET',headers,signal:AbortSignal.timeout(22000)
   });
   googleReads++;
   if(!reply?.ok)stop('GOOGLE_TEST_READ_'+String(reply?.status||'ERROR'),502);
   return reply.json();
 };
 const meta=await get('?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId,hidden))');
 if(meta?.spreadsheetId!==target.spreadsheetId||
    meta?.properties?.title!==target.title||!Array.isArray(meta.sheets))
    stop('TEST_GOOGLE_FILE_CHANGED');
 const tabs=meta.sheets.map(x=>x.properties).filter(x=>x&&x.hidden!==true);
 const technical=meta.sheets.find(x=>x.properties?.title===target.tab)?.properties;
 const candidateTabs=tabs.filter(t=>t.title!==target.tab&&
    !['DATA_CASHCONTROL','CASHCONTROL_VIEW','DATA_CASHCONTROL_DEMO','PHU_HUNG_VIEW_TEST'].includes(t.title));
 const exact=candidateTabs.filter(t=>String(t.title).trim().toUpperCase()==='FOXCONN');
 const old=exact.length===1?exact[0]:
   candidateTabs.length===1?candidateTabs[0]:null;
 if(!old||!technical||old.sheetId===technical.sheetId)
   stop('TEST_HISTORY_SHEET_NOT_UNIQUE');
 const range=encodeURIComponent("'"+old.title.replace(/'/g,"''")+"'!A1:O20000");
 const workbook=await get('/values/'+range+
   '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
 if(!Array.isArray(workbook.values))stop('TEST_HISTORY_EMPTY');
 return Object.freeze({...compareSourceToHistory(normalized,workbook.values,month),
   googleReads});
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
 if(!req.headers?.host||req.headers?.origin!=='https://'+req.headers.host)
   return res.status(403).json({error:'CROSS_ORIGIN'});
 try{
  const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer '))stop('GOOGLE_AUTH_MISSING',401);
  const result=await run({...data,env:process.env,
    firebaseJwt:String(req.headers['x-firebase-id-token']||''),
    googleToken:auth.slice(7)});
  return res.status(200).json(result);
 }catch(e){
  const code=[400,401,403,409,413,502].includes(e?.statusCode)?e.statusCode:500;
  return res.status(code).json({
    error:/^[A-Z0-9_]+$/.test(String(e.message||''))?e.message:
      'FOXCONN_TEST_REAL_SOURCE_COMPARE_FAILED',writes:0});
 }
}
module.exports=handler;
module.exports._internals={run,validateSource,compareSourceToHistory};
