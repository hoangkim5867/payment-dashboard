'use strict';
/*
 * Static, read-only TEST ledger assessment. Input comes exclusively from
 * the existing Cash Control export (already classified by the real app).
 * Output contains COUNTS only, no employee, vendor or account information.
 *
 * A client-generated snapshot is not authoritative evidence of latest
 * Firebase state. This audit never grants unattended Sheets write permission.
 */
const {parseSourceSnapshot}=require('./source-snapshot.cjs');
const {verifyHistory,fingerprint}=require('./history-audit.cjs');
const {indexMirror}=require('./verified-mirror.cjs');
function auditSourceAgainstTestLedger({snapshot,historical,historyFormulas,mirror}){
  const source=parseSourceSnapshot(snapshot);
  const history=verifyHistory(historical,historyFormulas);
  const mirrored=indexMirror(mirror);
  const months=new Set(source.months.keys());
  const sourceRows=[...source.months.values()].flat();
  const bySignature=new Map();
  for(const row of history.transactions.filter(tx=>months.has(tx.date.slice(0,7)))){
    const key=fingerprint(row.values);
    if(!bySignature.has(key))bySignature.set(key,[]);
    bySignature.get(key).push(row);
  }
  const groups=Object.fromEntries([...months].sort().map(month=>[month,{
    source:0,history:0,mirror:0,pending:0,conflicts:0
  }]));
  for(const month of months){
    groups[month].history=history.transactions.filter(tx=>tx.date.slice(0,7)===month).length;
    groups[month].mirror=[...mirrored.byId.values()].filter(row=>row[2]===month).length;
  }
  const conflicts=[],pending=[];
  const seenSourceIds=new Set();
  for(const row of sourceRows){
    const group=groups[row.month];group.source++;seenSourceIds.add(row.id);
    const same=(bySignature.get(fingerprint(row.values))||[]);
    // One-to-one matching preserves duplicate occurrences, unlike totals.
    const matched=same.shift();
    const remote=mirrored.byId.get(row.id);
    if(matched){
      if(remote){group.conflicts++;conflicts.push('historical-and-mirrored');}
      continue;
    }
    if(!remote){group.pending++;pending.push({id:row.id,month:row.month});continue}
    if(remote[17]!==row.hash||remote[2]!==row.month){
      group.conflicts++;conflicts.push('mirror-source-mismatch');
    }
  }
  const unmatchedHistory=[...bySignature.values()].reduce((n,rows)=>n+rows.length,0);
  if(unmatchedHistory)conflicts.push('history-missing-from-source');
  let orphanCount=0;
  for(const [id,remote] of mirrored.byId){
    if(!months.has(remote[2]))continue;
    if(!seenSourceIds.has(id)){orphanCount++;conflicts.push('mirror-orphan');}
  }
  const matchedHistory=Object.values(groups).reduce((n,g)=>n+g.history,0)-unmatchedHistory;
  return {
    project:'PHU HUNG',testedMonths:[...months].sort(),
    sourceCount:sourceRows.length,historyCount:history.count,
    testedHistoryCount:Object.values(groups).reduce((n,g)=>n+g.history,0),
    matchedHistory,unmatchedHistory,
    mirrorCount:mirrored.count,orphanCount,
    pendingCount:pending.length,conflictCount:conflicts.length,
    conflictKinds:[...new Set(conflicts)].sort(),groups,
    historicalOpening:history.opening,historicalClosing:history.closing,
    historicalBalanceVerified:true,
    sourceFormatVerified:true,
    sourceAuthoritative:false,
    eligibleForUnattendedWrites:false,
    status:conflicts.length?'blocked':pending.length?'pending-mirror':'matched-read-only'
  };
}
async function auditWithInspector({snapshot,inspector}){
  if(!inspector||typeof inspector.read!=='function'||
     typeof inspector.readFormulas!=='function')
    throw Error('A verified read-only Google Sheets inspector is required.');
  // Validate source schema/hash before ANY Google network access.
  parseSourceSnapshot(snapshot);
  const historical=await inspector.read('PHU HUNG','A1:N10001');
  const historyFormulas=await inspector.readFormulas('PHU HUNG','N1:N10001');
  const mirror=await inspector.read('DATA_CASHCONTROL','A1:S10001');
  return auditSourceAgainstTestLedger({snapshot,historical,historyFormulas,mirror});
}
module.exports={auditSourceAgainstTestLedger,auditWithInspector};
