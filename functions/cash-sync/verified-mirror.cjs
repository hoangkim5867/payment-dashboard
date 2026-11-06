'use strict';
/*
 * PHU HUNG TEST mirror reconciliation executor (opt-in dependency).
 *
 * No Firebase reads, queue scans, raw Payment transformation, or browser token.
 * It ONLY accepts a canonical source delta from an independently validated
 * Cash Control projector. The caller MUST provide full-source and complete
 * historical-ledger verification; no "best effort" financial writes.
 *
 * This module is not wired to the deployed Cloud Function. It is exercised
 * with an isolated fake Google API until the complete source projector and
 * server identity authorization are independently verified.
 */
const {createHash}=require('node:crypto');
const {authorizeBatch,validateRemote,verifyReadback}=require('./three-way.cjs');
const HEADER=['sourceId','projectKey','month','date','company','contractNo',
  'content','ipc','type','income','subcontract','material','otherDirect',
  'indirect','financial','otherPayable','balance','sourceHash','syncStatus'];
const MIRROR='DATA_CASHCONTROL';
const HISTORY='PHU HUNG';
const MAX_REMOTE=10000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const completeHeader=value=>Array.isArray(value)&&value.length===HEADER.length&&
  HEADER.every((col,i)=>String(value[i]??'')===col);
function indexMirror(raw){
  if(!Array.isArray(raw)||raw.length>MAX_REMOTE+1||!completeHeader(raw[0]))
    throw Error('TEST mirror has missing or unexpected 19-column header.');
  const byId=new Map(),positions=new Map();
  raw.slice(1).forEach((values,i)=>{
    if(!Array.isArray(values)||values.length>19)throw Error('Malformed TEST mirror row.');
    // The Sheets Values API can omit trailing empty cells, but a synced row
    // must include both its hash and final status in columns R and S.
    const cells=Array.from({length:19},(_,j)=>values[j]??'');
    if(!cells.some(v=>String(v).trim()))return;
    const row=validateRemote(cells);
    if(byId.has(row.id))throw Error('Duplicate remote source ID '+row.id);
    byId.set(row.id,cells);
    positions.set(row.id,i+2);
  });
  return {byId,positions,count:byId.size,signature:digest([...byId.entries()])};
}
const pack=row=>[row.id,row.project,row.month,...row.values,'',row.hash,'synced'];
function proofOk(result,name){
  if(result?.complete!==true||typeof result.digest!=='string'||
     !/^[a-f0-9]{64}$/.test(result.digest))
    throw Error(name+' verification is missing or incomplete.');
  return result;
}
function sameHistory(before,after){
  proofOk(before,'Historical sheet');
  proofOk(after,'Historical sheet');
  if(before.digest!==after.digest||before.count!==after.count)
    throw Error('Historical PHU HUNG tab changed during TEST synchronization.');
}
async function synchronizeVerifiedDelta({
  canonicalChanges,google,sourceVerifier,historyVerifier
}){
  if(!Array.isArray(canonicalChanges)||canonicalChanges.length===0||
     canonicalChanges.length>1000)
    throw Error('Canonical changes must be a nonempty bounded list.');
  if(!google||typeof google.readMirror!=='function'||
     typeof google.writeMirror!=='function'||typeof google.readHistory!=='function')
    throw Error('A TEST-only Google Sheets adapter is mandatory.');
  if(typeof sourceVerifier!=='function'||typeof historyVerifier!=='function')
    throw Error('Cannot write without complete Cash Control source and history proof.');
  const source=proofOk(await sourceVerifier({changes:canonicalChanges}),'Cash Control source');
  if(source.authoritative!==true)throw Error('Unverified canonical source projection.');
  const historicalRows=await google.readHistory(HISTORY);
  const beforeHistory=proofOk(await historyVerifier(historicalRows),'Historical sheet');
  // A full mirror read validates every existing hash, not merely affected IDs.
  const current=indexMirror(await google.readMirror(MIRROR));
  const authorized=authorizeBatch({events:canonicalChanges,remoteById:current.byId});
  if(authorized.blocked.length)throw Error(
    'Google Sheets conflict, orphan, external edit, or stale Firebase event: no write.');
  if(!authorized.writes.length){
    return {status:'unchanged',proof:{sourceComplete:true,
      googleReadBackVerified:true,historicalLedgerUnchanged:true},
      changed:0};
  }
  // Preflight a second time directly before the write. No Firestore reads.
  const fresh=indexMirror(await google.readMirror(MIRROR));
  if(fresh.signature!==current.signature)
    throw Error('Google mirror changed during preflight; no mutation attempted.');
  // Guarded Google adapter is allowed to write ONLY DATA_CASHCONTROL A:S.
  // No deletion, no write to PHU HUNG or any calculated ledger.
  await google.writeMirror(MIRROR,authorized.writes.map(plan=>({
    kind:plan.kind,id:plan.id,row:pack(plan.row),
    sheetRow:plan.kind==='update'?fresh.positions.get(plan.id):null
  })));
  // Always read back even if Google returned 200 OK.
  const after=indexMirror(await google.readMirror(MIRROR));
  verifyReadback(authorized.plans,after.byId);
  const finalHistory=proofOk(await historyVerifier(
    await google.readHistory(HISTORY)),'Historical sheet');
  sameHistory(beforeHistory,finalHistory);
  return {status:'synced',changed:authorized.writes.length,
    proof:{sourceComplete:true,googleReadBackVerified:true,
      historicalLedgerUnchanged:true}};
}
module.exports={HEADER,MIRROR,HISTORY,indexMirror,pack,proofOk,
  sameHistory,synchronizeVerifiedDelta};
