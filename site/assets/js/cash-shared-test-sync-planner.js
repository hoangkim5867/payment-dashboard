'use strict';
// Isolated, deterministic preparation of Google TEST mirror changes.
// NO network, NO writes, NO authorization for real Sheets.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSharedTestSyncPlanner=api;
})(typeof window!=='undefined'?window:null,function(){
  const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
  const validDate=v=>/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(v||'')) &&
    !Number.isNaN(Date.parse(v+'T00:00:00Z')) &&
    new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const amount=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1e6)/1e6:NaN;
  const identity=row=>[norm(row.company),norm(row.contractNo),norm(row.ipc)];
  const fingerprint=row=>JSON.stringify([row.date,...row.amounts.map(amount)]);
  function prepare({project,month,source,history,mirror,evidence}={}){
    if(!norm(project)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'')||
      !Array.isArray(source)||!Array.isArray(history)||!Array.isArray(mirror)||
      source.length>20000||history.length>20000||mirror.length>20000)
      throw Error('Invalid TEST preparation input');
    const blockers=[],unchanged=[],historicCandidates=[],testAdds=[];
    const block=(reason,id)=>blockers.push({reason,sourceId:String(id||'')});
    const get=(row,requiresId)=>{
      if(!row||typeof row!=='object'||!validDate(row.date)||
        !Array.isArray(row.amounts)||![7,8].includes(row.amounts.length)||
        row.amounts.some(v=>!Number.isFinite(amount(v)))||
        (requiresId&&!String(row.sourceId||'').trim()))return null;
      return {key:fingerprint(row),ident:identity(row)};
    };
    const srcSeen=new Set(),mirrorById=new Map(),historicByKey=new Map();
    for(const row of mirror){
      const id=String(row?.sourceId||'').trim();
      const sig=get(row,true);
      if(!sig||!id||mirrorById.has(id)||norm(row.project)!==norm(project)){
        block('INVALID_OR_DUPLICATE_MIRROR',id);continue;
      }
      mirrorById.set(id,{row,sig});
    }
    for(const row of history){
      const sig=get(row,false);
      if(!sig||norm(row.project)!==norm(project)){
        block('INVALID_HISTORY',row?.sourceId);continue;
      }
      if(!historicByKey.has(sig.key))historicByKey.set(sig.key,[]);
      historicByKey.get(sig.key).push({row,sig});
    }
    for(const row of source){
      const id=String(row?.sourceId||'').trim();
      const sig=get(row,true);
      if(!sig||srcSeen.has(id)||norm(row.project)!==norm(project)||
         row.date.slice(0,7)!==month){
        block('INVALID_OR_DUPLICATE_SOURCE',id);continue;
      }
      srcSeen.add(id);
      if(row.sourceType==='payment'&&(!sig.ident[1]||!sig.ident[2])){
        block('PAYMENT_IDENTITY_MISSING',id);continue;
      }
      if(row.sourceType==='transfer'&&row.counterpartVerified!==true){
        block('TRANSFER_COUNTERPART_UNVERIFIED',id);continue;
      }
      if(row.sourceType!=='payment'&&row.sourceType!=='transfer'&&
         row.identityVerified!==true){
        block('NONPAYMENT_IDENTITY_UNVERIFIED',id);continue;
      }
      const previous=mirrorById.get(id);
      if(previous){
        if(previous.sig.key===sig.key&&
           previous.sig.ident.join('|')===sig.ident.join('|'))
          unchanged.push(id);
        else block('MIRROR_CHANGED_SAME_ID',id);
        continue;
      }
      const matches=historicByKey.get(sig.key)||[];
      if(matches.length){
        // Even exact contract + IPC in old Sheets is only a candidate:
        // the historical row has no durable Cash Control source ID.
        historicCandidates.push({sourceId:id,count:matches.length,
          exactIdentity:matches.filter(h=>h.sig.ident.join('|')===sig.ident.join('|')).length});
        block('HISTORY_CANDIDATE_NEEDS_ID',id);
        continue;
      }
      // A candidate absence is meaningful only if both source and history
      // were independently proved complete, with a stable baseline.
      if(evidence?.sourceComplete!==true||evidence?.historyComplete!==true||
         evidence?.baselineRevalidated!==true){
        block('INCOMPLETE_SNAPSHOT',id);continue;
      }
      // This remains TEST staging only and cannot be fed into production writes.
      testAdds.push({sourceId:id,date:row.date,key:sig.key});
    }
    return Object.freeze({project:norm(project),month,unchanged,
      historicCandidates,testAdds,blockers,
      testEligible:blockers.length===0&&testAdds.length>0,
      productionApproved:false,canWriteProduction:false,
      // A TEST planner is not a Google API writer and never mutates a sheet.
      writesPerformed:0});
  }
  return Object.freeze({prepare});
});
