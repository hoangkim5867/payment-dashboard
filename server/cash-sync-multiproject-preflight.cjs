'use strict';
// Multi-project preflight of externally fetched Google Sheets metadata.
// PURE verification only: callers must fetch metadata with read-only Google API.
// This cannot authorize a write or replace per-project historical reconciliation.
const {normalizeProject}=require('./cash-sync-project-registry.cjs');
function fail(message){throw Object.assign(new Error(message),{code:'CASH_SYNC_PREFLIGHT_BLOCKED'})}
function verifyDestinationMetadata(entry,metadata){
  if(!entry||!metadata||typeof metadata!=='object')fail('Missing destination metadata');
  if(entry.status==='existing-sync-protected'||normalizeProject(entry.project)==='PHU HUNG')
    fail('PHU HUNG is handled by its separate verified sync');
  if(!entry.spreadsheetId||metadata.spreadsheetId!==entry.spreadsheetId)
    fail('Google spreadsheet ID mismatch');
  if(!Array.isArray(metadata.sheets)||metadata.sheets.length<1||metadata.sheets.length>200)
    fail('Missing or invalid Google Sheets tab catalog');
  const tabs=metadata.sheets.map(s=>s?.properties);
  if(tabs.some(p=>!p||!Number.isSafeInteger(p.sheetId)||p.sheetId<0||
    typeof p.title!=='string'||!p.title.trim()))fail('Malformed Google Sheets tab');
  const ids=tabs.map(p=>String(p.sheetId));
  if(new Set(ids).size!==ids.length)fail('Duplicate sheet IDs in Google metadata');
  const gid=entry.gid;
  if(gid===null||gid===undefined)fail('Missing gid: Admin must select a historical tab');
  if(!/^\d+$/.test(String(gid)))fail('Invalid gid');
  const selected=tabs.find(p=>String(p.sheetId)===String(BigInt(gid)));
  if(!selected)fail('Selected gid not found in the destination Google Sheets');
  if(selected.hidden===true)fail('Selected tab is hidden; cannot assume it is source');
  // A named tab is not proof that its contents belong to this project.
  return Object.freeze({
    project:normalizeProject(entry.project),
    spreadsheetId:entry.spreadsheetId,
    selectedGid:String(selected.sheetId),
    selectedTabTitle:selected.title,
    tabCount:tabs.length,
    metadataVerified:true,
    historicalRowsVerified:false,
    closingBalanceVerified:false,
    canWrite:false,
    nextCheck:'read-only historical content and Cash Control balance reconciliation'
  });
}
// Compare only an already-verified source snapshot, never invent an opening balance.
// Accept normalized transaction records with stable IDs and explicit numeric amounts;
// 7 amounts correspond to income + six expense categories.
function auditSourceSnapshot(project,records){
  const name=normalizeProject(project);
  if(!name||name==='PHU HUNG')fail('Wrong or protected project');
  if(!Array.isArray(records)||records.length>20000)fail('Source snapshot invalid or too large');
  const ids=new Set();
  let net=0;
  for(const row of records){
    if(!row||normalizeProject(row.project)!==name||
       typeof row.id!=='string'||!row.id.trim()||ids.has(row.id)||
       typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||
       !Array.isArray(row.amounts)||row.amounts.length!==7||
       row.amounts.some(v=>typeof v!=='number'||!Number.isFinite(v)))
      fail('Invalid, duplicate or cross-project Cash Control transaction');
    const [income,...expenses]=row.amounts;
    if(income<0||expenses.some(n=>n<0))fail('Negative category amount requires manual review');
    ids.add(row.id);
    net+=income-expenses.reduce((s,n)=>s+n,0);
    if(!Number.isSafeInteger(net))fail('Unsafe balance arithmetic');
  }
  return Object.freeze({project:name,recordCount:records.length,netChange:net,
    idsUnique:true,sourceValidated:true,
    historicalRowsVerified:false,closingBalanceVerified:false,canWrite:false});
}
module.exports={verifyDestinationMetadata,auditSourceSnapshot};
