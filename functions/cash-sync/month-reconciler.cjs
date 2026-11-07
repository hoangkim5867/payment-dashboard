'use strict';
/*
 * CONSERVATIVE full-month TEST reconciliation.
 *
 * - Reads current authoritative exported rows from IAM-private production.
 * - Verifies original PHU HUNG history+formulas and excludes each historical
 *   transaction one-to-one; never duplicates transactions already in history.
 * - Only appends genuinely NEW source IDs in TEST mirror.
 * - Existing mirror IDs with matching hashes are idempotent.
 * - Changed, deleted or orphan mirror records stop for manual review until a
 *   separate trusted previous-row audit is available (NEVER silently overwrite).
 * - Uses prior writer's before/after hash + readback safeguards.
 * - No live write without the Firebase/SHEETS release gate and privileges.
 */
const {createHash}=require('node:crypto');
const {validRow}=require('./three-way.cjs');
const {MIRROR,HISTORY,indexMirror,synchronizeVerifiedDelta}=require('./verified-mirror.cjs');
const {fingerprint,verifyHistory}=require('./history-audit.cjs');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const MAX_CHANGES=100;
function planMonth({source,history,mirror}={}){
  if(!source||source.authoritative!==true||
     source.sourceComplete!==true||!/^[a-f0-9]{64}$/.test(source.proof||'')||
     !Array.isArray(source.rows)||!history||history.complete!==true||
     !(mirror?.byId instanceof Map))
    throw Error('Canonical source/history/mirror evidence missing.');
  const month=source.month;
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month<'2026-10'||
     source.project!=='PHU HUNG')
    throw Error('Unapproved PHU HUNG month.');
  const historyIds=new Map();
  const historical=history.transactions.filter(r=>r.date.slice(0,7)===month);
  for(const transaction of historical){
    const signature=fingerprint(transaction.values);
    if(!historyIds.has(signature))historyIds.set(signature,0);
    historyIds.set(signature,historyIds.get(signature)+1);
  }
  const canonicalIds=new Set(),matchedHistory=new Set(),pending=[];
  for(const raw of source.rows){
    const row=validRow(raw);
    if(row.month!==month||canonicalIds.has(row.id))
      throw Error('Duplicate or outside-month canonical source record.');
    canonicalIds.add(row.id);
    const signature=fingerprint(row.values);
    const count=historyIds.get(signature)||0;
    if(count>0){
      if(mirror.byId.has(row.id))
        throw Error('Duplicate financial transaction in history and TEST mirror.');
      historyIds.set(signature,count-1);
      matchedHistory.add(row.id);
      continue;
    }
    const stored=mirror.byId.get(row.id);
    if(stored){
      if(stored[2]!==month||stored[17]!==row.hash)
        throw Error('Existing TEST financial row changed; previous source proof required.');
    }else{
      pending.push({after:row});
    }
  }
  if([...historyIds.values()].some(count=>count!==0))
    throw Error('Historical PHU HUNG transaction missing from authoritative source.');
  for(const [id,stored] of mirror.byId){
    if(stored[2]===month&&!canonicalIds.has(id))
      throw Error('Orphan financial row in TEST mirror; no automatic delete.');
  }
  if(pending.length>MAX_CHANGES)
    throw Error('Too many new transactions; break into reviewed TEST batches.');
  return {pending,matchedHistory:matchedHistory.size,
    sourceCount:source.rows.length,existingMirror:source.rows.length-
      matchedHistory.size-pending.length};
}
function createReconciler({canonicalReader,google,inspector}={}){
  if(typeof canonicalReader!=='function'||!google||
     typeof google.readHistory!=='function'||
     typeof google.readMirror!=='function'||
     typeof google.writeMirror!=='function'||!inspector||
     typeof inspector.readFormulas!=='function')
    throw Error('Private canonical reader and approved Google TEST adapters required.');
  const historyVerifier=async rows=>{
    const formulas=await inspector.readFormulas(HISTORY,'N1:N10001');
    const v=verifyHistory(rows,formulas);
    return {complete:true,count:v.count,digest:digest([rows,formulas])};
  };
  return async function reconcile({project,month,target}={}){
    if(project!=='PHU HUNG'||target!=='PHU_HUNG_VIEW_TEST')
      throw Error('Unapproved reconciliation destination.');
    const source=await canonicalReader(month);
    const rawHistory=await google.readHistory(HISTORY);
    const formulas=await inspector.readFormulas(HISTORY,'N1:N10001');
    const history=verifyHistory(rawHistory,formulas);
    const initial=indexMirror(await google.readMirror(MIRROR));
    const plan=planMonth({source,history,mirror:initial});
    const beforeHistory=digest([rawHistory,formulas]);
    if(!plan.pending.length){
      // No writes: still require the baseline to be unchanged before treating
      // this event as reconciled, and all mirror/source IDs to match.
      const afterHistory=await google.readHistory(HISTORY);
      const afterFormulas=await inspector.readFormulas(HISTORY,'N1:N10001');
      if(digest([afterHistory,afterFormulas])!==beforeHistory)
        throw Error('Protected historical ledger changed during no-op verification.');
      const latest=indexMirror(await google.readMirror(MIRROR));
      if(latest.signature!==initial.signature)
        throw Error('TEST mirror changed during no-op verification.');
      return {status:'unchanged',proof:{sourceComplete:true,
        googleReadBackVerified:true,historicalLedgerUnchanged:true}};
    }
    // This executor performs a second mirror preflight, TEST-only RAW write,
    // Google row read-back, and a post-write history+formula check.
    const result=await synchronizeVerifiedDelta({
      canonicalChanges:plan.pending,google,
      sourceVerifier:async()=>({complete:true,authoritative:true,
        digest:source.proof}),
      historyVerifier
    });
    // Assert that the original historical FORMULAS and values also remained
    // unchanged compared with the initial full-month preflight.
    const finalRows=await google.readHistory(HISTORY);
    const finalFormulas=await inspector.readFormulas(HISTORY,'N1:N10001');
    if(digest([finalRows,finalFormulas])!==beforeHistory)
      throw Error('Protected historical ledger or formula changed after write.');
    return result;
  };
}
module.exports={MAX_CHANGES,planMonth,createReconciler};
