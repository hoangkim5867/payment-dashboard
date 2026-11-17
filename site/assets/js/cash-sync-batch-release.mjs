/**
 * Single-click cross-project release planning for the already-loaded Cash Control
 * Export Excel month and Google readonly scan. NO network, no Google writes,
 * no implicit source certification, no automatic retry.
 *
 * This is the stage before a signed per-project preview and deliberate batch
 * commit. A project can be NEW_REQUIRES_SOURCE_PROOF without being write-ready.
 */
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const frozen=x=>Object.freeze(x);
const categorical=row=>{
 const financial=row.financialReview===true;
 const duplicate=(row.duplicateSource||0)>0||(row.duplicateHistory||0)>0;
 const mismatch=(row.historyUnmatched||0)>0;
 const dateOrderOnly=row.reviewCategory==='DATE_ORDER_ONLY'&&
   row.dateReview===true&&!financial&&!duplicate&&!mismatch&&
   valid(row.exactMatches)&&valid(row.sourceRows)&&row.exactMatches===row.sourceRows;
 return {financial,duplicate,mismatch,dateOrderOnly};
};
export function buildBatchReleasePlan({month,revision,manifest,scan}={}){
 if(!MONTH.test(month)||month<'2026-10'||!valid(revision)||
   manifest?.month!==month||scan?.month!==month||
   !Array.isArray(manifest.groups)||manifest.groups.length>150||
   !Array.isArray(scan.results)||scan.results.length>35||
   scan.googleWrites!==0||manifest.canWrite!==false||scan.canWrite!==false)
  throw Error('BATCH_INPUT_NOT_ATTESTED');
 const byProject=new Map(),seen=new Set();
 for(const row of manifest.groups){
  if(!row||typeof row.project!=='string'||!row.project.trim()||
    seen.has(row.project)||!valid(row.groupedExcelRows)||
    !Array.isArray(row.records)||row.records.length>10000)
   throw Error('BATCH_MANIFEST_INVALID');
  seen.add(row.project);byProject.set(row.project,row);
 }
 const groups={alreadyComplete:[],historyEqual:[],dateOnly:[],
  needsSourceProof:[],needsReconciliation:[],missingSetup:[]};
 for(const result of scan.results){
  const name=result?.project;
  if(typeof name!=='string'||!byProject.has(name)||
    Object.values(groups).some(a=>a.some(x=>x.project===name)))
   throw Error('BATCH_SCANNED_PROJECT_INVALID');
  const source=byProject.get(name);
  if(source.groupedExcelRows===0)throw Error('BATCH_INACTIVE_PROJECT_SCANNED');
  const flags=categorical(result);
  const validIds=source.records.length===source.groupedExcelRows&&
   source.records.every(r=>r?.project===name&&r.month===month&&
    typeof r.id==='string'&&!/^excel-row:/i.test(r.id)&&
    Array.isArray(r.values)&&r.values.length>=13);
  let category,reason;
  if(month==='2026-10'&&name==='S13-2'){
   category='alreadyComplete';
   reason='Đã ghi 3 giao dịch và đọc lại theo xác nhận Admin; KHÔNG ghi lại.';
  }else if(['GOOGLE_REVIEW_REQUIRED','SOURCE_NOT_READY'].includes(result.result)||
    !source.hasGoogleLink){
   category='missingSetup';
   reason=String(result.reason||'Thiếu liên kết Google hoặc nguồn Payment đã xác minh.');
  }else if(source.state!=='HISTORY_COMPARISON_CANDIDATE'||!validIds||
    source.issues?.length){
   category='needsReconciliation';
   reason='Nguồn Xuất Excel thiếu ID/có vấn đề, chưa được phép ghi.';
  }else if(flags.dateOrderOnly){
   category='dateOnly';
   reason='Tất cả giao dịch trong tháng khớp; chỉ cảnh báo ngày đảo thứ tự trong lịch sử.';
  }else if(result.result==='EXACT_HISTORY_ONLY'&&!flags.financial&&
    !flags.duplicate&&!flags.mismatch&&!result.dateReview&&
    (result.newerCandidates||0)===0){
   category='historyEqual';
   reason='Các giao dịch đã nằm trong sổ lịch sử; không có gì phải ghi.';
  }else if(result.result==='NEWER_THAN_HISTORY_CANDIDATE'&&
    !flags.financial&&!flags.duplicate&&!flags.mismatch&&
    result.dateReview!==true&&valid(result.newerCandidates)&&
    result.newerCandidates>0){
   category='needsSourceProof';
   reason='Đã thấy giao dịch mới. Phải chứng nhận ID Cash Control từ máy chủ, đối chiếu số dư và kiểm tra tab kỹ thuật trước khi ghi.';
  }else{
   category='needsReconciliation';
   reason=flags.financial?'Cần đối chiếu số dư và bố cục lịch sử.':
    flags.duplicate?'Có ứng viên trùng nguồn hoặc Google.':
    flags.mismatch?'Có dòng chỉ một bên; cần kiểm tra ID/số tiền.':
    'Dữ liệu hoặc thứ tự ngày chưa đủ điều kiện đồng bộ.';
  }
  groups[category].push(frozen({
   project:name,month,category,reason,
   sourceCount:source.groupedExcelRows,
   exactMatches:valid(result.exactMatches)?result.exactMatches:null,
   newerCandidates:valid(result.newerCandidates)?result.newerCandidates:null,
   canCommit:false,sourceCertified:false,googleWrites:0
  }));
 }
 const order=['alreadyComplete','historyEqual','dateOnly','needsSourceProof',
  'needsReconciliation','missingSetup'];
 const counts=frozen(Object.fromEntries(order.map(key=>[key,groups[key].length])));
 return frozen({
  schema:'CASH_SYNC_MULTI_RELEASE_PREP_V1',month,revision,
  activeProjects:scan.results.length,
  counts,
  groups:frozen(Object.fromEntries(order.map(key=>[key,frozen(groups[key])]))),
  reviewQueue:groups.needsSourceProof.length+groups.needsReconciliation.length+
   groups.missingSetup.length,
  readyToCommit:0,googleWrites:0,canCommit:false,sourceCertified:false,
  note:'Chuẩn bị trong 1 lượt; không cấp phép ghi dự án chưa được chứng thực nguồn.'
 });
}
/**
 * Workflow core for the future Admin-approved batch action.
 * All confirmations and signed server responses are required. Server endpoints
 * remain the independent authority; this browser helper grants no permission.
 * At most one per-project Google commit at a time. On an uncertain response
 * STOP, never retry (the write might have succeeded).
 */
export async function executeCertifiedBatch({
 items,month,revision,confirm,preview,commit,sessionCurrent
}={}){
 if(!MONTH.test(month)||!valid(revision)||!Array.isArray(items)||
  items.length>35||typeof confirm!=='function'||typeof preview!=='function'||
  typeof commit!=='function'||typeof sessionCurrent!=='function')
  throw Error('BATCH_EXECUTION_INVALID');
 const ids=new Set();
 const selected=items.map(item=>{
  if(!item||item.month!==month||!item.project||ids.has(item.project)||
   item.sourceCertification?.verified!==true||
   item.sourceCertification?.month!==month||
   item.sourceCertification?.project!==item.project||
   item.sourceCertification?.revision!==revision||
   typeof item.sourceCertification?.serverProof!=='string'||
   !/^[a-f0-9]{64}$/.test(item.sourceCertification.serverProof)||
   item.writeConfigured!==true||item.newRows<1||
   !Number.isSafeInteger(item.newRows))
   throw Error('BATCH_ITEM_NOT_CERTIFIED');
  ids.add(item.project);
  return item;
 });
 if(!sessionCurrent())throw Error('BATCH_OWNER_SESSION_CHANGED');
 // Confirm the ENTIRE approved set before ANY Google write.
 const yes=await confirm(frozen(selected.map(x=>frozen({
  project:x.project,month:x.month,newRows:x.newRows
 }))));
 if(!yes)return frozen({status:'cancelled',written:[],skipped:[],googleWrites:0});
 const written=[],skipped=[];
 for(const item of selected){
  if(!sessionCurrent())return frozen({
   status:'stopped_session_changed',written,skipped,requiresReadback:true
  });
  let signed;
  try{
   signed=await preview(item);
   if(!signed||signed.mode!=='preview'||signed.writes!==0||
      signed.writeConfigured!==true||
      !/^[a-f0-9]{64}$/.test(signed.signature||'')||
      signed.summary?.project!==item.project||
      signed.summary?.month!==month||
      signed.summary?.originalUntouched!==true)
    throw Error('BATCH_SIGNED_PREVIEW_INVALID');
  }catch(error){
   return frozen({status:'stopped_preview',project:item.project,
    error:String(error.message||error).slice(0,160),written,skipped,requiresReadback:false});
  }
  if(signed.summary.changes===0){skipped.push(item.project);continue;}
  if(signed.summary.changes!==item.newRows)
   return frozen({status:'stopped_changed_rows',project:item.project,
    written,skipped,requiresReadback:false});
  if(!sessionCurrent())return frozen({
   status:'stopped_session_changed',written,skipped,requiresReadback:false
  });
  // One and only one write; an exception AFTER posting is ambiguous.
  let result;
  try{result=await commit(item,signed.signature);}
  catch(error){
   return frozen({status:'uncertain_never_retry',project:item.project,
    written,skipped,requiresReadback:true,
    error:String(error.message||error).slice(0,160)});
  }
  if(!result||result.mode!=='verified'||result.writes!==1||
    result.summary?.project!==item.project||
    result.summary?.month!==month||result.summary?.originalUntouched!==true||
    result.summary?.changes!==item.newRows){
   return frozen({status:'uncertain_never_retry',project:item.project,
    written,skipped,requiresReadback:true});
  }
  written.push(item.project);
 }
 return frozen({status:'verified',written,skipped,googleWrites:written.length});
}
