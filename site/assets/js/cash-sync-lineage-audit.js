'use strict';
// Pure verifier: every eligible in-memory Cash Control expense/transfer must
// appear exactly once in the generated per-project ledger. Tax grouping may
// collapse several source IDs into one output row but may never lose an ID.
// Never reads Firestore/Google, writes data, or authorizes a sync.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSyncLineageAudit=api;
})(typeof window!=='undefined'?window:null,function(){
  const monthRE=/^20\d\d-(0[1-9]|1[0-2])$/;
  const dateRE=/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const projectKey=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
  const dateOf=x=>String(x??'').slice(0,10);
  function inspect(project,months,expenses,transfers,rowsByMonth){
    if(typeof project!=='string'||!projectKey(project)||
      !Array.isArray(months)||!months.length||months.length>120||
      !Array.isArray(expenses)||!Array.isArray(transfers)||
      !Array.isArray(rowsByMonth)||months.length!==rowsByMonth.length)
      throw Error('Invalid Cash Control lineage source');
    const p=projectKey(project), expected=new Map(), actual=new Map();
    const monthSet=new Set();
    for(const month of months){
      if(!monthRE.test(month)||monthSet.has(month))
        throw Error('Invalid or repeated lineage month');
      monthSet.add(month);
    }
    let missingSourceId=0,duplicateSourceId=0,invalidSourceDate=0,invalidOutputId=0;
    function addExpected(id,date){
      if(!id){missingSourceId++;return}
      if(expected.has(id))duplicateSourceId++;
      expected.set(id,date);
    }
    const validDate=d=>dateRE.test(d)&&
      !Number.isNaN(Date.parse(d+'T00:00:00Z'))&&
      new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
    const eligible=(x,date)=>{
      if(!x||x.status!=='paid'||!x.actualDate)return false;
      if(!validDate(date)){invalidSourceDate++;return false}
      return monthSet.has(date.slice(0,7));
    };
    let expenseSources=0,transferSources=0;
    for(const x of expenses){
      if(!x||x.isAllocation||x.direction==='adjustment'||projectKey(x.project)!==p)
        continue;
      const date=dateOf(x.actualDate);
      if(!eligible(x,date))continue;
      expenseSources++;
      addExpected(x.id?'expense:'+String(x.id):'',date);
    }
    for(const x of transfers){
      if(!x)continue;
      const from=projectKey(x.fromProject)===p,to=projectKey(x.toProject)===p;
      if(!from&&!to)continue;
      const date=dateOf(x.actualDate);
      if(!eligible(x,date))continue;
      if(from){transferSources++;addExpected(x.id?'transfer:'+String(x.id)+':out':'',date)}
      if(to){transferSources++;addExpected(x.id?'transfer:'+String(x.id)+':in':'',date)}
    }
    let outputRows=0,duplicateOutputIds=0,unrecognizedOutputIds=0,
      dateMismatch=0,invalidOutputDate=0;
    for(let i=0;i<months.length;i++){
      if(!Array.isArray(rowsByMonth[i]))throw Error('Invalid ledger month');
      for(const row of rowsByMonth[i]){
        outputRows++;
        if(!row||!Array.isArray(row._syncIds)||!row._syncIds.length){
          invalidOutputId++;continue;
        }
        const date=dateOf(row.date);
        if(!validDate(date)||date.slice(0,7)!==months[i])invalidOutputDate++;
        // A tax quarter may combine multiple original paid expenses. Every
        // constituent ID must be checked, never just the merged tax row ID.
        for(const id of row._syncIds){
          if(typeof id!=='string'||!id){invalidOutputId++;continue}
          if(!/^expense:.+|transfer:.+:(?:in|out)$/.test(id)){
            unrecognizedOutputIds++;continue;
          }
          if(actual.has(id))duplicateOutputIds++;
          actual.set(id,date);
          if(expected.has(id)&&expected.get(id)!==date)dateMismatch++;
        }
      }
    }
    let missingOutputIds=0,orphanOutputIds=0;
    for(const id of expected.keys())if(!actual.has(id))missingOutputIds++;
    for(const id of actual.keys())if(!expected.has(id))orphanOutputIds++;
    const blockers={missingSourceId,duplicateSourceId,invalidSourceDate,
      invalidOutputId,duplicateOutputIds,unrecognizedOutputIds,
      invalidOutputDate,dateMismatch,missingOutputIds,orphanOutputIds};
    return Object.freeze({project:p,months:months.length,
      expenseSources,transferSources,outputRows,sourceIds:expected.size,
      outputIds:actual.size,blockers,
      inMemoryLineageVerified:Object.values(blockers).every(n=>n===0),
      // Verified lineage covers ONLY the sources that were loaded in memory.
      // It cannot prove that all Firebase and Google records were loaded.
      fullSourceCompletenessVerified:false,canWrite:false});
  }
  return Object.freeze({inspect});
});
