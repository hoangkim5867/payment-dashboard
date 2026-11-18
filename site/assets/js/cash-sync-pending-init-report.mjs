/**
 * Read-only, locally computed opening-balance initialization review for newly
 * configured Google targets. Never grants write permission, never contacts
 * Google, and never treats an empty/new workbook as a zero opening balance.
 * Existing source is Cash Control's Chinese grouped-ledger projection.
 */
export const PENDING_INIT_MONTHS=Object.freeze([
  '2026-08','2026-09','2026-10','2026-11'
]);
const fields=['income','subcontract','material','otherDirect',
  'indirect','financial','otherPayable'];
const safe=n=>typeof n==='number'&&Number.isFinite(n);
const bad=code=>{throw Error(code)};
export function buildPendingInitializationReport({
  targets,openingStart,monthRows,monthsLoaded,monthPaymentCounts,
  cashClosings,revision
}={}){
  if(!Array.isArray(targets)||targets.length<1||targets.length>35||
     !openingStart||typeof openingStart!=='object'||!monthRows||
     typeof monthRows!=='object'||!monthsLoaded||
     typeof monthsLoaded!=='object'||!cashClosings||
     typeof cashClosings!=='object'||!Number.isSafeInteger(revision)||
     revision<0)bad('PENDING_INIT_INPUT_INVALID');
  const known=new Set(),fileIds=new Set();
  const coverage=PENDING_INIT_MONTHS.every(m=>monthsLoaded[m]===true);
  let groupedRows=0,missingIdentities=0,mismatches=0;
  const projects=targets.map(target=>{
    const project=target?.project,serverProject=target?.serverProject;
    if(typeof project!=='string'||!project.trim()||known.has(project)||
       typeof serverProject!=='string'||!serverProject.trim()||
       typeof target.spreadsheetId!=='string'||
       !/^[A-Za-z0-9_-]{20,100}$/.test(target.spreadsheetId)||
       fileIds.has(target.spreadsheetId)||
       !Number.isSafeInteger(target.historySheetId)||
       target.historySheetId<0)bad('PENDING_INIT_TARGET_INVALID');
    known.add(project);fileIds.add(target.spreadsheetId);
    const hasOpening=Object.prototype.hasOwnProperty.call(openingStart,project);
    const opening=hasOpening?Number(openingStart[project]):null;
    const openingValid=hasOpening&&safe(opening);
    let running=openingValid?opening:null,issues=[];
    if(!openingValid)issues.push('MISSING_OR_INVALID_2026_08_OPENING');
    if(!coverage)issues.push('ACTUAL_PAYMENT_MONTH_COVERAGE_MISSING');
    let projectRows=0,projectMissingIds=0,projectMismatchCount=0;
    const seenIds=new Set();
    const months=PENDING_INIT_MONTHS.map(month=>{
      const rows=monthRows[project]?.[month];
      const expectedCash=cashClosings[project]?.[month];
      if(!Array.isArray(rows))bad('PENDING_INIT_ROWS_MISSING');
      if(!safe(expectedCash))bad('PENDING_INIT_CASH_CLOSING_MISSING');
      const start=running,details=[];
      let net=0;
      for(const r of rows){
        if(!r||typeof r.date!=='string'||!r.date.startsWith(month+'-')||
           fields.some(k=>!safe(r[k]))||
           ['company','contractNo','content','ipc','type'].some(k=>
             typeof r[k]!=='string'))
          bad('PENDING_INIT_TRANSACTION_INVALID');
        const rowNet=r.income-r.subcontract-r.material-r.otherDirect-
          r.indirect-r.financial-r.otherPayable;
        net+=rowNet;
        let validIdentity=Array.isArray(r.sourceIds)&&
          r.sourceIds.length>0&&r.sourceIds.every(id=>
            typeof id==='string'&&id.length>2&&id.length<=500&&
            !/^excel-row:/i.test(id)&&!seenIds.has(id));
        if(validIdentity)r.sourceIds.forEach(id=>seenIds.add(id));
        else projectMissingIds++;
        details.push({
          date:r.date,company:r.company,contractNo:r.contractNo,
          content:r.content,ipc:r.ipc,type:r.type,
          income:r.income,subcontract:r.subcontract,material:r.material,
          otherDirect:r.otherDirect,indirect:r.indirect,
          financial:r.financial,otherPayable:r.otherPayable,
          sourceIds:Array.isArray(r.sourceIds)?[...r.sourceIds]:[],
          net:rowNet,sourceIdentityVerified:false
        });
      }
      projectRows+=rows.length;
      if(running!==null)running+=net;
      const difference=running===null?null:running-expectedCash;
      const agrees=difference!==null&&Math.abs(difference)<=0.001;
      if(!agrees)projectMismatchCount++;
      return {month,opening:start,rows:rows.length,net,
        closing:running,cashControlClosing:expectedCash,difference,
        arithmeticMatchesCashControl:agrees,details};
    });
    groupedRows+=projectRows;
    missingIdentities+=projectMissingIds;
    mismatches+=projectMismatchCount;
    if(projectMissingIds)issues.push('GROUPED_SOURCE_ID_REVIEW_REQUIRED');
    if(projectMismatchCount)issues.push('CASH_CONTROL_BALANCE_DIFFERENCE');
    // An independently signed Admin source proof + Google readback are still
    // required before release, regardless of whether these checks pass.
    return {project,serverProject,spreadsheetId:target.spreadsheetId,
      historySheetId:target.historySheetId,
      openingAt20260801:openingValid?opening:null,
      rowCount:projectRows,lastClosing:running,months,
      issues,reviewState:issues.length?'NEEDS_REVIEW':'SOURCE_SUMMARY_ONLY',
      sourceCertified:false,googleCompared:false,canWrite:false};
  });
  return {schema:'CASH_SYNC_PENDING_INIT_READONLY_V1',
    periodStart:'2026-08-01',periodEnd:'2026-11-30',
    cashRevision:revision,projectsCount:projects.length,
    groupedRows,missingIdentities,mismatches,
    paymentMonthCoverage:coverage,
    paymentDocumentsByMonth:Object.fromEntries(PENDING_INIT_MONTHS.map(month=>[
      month,Number.isSafeInteger(monthPaymentCounts?.[month])?
        monthPaymentCounts[month]:null])),
    projects,sourceCertified:false,googleCompared:false,
    canWrite:false,googleWrites:0,firestoreWrites:0,
    note:'Dữ liệu Cash Control đọc tại phiên Admin. Chưa xác minh nguồn độc lập; chỉ dùng để đối chiếu, không cấp phép ghi.'};
}
