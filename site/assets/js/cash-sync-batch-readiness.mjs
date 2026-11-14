/**
 * In-memory planning for manual Cash Control → Google Sheets across projects.
 * Strictly pure. Never reads Google/Firebase or authorizes a write.
 * Candidate rows are only the state already present in the current page.
 */
const VALUE_FIELDS=['income','subcontract','material','otherDirect','indirect',
  'financial','otherPayable'];
const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;
const identity=x=>String(x??'').normalize('NFKC').trim();
const finiteAmount=v=>typeof v==='number'&&Number.isFinite(v);
const validDay=date=>{
  if(typeof date!=='string'||!/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date))
    return false;
  const [year,month,day]=date.split('-').map(Number);
  const parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&
    parsed.getUTCDate()===day;
};
function auditProject({project,month,rows,hasLink}){
  if(!Array.isArray(rows)||rows.length>10000)
    throw Error('UNBOUNDED_PROJECT_ROWS');
  const seen=new Set(),details={
    project,transactions:rows.length,hasLink:Boolean(hasLink),sourceIds:0,
    missingSourceIds:0,duplicateSourceIds:0,invalidAmounts:0,
    invalidDates:0,wrongMonthRows:0,unknownImportTax:0,transferRows:0,
    transferCounterpartsUnverified:0,income:0,expenses:0
  };
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row))
      throw Error('INVALID_TRANSACTION');
    if(!validDay(row.date))details.invalidDates++;
    else if(row.date.slice(0,7)!==month)details.wrongMonthRows++;
    const ids=row._syncIds;
    if(!Array.isArray(ids)||!ids.length||
       ids.some(id=>typeof id!=='string'||!identity(id))){
      details.missingSourceIds++;
    }else{
      const idsForRow=new Set();
      for(const id of ids){
        const value=identity(id);
        if(idsForRow.has(value)||seen.has(value))details.duplicateSourceIds++;
        idsForRow.add(value);seen.add(value);
      }
      details.sourceIds+=ids.length;
      if(ids.some(id=>String(id).startsWith('transfer:'))){
        details.transferRows++;
        // A source ID is not proof that BOTH sides of a transfer agree.
        details.transferCounterpartsUnverified++;
      }
    }
    for(const key of VALUE_FIELDS){
      const amount=row[key];
      if(!finiteAmount(amount)){details.invalidAmounts++;continue;}
      if(key==='income')details.income+=amount;
      else{if(amount<0)details.invalidAmounts++;details.expenses+=amount;}
    }
    if(project==='FOXCONN'&&
       !finiteAmount(row.importTaxVat))details.unknownImportTax++;
    if(project==='FOXCONN'&&finiteAmount(row.importTaxVat)){
      if(row.importTaxVat<0)details.invalidAmounts++;
      else details.expenses+=row.importTaxVat;
    }
  }
  details.net=details.income-details.expenses;
  details.needsReview=details.missingSourceIds+details.duplicateSourceIds+
    details.invalidAmounts+details.invalidDates+details.wrongMonthRows+details.unknownImportTax+
    details.transferCounterpartsUnverified;
  details.status=rows.length===0?'NO_ACTIVITY_IN_MEMORY':
    !hasLink?'MISSING_GOOGLE_LINK':
    details.needsReview?'SOURCE_REVIEW_REQUIRED':'GOOGLE_COMPARISON_CANDIDATE';
  // Importantly: good input IDs and links alone never prove completeness.
  // Production payment, historic Google balances and sheet ownership remain unverified.
  details.canWrite=false;
  details.sourceComplete=false;
  details.googleCompared=false;
  return Object.freeze(details);
}
export function buildBatchReadiness({month,projects,links={},rowsByProject={}}={}){
  if(typeof month!=='string'||!MONTH.test(month)||month<'2026-10')
    throw Error('INVALID_SYNC_MONTH');
  if(!Array.isArray(projects)||projects.length>150)
    throw Error('INVALID_PROJECT_CATALOG');
  const used=new Set(),report=[];
  for(const value of projects){
    const project=identity(value);
    if(!project||project.length>180||used.has(project))
      throw Error('INVALID_OR_DUPLICATE_PROJECT');
    used.add(project);
    const rows=Object.prototype.hasOwnProperty.call(rowsByProject,project)?
      rowsByProject[project]:[];
    report.push(auditProject({project,month,rows,hasLink:links[project]===true}));
  }
  report.sort((a,b)=>a.project.localeCompare(b.project));
  const linkedProjects=report.filter(row=>row.hasLink).length;
  const unlinkedProjects=report.length-linkedProjects;
  const active=report.filter(row=>row.transactions>0);
  const review=active.filter(row=>row.needsReview>0);
  const missingLink=active.filter(row=>!row.hasLink);
  const eligibleForComparison=active.filter(row=>row.status==='GOOGLE_COMPARISON_CANDIDATE');
  return Object.freeze({
    month,projects:report.length,linkedProjects,unlinkedProjects,
    activeProjects:active.length,
    activeRows:active.reduce((sum,row)=>sum+row.transactions,0),
    candidateProjects:eligibleForComparison.length,
    missingLinkProjects:missingLink.length,
    sourceReviewProjects:review.length,
    inactiveProjects:report.length-active.length,
    // No network, no database read/write, and no synchronization.
    firestoreReads:0,googleReads:0,googleWrites:0,canWrite:false,
    verification:'IN_MEMORY_ONLY',
    absentRowsDoNotProveNoActivity:true,
    rows:Object.freeze(report)
  });
}
