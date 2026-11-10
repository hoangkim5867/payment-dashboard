'use strict';
// Standalone, pure read-only proof of whether paid Payment documents are present
// in the rendered Cash Control export for a given project and period.
// It does NOT establish coverage of manual records or authorize sync.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSyncPaymentCoverage=api;
})(typeof window!=='undefined'?window:null,function(){
  const iso=/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  function check(project,payments,ledger,{from='2026-10-01',to='9999-12-31'}={}){
    if(typeof project!=='string'||!project.trim()||
       !Array.isArray(payments)||!Array.isArray(ledger)||!iso.test(from)||
       !/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)
      throw Error('Invalid Payment coverage request');
    const norm=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
    const key=norm(project);
    const expected=new Map(),actual=new Map(),duplicateDocuments= new Set();
    let invalidDates=0,excludedOutside=0,deleted=0,unpaid=0;
    for(const p of payments){
      if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id)
        throw Error('Payment row lacks a stable ID');
      if(p.deleted===true){deleted++;continue}
      const date=String(p.processPaymentDate||'').slice(0,10);
      if(!date){unpaid++;continue}
      if(!iso.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date){
        invalidDates++;continue;
      }
      if(date<from||date>to){excludedOutside++;continue;}
      // Raw documents must belong to the project being audited. Do not
      // silently count rows from other projects or infer alias repairs.
      if(norm(p.project)!==key)throw Error('Payment project mismatch');
      const id='expense:pay_'+p.id;
      if(expected.has(id))duplicateDocuments.add(id);
      expected.set(id,{date});
    }
    let missingSourceIds=0,duplicateLedgerIds=0,unknownPaymentIds=0;
    for(const row of ledger){
      if(!row||typeof row!=='object'||!Array.isArray(row._syncIds)){
        missingSourceIds++;continue;
      }
      for(const id of row._syncIds){
        if(typeof id!=='string'||!id){missingSourceIds++;continue;}
        if(!id.startsWith('expense:pay_'))continue;
        if(actual.has(id))duplicateLedgerIds++;
        actual.set(id,(actual.get(id)||0)+1);
        if(!expected.has(id))unknownPaymentIds++;
      }
    }
    let matched=0,missingPayments=0,dateMismatch=0;
    for(const [id,v] of expected){
      if(!actual.has(id)){missingPayments++;continue}
      matched++;
      // Source ID alone is not sufficient to attest the monetary value;
      // date/amount/bucket still need independent reconciliation.
      if(!ledger.some(row=>Array.isArray(row?._syncIds)&&row._syncIds.includes(id)&&
          String(row.date||'')===v.date))dateMismatch++;
    }
    const blockers={invalidDates,duplicateDocuments:duplicateDocuments.size,
      missingPayments,duplicateLedgerIds,unknownPaymentIds,missingSourceIds,dateMismatch};
    const consistent=Object.values(blockers).every(v=>v===0);
    return Object.freeze({project:key,paidDocuments:expected.size,matched,unpaid,deleted,
      excludedOutside,blockers,paidPaymentIdsCovered:consistent,
      allCashControlSourcesCovered:false,sourceCompletenessVerified:false,canWrite:false});
  }
  return Object.freeze({check});
});
