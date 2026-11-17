/**
 * One-click Cash Control monthly-readonly audit → operator action queue.
 * This is classification of EXISTING signed-in Admin scan results, not another
 * Google or Firestore fetch, nor source-identity certification.
 *
 * A previously confirmed S13-2 October one-time write remains explicitly
 * excluded from new-write suggestions. Never deduce this from a Google
 * historical sheet alone: the 3 records live in separate machine-owned tabs.
 */
const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
const KNOWN_STATES=new Set([
 'EXACT_HISTORY_ONLY','NEWER_THAN_HISTORY_CANDIDATE','REVIEW_REQUIRED',
 'SOURCE_NOT_READY','GOOGLE_REVIEW_REQUIRED'
]);
const doneS13=(month,project)=>month==='2026-10'&&project==='S13-2';
const bounded=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const readonly=Object.freeze({canWrite:false,sourceComplete:false,googleWrites:0});
export function classifyMonthlyAudit({month,results}={}){
 if(!MONTH.test(month)||!Array.isArray(results)||results.length>35)
   throw Error('INVALID_BATCH_DECISION_SCOPE');
 const names=new Set(),groups={
  completed:[],noDifference:[],newCandidateReview:[],historyReview:[],needsSetup:[]
 };
 for(const row of results){
  const project=String(row?.project||'').normalize('NFKC').trim();
  if(!project||project.length>180||names.has(project)||!KNOWN_STATES.has(row?.result))
   throw Error('INVALID_BATCH_DECISION_PROJECT');
  names.add(project);
  const flags=Boolean(row.financialReview||row.dateReview||
    (bounded(row.historyUnmatched)||0)>0||
    (bounded(row.duplicateSource)||0)>0||
    (bounded(row.duplicateHistory)||0)>0);
  let stage,reason;
  if(doneS13(month,project)){
   stage='completed';
   reason='Đã ghi và đọc lại 3 khoản theo xác nhận Admin; không ghi lại. '+(
    flags?'Cảnh báo sổ gốc vẫn cần xem riêng, không hủy kết quả ghi kỹ thuật.':
    'Các khoản kỹ thuật không được tính như giao dịch mới chỉ vì chưa có trong sổ gốc.');
  }else if(['SOURCE_NOT_READY','GOOGLE_REVIEW_REQUIRED'].includes(row.result)){
   stage='needsSetup';
   reason=row.reason==='GOOGLE_LINK_MISSING'?'Chưa có link Google gốc hợp lệ.':
    row.result==='SOURCE_NOT_READY'?'Nguồn hoặc số dư chưa đủ để đối chiếu Google.':
    'Google gốc chưa đọc hoặc chưa nhận dạng được.';
  }else if(row.result==='EXACT_HISTORY_ONLY'&&!flags&&
   (bounded(row.newerCandidates)||0)===0){
   stage='noDifference';
   reason='Khớp bản chiếu lịch sử; không có ứng viên mới trong phạm vi đã đọc. Chưa chứng nhận toàn bộ Payment.';
  }else if(row.result==='NEWER_THAN_HISTORY_CANDIDATE'&&!flags){
   stage='newCandidateReview';
   reason='Có ứng viên mới, nhưng chưa xác minh ID nguồn/nhật ký kỹ thuật và chưa cho phép ghi.';
  }else{
   stage='historyReview';
   reason='Có chênh lệch lịch sử, thứ tự ngày, định danh hoặc số dư; giữ chế độ chỉ đọc.';
  }
  groups[stage].push(Object.freeze({
   project,stage,reason,originalStatus:row.result,
   exactMatches:bounded(row.exactMatches),
   newerCandidates:bounded(row.newerCandidates),
   historyUnmatched:bounded(row.historyUnmatched),
   financialReview:row.financialReview===true,
   dateReview:row.dateReview===true,
   ...readonly
  }));
 }
 const ordered=['completed','noDifference','newCandidateReview',
  'historyReview','needsSetup'];
 const counts=Object.freeze(Object.fromEntries(ordered.map(k=>[k,groups[k].length])));
 return Object.freeze({
  schema:'CASH_SYNC_BATCH_ACTION_QUEUE_V1',month,
  projects:results.length,counts,
  groups:Object.freeze(Object.fromEntries(ordered.map(k=>[k,Object.freeze(groups[k])]))),
  selectedProjects:0,writeReadyProjects:0,
  ...readonly,
  note:'Đã nhóm kết quả đối chiếu trong một lần đọc; không tự chứng nhận Payment, không đồng bộ hoặc cấp phép ghi.'
 });
}
