'use strict';
// Convert the existing Cash Control export and a downloaded Google historical
// worksheet to the shared offline TEST planner. No network or write functions.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSharedSourceAdapter=api;
})(typeof window!=='undefined'?window:null,function(){
  const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
  const norm=v=>String(v??'').normalize('NFKC').trim();
  const safeNumber=v=>{
    if(typeof v==='number')return Number.isFinite(v)?v:NaN;
    if(v===null||v===undefined||v==='')return 0;
    if(typeof v!=='string')return NaN;
    const t=v.trim();
    if(!t)return 0;
    // Unformatted Google Sheets numeric cells should be numbers; reject
    // thousands separators and locale-ambiguous text instead of guessing.
    if(!/^-?\d+(?:\.\d+)?$/.test(t))return NaN;
    return Number(t);
  };
  function projectSource({project,rows,expensesById,foxconn=false}={}){
    if(!norm(project)||!Array.isArray(rows)||rows.length>20000)
      throw Error('Invalid Cash Control projection');
    const records=expensesById instanceof Map?expensesById:new Map();
    const converted=[],blocked=[];
    for(const [i,r] of rows.entries()){
      const position=i+1,ids=Array.isArray(r?._syncIds)?r._syncIds.map(String):[];
      const validIds=ids.length===1&&ids[0]&&!ids[0].includes('+');
      const sourceId=validIds?project+':'+ids[0]:'';
      let sourceType='unknown',identityVerified=false;
      if(validIds&&ids[0].startsWith('expense:')){
        const expense=records.get(ids[0].slice(8));
        if(expense?.source==='payment')sourceType='payment';
        else if(expense)sourceType='nonpayment';
      }else if(validIds&&/^transfer:.+:(?:in|out)$/.test(ids[0]))
        sourceType='transfer';
      const amounts=fields.map(x=>safeNumber(r?.[x]));
      if(foxconn)amounts.push(Object.hasOwn(r||{},'importTaxVat')?
        safeNumber(r.importTaxVat):NaN);
      const model={sourceId,project,date:norm(r?.date),company:norm(r?.company),
        contractNo:norm(r?.contractNo),ipc:norm(r?.ipc),
        amounts,sourceType,identityVerified,counterpartVerified:false};
      if(!validIds)blocked.push({position,reason:'NO_SINGLE_STABLE_SOURCE_ID'});
      if(sourceType==='unknown')blocked.push({position,reason:'UNKNOWN_SOURCE_MODULE'});
      if(!amounts.every(Number.isFinite))
        blocked.push({position,reason:'INVALID_AMOUNT_OR_TAX_MAPPING'});
      converted.push(model);
    }
    return {rows:converted,blocked};
  }
  function projectHistory({project,values,foxconn=false}={}){
    if(!norm(project)||!Array.isArray(values)||values.length>20000)
      throw Error('Invalid Google history');
    const rows=[],blocked=[];
    for(const [i,r] of values.entries()){
      if(!Array.isArray(r))continue;
      // Google date serials and ambiguous date formats require the historical
      // auditor; this adapter never guesses their interpretation.
      const date=norm(r[0]);
      if(!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)){
        continue;
      }
      if(date<'2026-10-01')continue;
      const valuesArray=r.slice(6,foxconn?14:13);
      const required=foxconn?8:7;
      const amounts=Array.from({length:required},(_,j)=>safeNumber(valuesArray[j]));
      if(amounts.some(x=>!Number.isFinite(x)))
        blocked.push({position:i+1,reason:'INVALID_GOOGLE_MONEY'});
      rows.push({sourceId:'',project,date,company:norm(r[1]),
        contractNo:norm(r[2]),ipc:norm(r[4]),amounts});
    }
    return {rows,blocked,historyComplete:false};
  }
  function preview({project,cashRows,googleValues,expensesById,foxconn,month,planner}={}){
    if(!planner?.prepare)throw Error('Shared TEST planner unavailable');
    const cash=projectSource({project,rows:cashRows,expensesById,foxconn});
    const google=projectHistory({project,values:googleValues,foxconn});
    // Critical: a read-only inspection does NOT prove complete Payment aliases,
    // transfer counterpart Google entries, or ledger date/header layout.
    const outcome=planner.prepare({project,month,
      source:cash.rows.filter(row=>row.date.slice(0,7)===month),
      history:google.rows,mirror:[],
      evidence:{sourceComplete:false,historyComplete:false,baselineRevalidated:false}});
    return {project,month,sourceCount:cash.rows.length,historyCount:google.rows.length,
      sourceBlockers:cash.blocked,historyBlockers:google.blocked,
      plan:outcome,canWrite:false,writesPerformed:0};
  }
  return Object.freeze({projectSource,projectHistory,preview});
});
