'use strict';
/*
 * Narrow TEST COPY ONLY Google Sheets writer. Code is deliberately not wired
 * into a deployed worker: full authoritative Cash Control projection and live
 * Google service identity access are not verified.
 *
 * Never writes PHU HUNG history or PHU_HUNG_VIEW_TEST. Writes fixed A:S row
 * ranges with RAW inputs in DATA_CASHCONTROL, under a staging-only gate.
 * A project-wide lease and full source proof are REQUIRED at the caller.
 *
 * IMPORTANT: Google Sheets values.batchUpdate has no compare-and-swap.
 * We re-read immediately before each write, fail on conflicts, and verify
 * afterwards. Out-of-band human edits in the tiny gap remain a release risk:
 * lock down TEST mirror editing before enabling automatic financial writes.
 */
const {TEST_ID,validateMetadata}=require('./sheets-inspector.cjs');
const {HEADER,MIRROR,HISTORY,indexMirror}=require('./verified-mirror.cjs');
const {validateRemote}=require('./three-way.cjs');
const ROOT='https://sheets.googleapis.com/v4/spreadsheets/'+TEST_ID;
const SCOPE='https://www.googleapis.com/auth/spreadsheets';
const MAX_BATCH=100;
function allowWrite(env){
  if((env?.GCLOUD_PROJECT||env?.GCP_PROJECT)!=='cash-control-staging'||
    env?.CASH_SHEETS_TEST_WRITE_ENABLED!=='YES'||
    env?.CASH_SHEETS_AUTHORIZED_TEST_ID!==TEST_ID||
    env?.CASH_SHEETS_LIVE_READBACK_VERIFIED!=='YES')
    throw Error('Server Google TEST writes have not been authorized.');
}
function assertTable(raw){
  const indexed=indexMirror(raw);
  // Explicit positions are essential; Sheets API returns empty interior
  // rows, and should never silently reuse a blank row in the mirror.
  if(raw.length!==indexed.count+1)
    throw Error('Sparse TEST mirror rows require manual review.');
  return indexed;
}
function validateOperations(operations,current){
  if(!Array.isArray(operations)||!operations.length||
     operations.length>MAX_BATCH)
    throw Error('Invalid or oversized TEST batch.');
  const ids=new Set();
  let nextRow=current.count+2;
  return operations.map(change=>{
    if(!change||!['append','update'].includes(change.kind)||
       !Array.isArray(change.row)||change.row.length!==HEADER.length)
      throw Error('Only fixed 19-cell append/update is allowed.');
    const row=validateRemote(change.row),id=String(change.id||'');
    if(id!==row.id||ids.has(id))throw Error('Bad or duplicated financial source ID.');
    ids.add(id);
    let index;
    if(change.kind==='update'){
      if(!Number.isSafeInteger(change.sheetRow)||
         change.sheetRow<2||change.sheetRow>10001||
         current.positions.get(id)!==change.sheetRow)
        throw Error('Expected Sheet row ID/position changed.');
      if(typeof change.expectedHash!=='string'||
         current.byId.get(id)?.[17]!==change.expectedHash)
        throw Error('Expected previous source hash changed.');
      index=change.sheetRow;
    }else{
      if(change.sheetRow!=null||current.byId.has(id))
        throw Error('New row unexpectedly exists or has target position.');
      index=nextRow++;
      if(index>10001)throw Error('TEST mirror row limit reached.');
    }
    return {id,row:change.row,index,
      range:"'"+MIRROR+"'!A"+index+':S'+index};
  });
}
function createTestSheetsWriter({request,env}={}){
  if(typeof request!=='function')throw Error('Google service workload request required.');
  // Defensive constructor gate, also enforced per write.
  allowWrite(env);
  const go=async(requestArgs)=>{
    const result=await request({...requestArgs,timeout:15000});
    const value=result?.data??result;
    if(!value||typeof value!=='object')
      throw Error('Invalid Google Sheets service response.');
    return value;
  };
  const metadata=async()=>{
    const m=await go({url:ROOT+'?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId))',method:'GET'});
    validateMetadata(m);
    if(!m.sheets.some(s=>s.properties?.title===MIRROR)||
       !m.sheets.some(s=>s.properties?.title==='PHU_HUNG_VIEW_TEST'))
      throw Error('Missing verified TEST mirror or stable ledger view.');
    return m;
  };
  const read=async(tab,range)=>{
    await metadata();
    if((tab!==MIRROR||range!=='A1:S10001')&&
       (tab!==HISTORY||range!=='A1:N10001'))
      throw Error('Read scope outside verified TEST mirror/history.');
    const uri=encodeURIComponent("'"+tab+"'!"+range);
    const result=await go({url:ROOT+'/values/'+uri+
      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER',
      method:'GET'});
    if(!Array.isArray(result.values)||result.values.length>10001)
      throw Error('Missing TEST sheet data or too many rows.');
    return result.values;
  };
  const readMirror=async tab=>{
    if(tab!==MIRROR)throw Error('Only TEST mirror may be read by writer.');
    return read(MIRROR,'A1:S10001');
  };
  const readHistory=async tab=>{
    if(tab!==HISTORY)throw Error('Historical sheet is strictly read-only.');
    return read(HISTORY,'A1:N10001');
  };
  const writeMirror=async(tab,operations,expectedSignature)=>{
    allowWrite(env);
    if(tab!==MIRROR)throw Error('Writing historical or derived ledger is forbidden.');
    if(typeof expectedSignature!=='string'||!/^[0-9a-f]{64}$/.test(expectedSignature))
      throw Error('Verified mirror preflight signature required.');
    // Revalidate original ledger and signed mirror after caller preflight.
    await metadata();
    const current=assertTable(await readMirror(MIRROR));
    if(current.signature!==expectedSignature)
      throw Error('Google mirror changed since full preflight; no write.');
    const safe=validateOperations(operations,current);
    const payload={valueInputOption:'RAW',data:safe.map(x=>({
      range:x.range,majorDimension:'ROWS',values:[x.row]
    })),includeValuesInResponse:false};
    const result=await go({method:'POST',url:ROOT+'/values:batchUpdate',data:payload});
    if(result.spreadsheetId!==TEST_ID||
       result.responses?.length!==safe.length)
      throw Error('Unverified Google batch response: mandatory read-back.');
    // Check exact physical rows and canonical hashes, not merely HTTP 200.
    const after=assertTable(await readMirror(MIRROR));
    for(const expected of safe){
      if(after.positions.get(expected.id)!==expected.index||
         after.byId.get(expected.id)?.[17]!==expected.row[17])
        throw Error('Google read-back source ID/row/hash mismatch.');
    }
    return {status:'verified',count:safe.length};
  };
  return {metadata,readMirror,readHistory,writeMirror};
}
async function createAdcTestSheetsWriter(env=process.env){
  allowWrite(env);
  const {GoogleAuth}=require('google-auth-library');
  const auth=new GoogleAuth({scopes:[SCOPE]});
  const client=await auth.getClient();
  return createTestSheetsWriter({env,request:options=>client.request(options)});
}
module.exports={SCOPE,ROOT,MAX_BATCH,allowWrite,assertTable,
  validateOperations,createTestSheetsWriter,createAdcTestSheetsWriter};
