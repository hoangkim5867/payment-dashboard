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
// A transfer has two export legs: a negative signed receipt in the sending
// project and an equal positive receipt in the receiving project. Recognize
// ONLY a complete and unambiguous two-leg pair already loaded in this month's
// Cash Control export rows. Never query Payment or infer a missing leg.
function verifiedTransferLegs(month,projects,rowsByProject){
  const legs=new Map(),verified=new Set();
  for(const project of projects){
    const rows=Object.prototype.hasOwnProperty.call(rowsByProject,project)?
      rowsByProject[project]:[];
    if(!Array.isArray(rows)||rows.length>10000)
      throw Error('UNBOUNDED_PROJECT_ROWS');
    for(const row of rows){
      const ids=row?._syncIds;
      if(!Array.isArray(ids)||ids.length!==1||typeof ids[0]!=='string')continue;
      const match=/^transfer:(.+):(out|in)$/.exec(ids[0]);
      if(!match)continue;
      const transferId=match[1];
      if(!transferId||transferId.length>500||!validDay(row.date)||
         row.date.slice(0,7)!==month)continue;
      if(!legs.has(transferId))legs.set(transferId,[]);
      legs.get(transferId).push({id:ids[0],project,date:row.date,direction:match[2],
        income:row.income,expenses:VALUE_FIELDS.slice(1).map(k=>row[k]),
        importTaxVat:row.importTaxVat});
    }
  }
  for(const entries of legs.values()){
    if(entries.length!==2)continue;
    const sender=entries.find(x=>x.direction==='out');
    const receiver=entries.find(x=>x.direction==='in');
    if(!sender||!receiver||sender===receiver||
       sender.project===receiver.project||sender.date!==receiver.date||
       typeof sender.income!=='number'||typeof receiver.income!=='number'||
       !Number.isSafeInteger(sender.income)||!Number.isSafeInteger(receiver.income)||
       sender.income>=0||receiver.income<=0||
       sender.income!==-receiver.income)continue;
    if(entries.some(x=>x.expenses.some(v=>v!==0)||
      (x.importTaxVat!==undefined&&x.importTaxVat!==0)))continue;
    verified.add(sender.id);verified.add(receiver.id);
  }
  return verified;
}
function auditProject({project,month,rows,hasLink,verifiedTransfers}){
  if(!Array.isArray(rows)||rows.length>10000)
    throw Error('UNBOUNDED_PROJECT_ROWS');
  const seen=new Set(),details={
    project,transactions:rows.length,hasLink:Boolean(hasLink),sourceIds:0,
    missingSourceIds:0,duplicateSourceIds:0,invalidAmounts:0,
    invalidDates:0,wrongMonthRows:0,unknownImportTax:0,transferRows:0,
    transferCounterpartsUnverified:0,verifiedTransferRows:0,income:0,expenses:0
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
        if(ids.length===1&&verifiedTransfers.has(ids[0]))
          details.verifiedTransferRows++;
        else details.transferCounterpartsUnverified++;
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
  // Only values already in the browser's selected-month export snapshot.
  // Counterpart proof never implies a complete Payment/Google source.
  for(const value of projects){
    const project=identity(value);
    if(!project||project.length>180||used.has(project))
      throw Error('INVALID_OR_DUPLICATE_PROJECT');
    used.add(project);
  }
  const verifiedTransfers=verifiedTransferLegs(month,used,rowsByProject);
  used.clear();
  for(const value of projects){
    const project=identity(value);
    if(!project||project.length>180||used.has(project))
      throw Error('INVALID_OR_DUPLICATE_PROJECT');
    used.add(project);
    const rows=Object.prototype.hasOwnProperty.call(rowsByProject,project)?
      rowsByProject[project]:[];
    report.push(auditProject({project,month,rows,hasLink:links[project]===true,verifiedTransfers}));
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
    verifiedTransferPairs:verifiedTransfers.size/2,
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
