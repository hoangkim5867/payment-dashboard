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
      if(norm(p.project)!==key)throw Error('Payment project mismatch');
      if(p.deleted===true){deleted++;continue}
      const date=String(p.processPaymentDate||'').slice(0,10);
      if(!date){unpaid++;continue}
      if(!iso.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date){
        invalidDates++;continue;
      }
      if(date<from||date>to){excludedOutside++;continue;}
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
  // Explicit Admin-triggered Payment batches may be checked in memory only.
  // loaded=true is evidence supplied by the caller, never inferred from an
  // empty result, cached project name, or a successful Google history check.
  // This function does NOT fetch Payment and cannot approve Google writes.
  function checkBoundedBatch(requests,{maxProjects=3}={}){
    if(!Array.isArray(requests)||requests.length<1||requests.length>3||
       !Number.isSafeInteger(maxProjects)||maxProjects<1||maxProjects>3||
       requests.length>maxProjects)
      throw Error('Invalid or unbounded Payment audit batch');
    const seen=new Set(),results=[];
    for(const request of requests){
      if(!request||typeof request.project!=='string'||!request.project.trim())
        throw Error('Invalid Payment project');
      const project=request.project.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
      if(seen.has(project))throw Error('Repeated project in Payment batch');
      seen.add(project);
      if(request.loaded!==true||request.complete!==true){
        results.push(Object.freeze({project,status:'incomplete-payment-snapshot',
          paymentSnapshotVerified:false,canWrite:false}));
        continue;
      }
      if(!Array.isArray(request.payments)||!Array.isArray(request.ledger))
        throw Error('Loaded Payment snapshot requires explicit source arrays');
      const report=check(project,request.payments,request.ledger,{
        from:request.from||'2026-10-01',to:request.to||'9999-12-31'
      });
      // An empty Payment array may mean a legitimate zero-payment period, or
      // a failed/partial load. No upstream claim can distinguish the two here.
      // Even a perfect ID match is only a partial consistency check.
      const emptyUnproven=request.payments.length===0;
      const valid=!emptyUnproven&&report.paidPaymentIdsCovered&&
        report.blockers.invalidDates===0&&
        report.blockers.missingSourceIds===0;
      results.push(Object.freeze({project,
        status:emptyUnproven?'empty-payment-snapshot-unverified':
          valid?'payment-ids-covered-needs-full-source-review':'payment-coverage-blocked',
        paidDocuments:report.paidDocuments,matched:report.matched,
        blockers:report.blockers,paymentSnapshotVerified:valid,
        sourceCompletenessVerified:false,canWrite:false}));
    }
    return Object.freeze({results:Object.freeze(results),
      reviewedProjects:results.length,allPaymentSnapshotsVerified:
        results.every(x=>x.paymentSnapshotVerified===true),
      sourceCompletenessVerified:false,canWrite:false});
  }
  return Object.freeze({check,checkBoundedBatch});
});
