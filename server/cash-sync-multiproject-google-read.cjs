'use strict';
// Single-project Google Sheets reader for explicit Admin preflight ONLY.
// No scheduled work, no Firestore calls, no Google write methods.
const {verifyDestinationMetadata}=require('./cash-sync-multiproject-preflight.cjs');
const {auditHistoricalLedger}=require('./cash-sync-multiproject-reconcile.cjs');
function error(message,statusCode=409){throw Object.assign(new Error(message),{statusCode})}
async function googleGet(fetcher,authorization,id,path){
  const response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+
    encodeURIComponent(id)+path,{method:'GET',
    headers:{Authorization:authorization},signal:AbortSignal.timeout(20000)});
  if(!response.ok)error('Google read failed: '+response.status,502);
  const contentLength=Number(response.headers?.get?.('content-length')||0);
  if(contentLength>2500000)error('Google snapshot too large',413);
  const text=await response.text();
  if(text.length>2500000)error('Google snapshot too large',413);
  try{return JSON.parse(text)}catch{error('Invalid Google JSON response',502)}
}
async function readOnlyProjectAudit(entry,sourceRows,confirmedOpeningBalance,
  authorization,{fetcher=fetch}={}){
  if(!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(String(authorization||'')))
    error('Google OAuth token required',401);
  if(!entry||entry.status!=='pending-readonly-audit'||!entry.gid)
    error('Project not eligible for multi-project preflight',403);
  const id=entry.spreadsheetId;
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(id))error('Invalid spreadsheet ID',400);
  const meta=await googleGet(fetcher,authorization,id,
    '?fields=spreadsheetId,sheets(properties(sheetId,title,hidden))');
  const verified=verifyDestinationMetadata(entry,meta);
  const safeTab="'"+verified.selectedTabTitle.replace(/'/g,"''")+"'!A1:N20000";
  const path='/values/'+encodeURIComponent(safeTab)+
    '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
  const original=await googleGet(fetcher,authorization,id,path);
  if(!Array.isArray(original.values)&&original.values!==undefined)
    error('Invalid Google values data',502);
  const result=auditHistoricalLedger(entry.project,original.values||[],
    sourceRows,{confirmedOpeningBalance});
  return Object.freeze({project:entry.project,
    selectedTabTitle:verified.selectedTabTitle,
    historicalCount:result.historicalCount,
    sourceCount:result.sourceCount,
    kind:result.kind,
    rowsMatched:result.rowsMatched,
    unmatchedHistorical:result.unmatchedHistorical,
    unmatchedSource:result.unmatchedSource,
    historicalRowsVerified:result.historicalRowsVerified,
    closingBalanceVerified:result.closingBalanceVerified,
    continuityErrorCount:result.continuityErrorCount||0,
    ambiguousMatches:result.ambiguousMatches||0,
    status:result.historicalRowsVerified&&result.closingBalanceVerified?
      'offline-matched-needs-source-completeness':'requires-manual-reconciliation',
    sourceCompletenessVerified:false,canWrite:false});
}
module.exports={readOnlyProjectAudit};
