/**
 * Shared Cash Control monthly Google sync orchestrator (all projects).
 * ONE Admin batch request, one selected month, one independent server-authorized
 * preview/commit per project. This browser-side module NEVER grants write access:
 * server endpoint must independently verify signed Admin, exact Google destination,
 * fresh source IDs, historical balances and replay fingerprints.
 * No Firestore queries, no background listeners, no automatic retries.
 */
const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;
const IDENT=/^[A-Za-z0-9_-]{20,100}$/;
const validId=id=>typeof id==='string'&&id.trim().length>=3&&
  id.length<=500&&!/^excel-row:/i.test(id.trim());
const safeNum=n=>typeof n==='number'&&Number.isFinite(n);
const text=x=>String(x??'').normalize('NFKC').trim();
const safeCode=x=>typeof x==='string'?x.slice(0,180):'UNKNOWN_ERROR';
const errorCode=e=>safeCode(e?.code||e?.message||'REQUEST_FAILED');
function checkProject(month,item){
 if(!item||typeof item!=='object'||Array.isArray(item))return 'INVALID_PROJECT';
 if(typeof item.project!=='string'||!text(item.project)||item.project.length>180||
    item.month!==month)return 'INVALID_PROJECT_OR_MONTH';
 if(item.activityConfirmed!==true)return 'ACTIVITY_NOT_CONFIRMED';
 if(item.sourceComplete!==true)return 'SOURCE_NOT_VERIFIED';
 if(!IDENT.test(item.spreadsheetId||'')||
    !Number.isSafeInteger(item.historySheetId)||item.historySheetId<0)
   return 'GOOGLE_TARGET_MISSING';
 if(!Array.isArray(item.source)||item.source.length===0||item.source.length>3000)
   return 'SOURCE_ROWS_MISSING';
 if(!safeNum(item.expectedMonthClosing))return 'BALANCE_NOT_VERIFIED';
 if(item.openingBalance!==undefined&&item.openingBalance!==null&&
    !safeNum(item.openingBalance))return 'INVALID_OPENING_BALANCE';
 const ids=new Set();
 for(const r of item.source){
  if(!validId(r?.id)||ids.has(r.id)||r.project!==item.project||
     r.month!==month||!Array.isArray(r.values)||
     ![13,14].includes(r.values.length)||!r.values[0]?.startsWith(month+'-')||
     typeof r.hash!=='string'||!/^[a-f0-9]{64}$/.test(r.hash))
   return 'SOURCE_REVIEW_REQUIRED';
  ids.add(r.id);
 }
 return null;
}
const cleanInput=({month,item,action,signature,corrections=false})=>({
 action,project:item.project,month,revision:item.revision,
 spreadsheetId:item.spreadsheetId,historySheetId:item.historySheetId,
 source:item.source,expectedMonthClosing:item.expectedMonthClosing,
 openingBalance:item.openingBalance??null,
 ...(action==='commit'?{signature,confirm:corrections?'SYNC_CORRECTIONS_THIS_PROJECT':'SYNC_THIS_PROJECT'}:{})
});
const summarize=rows=>Object.freeze({
 projects:rows.length,
 verified:rows.filter(r=>r.status==='VERIFIED').length,
 unchanged:rows.filter(r=>r.status==='UNCHANGED').length,
 ready:rows.filter(r=>r.status==='READY').length,
 skipped:rows.filter(r=>r.status==='SKIPPED').length,
 failed:rows.filter(r=>r.status==='FAILED').length,
 previewOnly:rows.filter(r=>r.status==='PREVIEW_ONLY').length,
 recordedGoogleWriteRequests:rows.filter(r=>r.status==='VERIFIED').length
});
const entry=(project,status,reason,changes=0,closingBalance=null,writeUncertain=false)=>Object.freeze({
 project,status,reason,changes,closingBalance,writeUncertain
});
function verifyReply(response,item){
 const s=response?.summary;
 if(!s||s.project!==item.project||s.month!==item.month||
    !Number.isSafeInteger(s.changes)||s.changes<0||
    !safeNum(s.monthClosingBalance)||
    Math.abs(s.monthClosingBalance-item.expectedMonthClosing)>0.001||
    s.originalUntouched!==true)
   throw Object.assign(Error('SERVER_PREVIEW_MISMATCH'),{code:'SERVER_PREVIEW_MISMATCH'});
 return s;
}
/**
 * @param {Object} opts
 * projects are approved in-memory source snapshots; browser booleans only
 * suppress unsafe work and DO NOT authorize server writes.
 * preview and commit must invoke server-side authenticated Google API.
 * write=true asks for one explicit approval after all projects preview.
 */
export async function runManualMonthlySync({
 month,projects,preview,commit,confirmBatch,checkAdmin,checkRelease,write=false,
 requestSpacingMs=0,onProject
}={}){
 if(!MONTH.test(month)||month<'2026-10'||!Array.isArray(projects)||
    projects.length>150||typeof preview!=='function'||
    typeof checkAdmin!=='function'||
    checkRelease!==undefined&&typeof checkRelease!=='function'||write&&
    (typeof commit!=='function'||typeof confirmBatch!=='function')||
    !Number.isSafeInteger(requestSpacingMs)||requestSpacingMs<0||requestSpacingMs>10000)
   throw Error('INVALID_BATCH_INPUT');
 const rows=[],candidates=[],names=new Set(),reviewedCorrections=new Map();
 // Spread authenticated preflights across the Google Sheets per-user minute
 // quota. Do not add background listeners or retries to ambiguous writes.
 let lastRequestAt=0;
 const paced=async(fn,body)=>{
  if(requestSpacingMs&&lastRequestAt){
   const delay=requestSpacingMs-(Date.now()-lastRequestAt);
   if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
  }
  lastRequestAt=Date.now();
  return fn(body);
 };
 for(const item of projects){
  const name=text(item?.project);
  if(!name||names.has(name))throw Error('DUPLICATE_OR_INVALID_PROJECT');
  names.add(name);
  const why=checkProject(month,item);
  if(why){
   const row=entry(name,'SKIPPED',why);rows.push(row);onProject?.(row);continue;
  }
  // Signed Admin server release report is a strict preflight gate. When
  // explicitly supplied, a closed destination does not even trigger a Sheets
  // preview; dedicated Google read-only comparison remains available separately.
  if(checkRelease&&checkRelease(name)!==true){
   const row=entry(name,'SKIPPED','SERVER_TARGET_NOT_RELEASED');
   rows.push(row);onProject?.(row);continue;
  }
  if(!await checkAdmin()){
   const row=entry(name,'SKIPPED','ADMIN_SESSION_EXPIRED');
   rows.push(row);onProject?.(row);break;
  }
  try{
   const response=await paced(preview,cleanInput({month,item,action:'preview'}));
   const s=verifyReply(response,{...item,month});
   if(!response?.signature||!/^[a-f0-9]{64}$/.test(response.signature))
    throw Error('SERVER_SIGNATURE_MISSING');
   // Corrections are furnished by the authenticated server as explicit
   // old/new payment date and all money columns, never inferred in browser.
   if(!Array.isArray(s.corrections||[])||
      (s.correctedRows||0)!==(s.corrections||[]).length)
     throw Error('SERVER_CORRECTION_PREVIEW_INVALID');
   reviewedCorrections.set(name,JSON.stringify(s.corrections||[]));
   const status=s.changes===0?'UNCHANGED':
     response.writeConfigured===true?'READY':'PREVIEW_ONLY';
   const row=entry(name,status,status==='PREVIEW_ONLY'?'SERVER_WRITE_GATE_CLOSED':'OK',
     s.changes,s.monthClosingBalance);
   rows.push(row);onProject?.(row);
   if(status==='READY')candidates.push(item);
  }catch(e){
   const row=entry(name,'FAILED',errorCode(e));
   rows.push(row);onProject?.(row);
  }
 }
 if(!write||!candidates.length)return Object.freeze({
  month,approved:false,mode:'PREVIEW_ONLY',summary:summarize(rows),rows:Object.freeze(rows)});
 const authorized=await confirmBatch(Object.freeze({
  month,readyProjects:candidates.map(x=>x.project),rows:rows.slice(),
  corrections:candidates.flatMap(x=>JSON.parse(reviewedCorrections.get(x.project)||'[]')
    .map(c=>({project:x.project,id:c.id,before:c.before,after:c.after})))
 }));
 if(authorized!==true)return Object.freeze({
  month,approved:false,mode:'NOT_APPROVED',summary:summarize(rows),rows:Object.freeze(rows)});
 // Every project is independently repreflighted; never reuse stale signatures.
 for(const item of candidates){
  const pos=rows.findIndex(r=>r.project===item.project);
  if(!await checkAdmin()){
   rows[pos]=entry(item.project,'SKIPPED','ADMIN_SESSION_EXPIRED');
   onProject?.(rows[pos]);continue;
  }
  let attemptedCommit=false;
  try{
   const fresh=await paced(preview,cleanInput({month,item,action:'preview'}));
   const proof=verifyReply(fresh,{...item,month});
   if(JSON.stringify(proof.corrections||[])!==
      reviewedCorrections.get(item.project))
     throw Error('CORRECTION_DETAILS_CHANGED_REVIEW_AGAIN');
   if(proof.changes===0){
    rows[pos]=entry(item.project,'UNCHANGED','ALREADY_SYNCED',0,proof.monthClosingBalance);
   }else if(fresh.writeConfigured!==true||
            !/^[a-f0-9]{64}$/.test(fresh.signature||'')){
    rows[pos]=entry(item.project,'SKIPPED','SERVER_WRITE_GATE_CLOSED',
      proof.changes,proof.monthClosingBalance);
   }else{
    // Once a Google write request is issued, an error may be an ambiguous
    // success. Stop the remaining batch and require a fresh Google readback.
    attemptedCommit=true;
    const written=await paced(commit,cleanInput({
     month,item,action:'commit',signature:fresh.signature,
     corrections:(proof.corrections||[]).length>0
    }));
    const w=verifyReply(written,{...item,month});
    if(written.mode==='verified'&&written.writes===1&&
       w.changes===proof.changes)
      rows[pos]=entry(item.project,'VERIFIED','GOOGLE_READBACK_VERIFIED',
        w.changes,w.monthClosingBalance);
    else if(written.mode==='unchanged'&&written.writes===0&&w.changes===0)
      rows[pos]=entry(item.project,'UNCHANGED','ALREADY_SYNCED',0,w.monthClosingBalance);
    else throw Error('WRITE_RESULT_UNCERTAIN_DO_NOT_RETRY');
   }
   onProject?.(rows[pos]);
  }catch(e){
   const writeUncertain=attemptedCommit&&e?.safeBeforeWrite!==true;
   rows[pos]=entry(item.project,'FAILED',errorCode(e),0,null,writeUncertain);
   onProject?.(rows[pos]);
   // Preview-only failures are isolated. After ANY attempted write, a failure
   // is potentially ambiguous; do not continue to other projects or retry.
   if(writeUncertain){
    for(const pending of candidates.slice(candidates.indexOf(item)+1)){
     const next=rows.findIndex(r=>r.project===pending.project);
     if(next>=0&&rows[next].status==='READY'){
      rows[next]=entry(pending.project,'SKIPPED',
       'PREVIOUS_WRITE_UNCERTAIN_REQUIRE_GOOGLE_READBACK');
      onProject?.(rows[next]);
     }
    }
    break;
   }
  }
 }
 return Object.freeze({
  month,approved:true,mode:'BATCH_ATTEMPTED',summary:summarize(rows),
  rows:Object.freeze(rows)
 });
}
