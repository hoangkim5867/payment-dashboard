'use strict';
// Offline reconciliation of one historical Google tab and a normalized Cash Control
// snapshot. No network, writes, configuration changes, or activation decisions.
// Unmatched rows, unsupported layouts and ambiguous duplicates are never ignored.
const {scanRows,normDate}=require('./cash-sync-original-audit.cjs');
const {normalizeProject}=require('./cash-sync-project-registry.cjs');
const {auditSourceSnapshot}=require('./cash-sync-multiproject-preflight.cjs');
const EPSILON=0.000001;
const close=(a,b)=>Math.abs(a-b)<=EPSILON;
const sum=v=>v.reduce((a,b)=>a+b,0);
function fail(message){throw Object.assign(new Error(message),{code:'CASH_SYNC_RECONCILIATION_BLOCKED'})}
function flow(amounts){return amounts[0]-sum(amounts.slice(1))}
function round(v){return Math.round(v*1e6)/1e6}
function signature(date,amounts){
  return JSON.stringify([date,...amounts.map(n=>round(n))]);
}
function auditHistoricalLedger(project,rawGoogleRows,sourceRows,opts={}){
  const key=normalizeProject(project);
  if(!key||key==='PHU HUNG')fail('PHU HUNG has a separately approved migration');
  // This ensures the incoming source is internally consistent, but does NOT
  // infer that the source covers all previous months.
  const source=auditSourceSnapshot(key,sourceRows);
  if(!Array.isArray(rawGoogleRows)||rawGoogleRows.length>20000)
    fail('Invalid Google historical tab snapshot');
  const hasContent=rawGoogleRows.some(row=>
    Array.isArray(row)&&row.some(cell=>String(cell??'').trim()!==''));
  const hasDate=rawGoogleRows.some(row=>Array.isArray(row)&&!!normDate(row[0]));
  if(!hasDate){
    if(hasContent)fail('Google tab is nonempty but contains no recognizable transactions');
    if(!Number.isSafeInteger(opts.confirmedOpeningBalance))
      fail('Blank historical sheet needs an independently confirmed opening balance');
    // A genuinely blank tab has no historical transactions. This is NOT proof
    // that the Cash Control snapshot is complete or approved to sync.
    return Object.freeze({project:key,kind:'blank-tab',
      historicalCount:0,sourceCount:source.recordCount,
      openingBalance:opts.confirmedOpeningBalance,
      projectedClosingBalance:opts.confirmedOpeningBalance+source.netChange,
      rowsMatched:0,unmatchedHistorical:0,unmatchedSource:source.recordCount,
      historicalRowsVerified:true,closingBalanceVerified:false,
      sourceCompletenessVerified:false,canWrite:false});
  }
  let history;
  try{history=scanRows(rawGoogleRows)}
  catch(error){fail('Cannot parse Google historical tab: '+error.message)}
  // Protect against partial parsers silently ignoring malformed transaction rows.
  // Every valid historical row must have a safe recorded running balance.
  // A balanced ledger is not necessarily chronological. Never approve historical\n  // verification when source rows move backward in time; do not reorder them.\n  const dateOrderExamples=[];let dateOrderRegressions=0;\n  for(let i=1;i<history.length;i++){\n    if(history[i].values[0]<history[i-1].values[0]){\n      dateOrderRegressions++;\n      if(dateOrderExamples.length<30)dateOrderExamples.push({previousRow:history[i-1].sheetRow,\n        row:history[i].sheetRow,previousDate:history[i-1].values[0],date:history[i].values[0]});\n    }\n  }\n  const balances=history.map(x=>x.values[13]);
  const opening=round(balances[0]-flow(history[0].values.slice(6,13)));
  if(!Number.isSafeInteger(opening))fail('Unsupported opening balance or precision');
  let previous=opening;
  const continuityErrors=[];
  for(const item of history){
    const current=round(previous+flow(item.values.slice(6,13)));
    if(!close(item.values[13],current))
      continuityErrors.push({sheetRow:item.sheetRow,recorded:item.values[13],calculated:current});
    previous=current;
  }
  // Stable source signatures are deliberately conservative: this identifies
  // candidates, NOT proof of record identity when two rows have same values.
  const historicByKey=new Map(),sourceByKey=new Map();
  const add=(m,sig,id)=>m.set(sig,[...(m.get(sig)||[]),id]);
  for(const item of history)add(historicByKey,
    signature(item.values[0],item.values.slice(6,13)),item.sheetRow);
  for(const item of sourceRows)add(sourceByKey,
    signature(item.date,item.amounts),item.id);
  let matched=0,ambiguous=0,missing=0,extra=0;
  const examples=[];
  for(const sig of new Set([...historicByKey.keys(),...sourceByKey.keys()])){
    const h=historicByKey.get(sig)||[],s=sourceByKey.get(sig)||[];
    if(h.length>1||s.length>1)ambiguous+=Math.min(h.length,s.length);
    const common=Math.min(h.length,s.length);
    matched+=common;missing+=h.length-common;extra+=s.length-common;
    if(h.length!==s.length&&examples.length<8)
      examples.push({historicalRows:h.slice(0,4),sourceIds:s.slice(0,4),
        historicalCount:h.length,sourceCount:s.length});
  }
  const openingFromCash=opts.confirmedOpeningBalance;
  const openingConfirmed=Number.isSafeInteger(openingFromCash)&&close(opening,openingFromCash);
  const historyVerified=continuityErrors.length===0&&missing===0&&ambiguous===0&&\n    dateOrderRegressions===0;
  const closingVerified=historyVerified&&openingConfirmed&&extra===0&&
    close(balances.at(-1),round(openingFromCash+source.netChange));
  return Object.freeze({project:key,kind:'historical-tab',
    historicalCount:history.length,sourceCount:source.recordCount,
    openingBalance:opening,historicalClosingBalance:balances.at(-1),
    sourceNetChange:source.netChange,rowsMatched:matched,
    unmatchedHistorical:missing,unmatchedSource:extra,ambiguousMatches:ambiguous,
    dateOrderRegressions,dateOrderExamples,\n    continuityErrorCount:continuityErrors.length,
    continuityExamples:continuityErrors.slice(0,8),unmatchedExamples:examples,
    openingConfirmed,historicalRowsVerified:historyVerified,
    closingBalanceVerified:closingVerified,
    sourceCompletenessVerified:false,canWrite:false});
}
module.exports={auditHistoricalLedger};
