'use strict';
/* Server-side destination allowlist for Cash Control multi-project sync.
 * No browser-supplied spreadsheet ID may authorize a production write.
 * A missing or malformed allowlist always disables writes; read-only preview
 * remains possible with an explicitly chosen Google link.
 */
const normalize=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
function parseAllowlist(raw){
  if(raw===undefined||raw===null||raw==='')return new Map();
  if(typeof raw!=='string'||raw.length>16000)throw Error('Invalid sync target configuration');
  let obj;
  try{obj=JSON.parse(raw)}catch{throw Error('Invalid sync target configuration')}
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length>150)
    throw Error('Invalid sync target configuration');
  const allowed=new Map(),ids=new Set();
  for(const [project,entry] of Object.entries(obj)){
    const key=normalize(project),id=entry?.spreadsheetId,gid=entry?.historySheetId;
    if(!key||key.length>180||allowed.has(key)||
       !entry||typeof entry!=='object'||Array.isArray(entry)||
       Object.keys(entry).sort().join(',')!=='historySheetId,spreadsheetId'||
       typeof id!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(id)||
       !Number.isSafeInteger(gid)||gid<0||ids.has(id))
      throw Error('Invalid sync target configuration');
    ids.add(id);allowed.set(key,Object.freeze({spreadsheetId:id,historySheetId:gid}));
  }
  return allowed;
}
function isAllowlisted(env,project,spreadsheetId,historySheetId){
  const list=parseAllowlist(env.CASH_SYNC_MULTI_ALLOWED_TARGETS);
  const target=list.get(normalize(project));
  return !!target&&target.spreadsheetId===spreadsheetId&&
    target.historySheetId===historySheetId;
}
function canWriteTarget(env,project,spreadsheetId,historySheetId){
  // This endpoint's write flag is production-only. A Preview deployment
  // cannot inherit authorization from a branch env, even if someone sets
  // the flag and a matching allowlist by mistake. TEST writes must use a
  // separate server-side test-only route with a trusted staging source.
  return env.VERCEL_ENV==='production'&&
    env.CASH_SYNC_FIREBASE_PROJECT_ID==='cscecmep-payment'&&
    env.CASH_SYNC_MULTI_PRODUCTION_WRITES==='YES'&&
    isAllowlisted(env,project,spreadsheetId,historySheetId);
}
function currentVietnamMonth(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'
 }).formatToParts(now);
 const year=parts.find(x=>x.type==='year')?.value;
 const month=parts.find(x=>x.type==='month')?.value;
 return year+'-'+month;
}
function canWriteMonthlyTarget(env,project,spreadsheetId,historySheetId,month){
 // Rolling Admin-approved releases from Oct 2026 onward: new calendar months
 // no longer require another Vercel deployment or environment flag change.
 // Existing exact-month approval is supported until rolling mode is enabled.
 const valid=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
 if(!valid.test(month||'')||!canWriteTarget(env,project,spreadsheetId,historySheetId))
  return false;
 const from=env.CASH_SYNC_MULTI_APPROVED_FROM_MONTH;
 if(from!==undefined&&from!==''){
  return valid.test(from)&&from>='2026-10'&&month>=from&&
   month<=currentVietnamMonth();
 }
 return env.CASH_SYNC_MULTI_APPROVED_MONTH===month;
}
module.exports={parseAllowlist,isAllowlisted,canWriteTarget,canWriteMonthlyTarget};
