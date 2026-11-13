'use strict';
// TEST-only write coordinator. Caller supplies isolated Google TEST transport;
// no OAuth/network here, and no way to authorize a production spreadsheet.
// A separate server-side lock is still required before real concurrent writes.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSharedTestWriteCoordinator=api;
})(typeof window!=='undefined'?window:null,function(){
  const normalize=v=>String(v??'').normalize('NFKC').trim().toUpperCase();
  const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const validateTarget=target=>{
    if(!target||target.isTestCopy!==true||
      typeof target.spreadsheetId!=='string'||
      !/^[A-Za-z0-9_-]{20,}$/.test(target.spreadsheetId)||
      typeof target.title!=='string'||!/TEST/i.test(target.title)||
      typeof target.tab!=='string'||!/^DATA_CASHCONTROL_TEST_[A-Z0-9_]{1,80}$/.test(target.tab)||
      typeof target.project!=='string'||!target.project.trim()||
      normalize(target.project)==='PHU HUNG')
      throw Error('TEST_TARGET_ONLY: isolate each non-PHU-HUNG project TEST copy');
    return target;
  };
  const rowSignature=row=>JSON.stringify([row.sourceId,row.project,row.date,
    row.company,row.contractNo,row.ipc,row.sourceType,row.amounts]);
  const delta=rows=>rows.reduce((sum,r)=>{
    if(!r||!Array.isArray(r.amounts)||r.amounts.length<7||
       r.amounts.some(n=>typeof n!=='number'||!Number.isFinite(n)))
      throw Error('INVALID_BALANCE_AMOUNT');
    // Income can be negative for an outgoing internal transfer.
    return sum+r.amounts[0]-r.amounts.slice(1).reduce((n,v)=>n+v,0);
  },0);
  function validateSnapshot(snapshot,target){
    if(!snapshot||typeof snapshot!=='object'||!Array.isArray(snapshot.history)||
      !Array.isArray(snapshot.mirror)||!Number.isFinite(snapshot.openingBalance)||
      !Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||
      snapshot.spreadsheetId!==target.spreadsheetId||
      snapshot.tab!==target.tab||normalize(snapshot.project)!==normalize(target.project))
      throw Error('INVALID_GOOGLE_TEST_SNAPSHOT');
  }
  async function syncTest({target,month,source,evidence,transport,planner,
    confirmed=false,exclusiveTestLock=false}={}){
    validateTarget(target);
    if(!confirmed||!exclusiveTestLock||!planner?.prepare||
       !transport||typeof transport.readSnapshot!=='function'||
       typeof transport.appendRows!=='function')
      throw Error('TEST_WRITE_NOT_AUTHORIZED');
    if(!Array.isArray(source)||!source.length||source.length>20000)
      throw Error('INVALID_TEST_SOURCE');
    const first=await transport.readSnapshot(target);
    validateSnapshot(first,target);
    const planInputs={project:target.project,month,source,
      history:first.history,mirror:first.mirror,evidence};
    const plan=planner.prepare(planInputs);
    if(plan.blockers.length)throw Error('TEST_PLAN_BLOCKED: '+plan.blockers.map(x=>x.reason).join(','));
    if(plan.testAdds.length===0)
      return {status:'UNCHANGED',added:0,writes:0,
        balance:first.openingBalance+delta(first.history)+delta(first.mirror)};
    if(!plan.testEligible||plan.testAdds.length!==source.length-plan.unchanged.length)
      throw Error('TEST_PLAN_NOT_ELIGIBLE');
    // Re-check both ledger and its explicit revision immediately before append.
    const latest=await transport.readSnapshot(target);
    validateSnapshot(latest,target);
    if(latest.revision!==first.revision||!equals(latest.history,first.history)||
       !equals(latest.mirror,first.mirror)||latest.openingBalance!==first.openingBalance)
      throw Error('TEST_SNAPSHOT_CHANGED');
    const check=planner.prepare({...planInputs,history:latest.history,mirror:latest.mirror});
    if(!equals(check.testAdds,plan.testAdds)||check.blockers.length)
      throw Error('TEST_RECHECK_CHANGED');
    const ids=new Set(plan.testAdds.map(x=>x.sourceId));
    const additions=source.filter(x=>ids.has(x.sourceId));
    if(additions.length!==plan.testAdds.length)throw Error('TEST_SOURCE_CHANGED');
    const before=latest.openingBalance+delta(latest.history)+delta(latest.mirror);
    // An error here may mean Google accepted the batch. NEVER blindly retry.
    try{
      await transport.appendRows(target,additions,latest.revision);
    }catch(error){
      throw Error('TEST_WRITE_UNCERTAIN_RECHECK_BEFORE_RETRY: '+String(error?.message||error));
    }
    const after=await transport.readSnapshot(target);
    validateSnapshot(after,target);
    if(!equals(after.history,latest.history)||
       after.openingBalance!==latest.openingBalance)
      throw Error('TEST_HISTORY_OR_OPENING_CHANGED_AFTER_WRITE');
    const beforeMap=new Map(latest.mirror.map(x=>[x.sourceId,rowSignature(x)]));
    const afterMap=new Map();
    for(const row of after.mirror){
      if(afterMap.has(row.sourceId))throw Error('TEST_MIRROR_DUPLICATE_ID');
      afterMap.set(row.sourceId,rowSignature(row));
    }
    for(const [id,sig] of beforeMap)
      if(afterMap.get(id)!==sig)throw Error('TEST_EXISTING_ROW_MODIFIED');
    for(const row of additions)
      if(afterMap.get(row.sourceId)!==rowSignature(row))
        throw Error('TEST_WRITE_READBACK_MISMATCH');
    if(after.mirror.length!==latest.mirror.length+additions.length)
      throw Error('TEST_EXTRA_ROWS_AFTER_WRITE');
    const expected=before+delta(additions);
    const actual=after.openingBalance+delta(after.history)+delta(after.mirror);
    if(Math.abs(expected-actual)>0.000001)
      throw Error('TEST_BALANCE_MISMATCH');
    return {status:'TEST_VERIFIED',added:additions.length,writes:1,
      balance:actual,productionApproved:false};
  }
  return Object.freeze({syncTest});
});
