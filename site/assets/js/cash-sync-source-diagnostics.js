'use strict';
// Pure, zero-read inspection of Cash Control rows already resident in memory.
// This is a completeness/ID diagnostic, NOT approval to write Google Sheets.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSyncSourceDiagnostics=api;
})(typeof window!=='undefined'?window:null,function(){
  const period=/^20\d{2}-(0[1-9]|1[0-2])$/;
  function inspect(project,periodRows,{paymentProjectLoaded=false,firebaseProject='',cutover='2026-10'}={}){
    if(typeof project!=='string'||!project.trim()||!Array.isArray(periodRows)||!period.test(cutover))
      throw Error('Invalid Cash Control source inspection input');
    const key=project.normalize('NFKC').trim().toUpperCase();
    const ids=new Set();
    let transactions=0,missingIds=0,duplicateIds=0,invalidAmounts=0,wrongProject=0,older=0;
    const counts={};
    for(const entry of periodRows){
      if(!entry||typeof entry!=='object'||!period.test(entry.month)||!Array.isArray(entry.rows))
        throw Error('Invalid source month');
      if(entry.month<cutover){older+=entry.rows.length;continue;}
      if(counts[entry.month]!==undefined)throw Error('Duplicate source month');
      counts[entry.month]=entry.rows.length;
      for(const row of entry.rows){
        transactions++;
        if(!row||row.project!==key){wrongProject++;continue;}
        const idsForRow=row._syncIds;
        if(!Array.isArray(idsForRow)||!idsForRow.length||idsForRow.some(id=>typeof id!=='string'||!id)){
          missingIds++;continue;
        }
        const identity=row._taxQuarter?
          'tax:'+key+':'+String(row.date)+':'+String(row._taxQuarter)+':'+String(row._taxDirection||'out'):
          key+':'+[...idsForRow].sort().join('+');
        if(ids.has(identity))duplicateIds++;
        ids.add(identity);
        const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
        if(fields.some(f=>typeof row[f]!=='number'||!Number.isFinite(row[f])))
          invalidAmounts++;
      }
    }
    const live=firebaseProject==='cscecmep-payment';
    const reasons=[];
    if(!live)reasons.push('Nguồn TEST tách khỏi Payment production');
    if(!paymentProjectLoaded)reasons.push('Chưa tải toàn bộ Payment dự án');
    if(!Object.keys(counts).length)reasons.push('Chưa có kỳ nguồn để kiểm tra');
    if(missingIds)reasons.push('Có giao dịch thiếu ID nguồn');
    if(duplicateIds)reasons.push('Có ID giao dịch trùng');
    if(invalidAmounts)reasons.push('Có giá trị tiền không hợp lệ');
    if(wrongProject)reasons.push('Có dòng không thuộc dự án');
    return Object.freeze({project:key,transactions,months:counts,olderExcluded:older,
      missingIds,duplicateIds,invalidAmounts,wrongProject,
      paymentProjectLoaded:!!paymentProjectLoaded,productionSource:live,
      reasons,sourceStructureValid:reasons.length===0,
      // Even a valid source does not certify coverage of historical transactions.
      sourceCompletenessVerified:false,canWrite:false});
  }
  return Object.freeze({inspect});
});
