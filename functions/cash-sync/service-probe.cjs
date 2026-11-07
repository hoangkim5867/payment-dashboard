'use strict';
/*
 * Minimal server-identity TEST-only read probe.
 *
 * This is NOT a Sheets sync worker. It confirms that a Cloud Function's
 * workload identity can READ the allowlisted TEST copy, and checks the
 * historical balances / mirror hashes without exposing financial rows.
 * No Firestore query, sheet write, user OAuth token, or private key needed.
 */
const {verifyHistory}=require('./history-audit.cjs');
const {indexMirror}=require('./verified-mirror.cjs');
function validateCaller({env,auth}){
  if((env?.GCLOUD_PROJECT||env?.GCP_PROJECT)!=='cash-control-staging'||
     env?.CASH_SHEETS_TEST_READ_PROBE_ENABLED!=='YES')
    throw Object.assign(Error('TEST read probe disabled.'),{code:'disabled'});
  const uid=String(env?.CASH_SHEETS_ADMIN_UID||'');
  if(!/^[A-Za-z0-9_-]{4,128}$/.test(uid)||auth?.uid!==uid)
    throw Object.assign(Error('Not authorized for TEST read probe.'),{code:'permission-denied'});
}
function classifyAccessFailure(err){
  const status=Number(err?.response?.status||err?.status||0);
  if(status===401||status===403)return 'GOOGLE_IDENTITY_PERMISSION';
  if(status===404)return 'TEST_SPREADSHEET_NOT_ACCESSIBLE';
  if(status===429||status>=500)return 'GOOGLE_TEMPORARY_FAILURE';
  return 'GOOGLE_ACCESS_OR_LEDGER_REVIEW';
}
async function runReadProbe({env,auth,inspectorFactory}){
  validateCaller({env,auth});
  if(typeof inspectorFactory!=='function')
    throw Error('Server Google identity provider is required.');
  let inspector;
  try{
    inspector=await inspectorFactory();
    if(!inspector||typeof inspector.metadata!=='function'||
       typeof inspector.read!=='function'||typeof inspector.readFormulas!=='function')
      throw Error('Incomplete read-only Sheets adapter.');
    await inspector.metadata();
    const history=await inspector.read('PHU HUNG','A1:N10001');
    const formulas=await inspector.readFormulas('PHU HUNG','N1:N10001');
    const verified=verifyHistory(history,formulas);
    let mirrorCount=0;
    try{
      const mirrored=await inspector.read('DATA_CASHCONTROL','A1:S10001');
      mirrorCount=indexMirror(mirrored).count;
    }catch(err){
      const status=Number(err?.response?.status||err?.status||0);
      // An absent mirror is never evidence that all Cash Control rows synced.
      if(status===404)throw Object.assign(Error('DATA_CASHCONTROL missing.'),{code:'mirror-missing'});
      throw err;
    }
    return {status:'read-only-verified',historicalCount:verified.count,
      mirrorCount,historicalBalanceVerified:true,
      sourceAuthoritative:false,autoWriteEnabled:false,
      additionalFirestoreQueries:0};
  }catch(error){
    if(error?.code==='mirror-missing')
      return {status:'blocked',reason:'MIRROR_TAB_MISSING',autoWriteEnabled:false};
    // Do not echo Google response bodies or financial values to callers/logs.
    return {status:'blocked',reason:classifyAccessFailure(error),
      autoWriteEnabled:false};
  }
}
module.exports={validateCaller,classifyAccessFailure,runReadProbe};
