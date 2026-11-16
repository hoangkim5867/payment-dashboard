'use strict';
/**
 * Admin-only, metadata-only release audit for the shared 35-project sync.
 * Never touches Payment, Firebase document collections, Sheets APIs or ledger
 * rows. Server-side env flags and allowlist are the ONLY release authority.
 */
const {parseAllowlist}=require('./cash-sync-multi-targets.cjs');
const PROJECT=/^[\p{L}\p{N}][\p{L}\p{N} ._+()\-/]{0,179}$/u;
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const normalize=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
function parseTargets(items){
 if(!Array.isArray(items)||items.length>35)throw Error('INVALID_RELEASE_CATALOG');
 const seen=new Set(),ids=new Set();
 return items.map(item=>{
  const project=normalize(item?.project);
  if(!PROJECT.test(project)||seen.has(project)||!item||
     typeof item!=='object'||Array.isArray(item)||
     Object.keys(item).sort().join(',')!=='historySheetId,project,spreadsheetId')
   throw Error('INVALID_RELEASE_PROJECT');
  seen.add(project);
  const spreadsheetId=item.spreadsheetId||'';
  const historySheetId=item.historySheetId;
  if(typeof spreadsheetId!=='string'||spreadsheetId.length>120||
     !Number.isSafeInteger(historySheetId)||historySheetId<0||
     ID.test(spreadsheetId)&&ids.has(spreadsheetId))
   throw Error('INVALID_RELEASE_DESTINATION');
  if(ID.test(spreadsheetId))ids.add(spreadsheetId);
  return {project,spreadsheetId,historySheetId};
 });
}
function inspectRelease({env,projects}){
 const selected=parseTargets(projects);
 const production=env?.VERCEL_ENV==='production';
 const trusted=production&&env?.CASH_SYNC_FIREBASE_PROJECT_ID==='cscecmep-payment';
 const enabled=trusted&&env?.CASH_SYNC_MULTI_PRODUCTION_WRITES==='YES';
 let allowlist,allowlistError=false;
 try{allowlist=parseAllowlist(env?.CASH_SYNC_MULTI_ALLOWED_TARGETS)}
 catch{allowlist=new Map();allowlistError=true}
 const rows=selected.map(x=>{
  const target=allowlist.get(x.project);
  const reason=!production?'PREVIEW_NEVER_WRITES_PRODUCTION':
   !trusted?'PRODUCTION_FIREBASE_MISMATCH':
   allowlistError?'SERVER_ALLOWLIST_INVALID':
   !enabled?'PRODUCTION_RELEASE_FLAG_DISABLED':
   !ID.test(x.spreadsheetId)?'GOOGLE_LINK_MISSING':
   !target?'PROJECT_NOT_APPROVED_IN_SERVER_ALLOWLIST':
   target.spreadsheetId!==x.spreadsheetId||
     target.historySheetId!==x.historySheetId?'GOOGLE_DESTINATION_NOT_APPROVED':
   'SERVER_TARGET_ENABLED';
  return Object.freeze({
   project:x.project,serverTargetEnabled:reason==='SERVER_TARGET_ENABLED',
   reason,canWriteWithoutSourceAndGoogleChecks:false
  });
 });
 return Object.freeze({
  kind:'ADMIN_RELEASE_METADATA_ONLY',environment:production?'production':'preview',
  productionReleaseFlagEnabled:enabled,serverAllowlistConfigured:!!allowlist.size,
  serverAllowlistValid:!allowlistError,
  requestedProjects:rows.length,serverEnabledProjects:rows.filter(x=>x.serverTargetEnabled).length,
  blockedProjects:rows.filter(x=>!x.serverTargetEnabled).length,
  rows:Object.freeze(rows),
  // Enabling a target never certifies Cash Control source, historical Google
  // balance, edit conflicts or admin signing; server commit revalidates all.
  approvedForActualWrites:false,sourceComplete:false,googleCompared:false,
  firestoreReads:0,googleReads:0,googleWrites:0
 });
}
module.exports={parseTargets,inspectRelease};
