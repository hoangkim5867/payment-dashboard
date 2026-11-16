/**
 * Exact selected-month read-only manifest of already grouped
 * legacyCashExportRows() - the same rows Cash Control's Xuất Excel uses.
 *
 * No Firestore/Google access, no localStorage, no export side effect and no
 * assertion that Payment or Google coverage is complete. All projects share
 * one planner. Never regroup payroll/PIT: legacyCashExportRows has already
 * merged quarterly tax rows in the same way as the Excel download.
 */
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const MONEY=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
const text=v=>String(v??'').normalize('NFKC').trim();
const safeNumber=v=>typeof v==='number'&&Number.isFinite(v);
const validDate=date=>{
  if(typeof date!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date))
    return false;
  const [year,month,day]=date.split('-').map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
};
function sourceId(project,row){
 const ids=row?._syncIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||
    ids.some(v=>typeof v!=='string'||!text(v)||text(v).length>500))
   return null;
 if(new Set(ids.map(text)).size!==ids.length)return null;
 if(row._taxQuarter){
   const quarter=text(row._taxQuarter);
   if(!quarter||quarter.length>100||
      !['out','in'].includes(row._taxDirection||'out'))return null;
   return 'tax:'+project+':'+row.date+':'+quarter+':'+(row._taxDirection||'out');
 }
 return project+':'+ids.map(text).sort().join('+');
}
function sourceKind(row,resolveKind){
 const ids=row._syncIds;
 const kinds=ids.map(id=>
   id.startsWith('transfer:')?'TRANSFER':
   typeof resolveKind==='function'?resolveKind(id):'UNKNOWN');
 if(kinds.some(k=>!['TRANSFER','PAYMENT','CASH','PAYROLL'].includes(k)))
   return 'UNKNOWN';
 if(row._taxQuarter&&kinds.every(k=>k==='PAYROLL'||k==='CASH'))
   return 'PAYROLL';
 return new Set(kinds).size===1?kinds[0]:'MIXED';
}
function buildProject({project,month,rows,hasGoogleLink,paymentCacheLoaded,
  resolveKind,expectedRowCount}){
 const issues=[],records=[],seen=new Set(),seenSignatures=new Set();
 if(!Array.isArray(rows)||rows.length>10000)throw Error('UNBOUNDED_PROJECT_ROWS');
 for(const [index,row] of rows.entries()){
   const location=index+1;
   if(!row||typeof row!=='object'||Array.isArray(row)){
     issues.push({row:location,code:'INVALID_ROW'});continue;
   }
   if(!validDate(row.date)||row.date.slice(0,7)!==month){
     issues.push({row:location,code:'INVALID_OR_OTHER_MONTH_DATE'});continue;
   }
   const id=sourceId(project,row);
   if(!id||id.length>500||seen.has(id)){
     issues.push({row:location,code:id?'DUPLICATE_SOURCE_ID':'MISSING_OR_INVALID_SOURCE_ID'});
     continue;
   }
   seen.add(id);
   const money=MONEY.map(k=>row[k]);
   if(money.some(v=>!safeNumber(v))||money.slice(1).some(v=>v<0)||
     (project==='FOXCONN'&&(!safeNumber(row.importTaxVat)||row.importTaxVat<0))){
     issues.push({row:location,code:'INVALID_AMOUNT_OR_TAX'});continue;
   }
   const kind=sourceKind(row,resolveKind);
   if(kind==='UNKNOWN'||kind==='MIXED'){
     issues.push({row:location,code:'SOURCE_KIND_REVIEW'});
   }
   const values=[row.date,...['company','contractNo','content','ipc','type']
     .map(k=>String(row[k]??'')),...money];
   if(project==='FOXCONN')values.push(row.importTaxVat);
   // Unique source IDs alone are not sufficient to prevent duplicate money
   // movements. Reject equivalent Export Excel rows with different IDs;
   // a human must decide whether two identical actual payments are legitimate.
   const signature=JSON.stringify([...values.slice(0,6).map(v=>
     String(v).normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase()),
     ...values.slice(6)]);
   if(seenSignatures.has(signature)){
     issues.push({row:location,code:'DUPLICATE_EXCEL_TRANSACTION'});continue;
   }
   seenSignatures.add(signature);
   records.push(Object.freeze({id,project,month,sourceClass:kind,
     // No hash until an authenticated, fresh source snapshot is certified.
     values:Object.freeze(values)}));
 }
 if(expectedRowCount!==undefined&&expectedRowCount!==rows.length)
   issues.push({row:null,code:'GROUPED_EXCEL_ROW_COUNT_CHANGED'});
 const state=rows.length===0?'NO_ROWS_IN_LOADED_MEMORY':
   !paymentCacheLoaded?'PAYMENT_COVERAGE_UNKNOWN':
   !hasGoogleLink?'MISSING_GOOGLE_LINK':
   issues.length?'SOURCE_REVIEW_REQUIRED':'HISTORY_COMPARISON_CANDIDATE';
 return Object.freeze({project,month,groupedExcelRows:rows.length,
   sourceRecords:records.length,hasGoogleLink:Boolean(hasGoogleLink),
   paymentCacheLoaded:Boolean(paymentCacheLoaded),
   expectedRowCount:expectedRowCount??null,
   state,issues:Object.freeze(issues),records:Object.freeze(records),
   // Cache loaded, stable IDs and sheet links do NOT certify completeness.
   paymentBusinessComplete:false,googleHistoryCompared:false,canWrite:false});
}
export function buildMonthlyExportManifest({
 month,projects,rowsByProject={},links={},paymentCacheProjects=[],
 resolveKind,expectedCounts={}
}={}){
 if(!MONTH.test(month)||month<'2026-10')throw Error('INVALID_MONTH');
 if(!Array.isArray(projects)||projects.length>150||
    !Array.isArray(paymentCacheProjects)||paymentCacheProjects.length>150)
   throw Error('INVALID_CATALOG');
 const catalog=new Set(),cache=new Set(paymentCacheProjects.map(text));
 const groups=[];
 for(const item of projects){
   const project=text(item);
   if(!project||project.length>180||catalog.has(project))
     throw Error('INVALID_OR_DUPLICATE_PROJECT');
   catalog.add(project);
   const rows=Object.prototype.hasOwnProperty.call(rowsByProject,project)?
     rowsByProject[project]:[];
   groups.push(buildProject({project,month,rows,
     hasGoogleLink:links[project]===true,paymentCacheLoaded:cache.has(project),
     expectedRowCount:expectedCounts[project],resolveKind}));
 }
 const active=groups.filter(group=>group.groupedExcelRows>0);
 return Object.freeze({month,catalogProjects:groups.length,
   activeProjects:active.length,groupedRows:active.reduce((n,g)=>n+g.groupedExcelRows,0),
   sourcesInMemory:active.reduce((n,g)=>n+g.sourceRecords,0),
   needsSourceReview:active.filter(g=>g.issues.length>0).length,
   loadedPaymentProjects:active.filter(g=>g.paymentCacheLoaded).length,
   historyComparisonCandidates:active.filter(g=>g.state==='HISTORY_COMPARISON_CANDIDATE').length,
   groups:Object.freeze(groups),
   // Strictly current browser memory, never a privileged source attestation.
   sourceAuthenticated:false,sourceComplete:false,canSync:false,canWrite:false,
   firestoreReads:0,googleReads:0,googleWrites:0,
   automaticProjectScan:false});
}
