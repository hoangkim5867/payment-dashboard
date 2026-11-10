'use strict';
// PHU HUNG's proven output is reused for every project. This module prepares
// an exact TEST-only comparison and Google Sheets update plan, never executes it.
// The relay/API must independently authorize every destination before any write.
const crypto=require('node:crypto');
const {prepareProjectView}=require('./cash-sync-multiproject-phu-adapter.cjs');
const {COLUMNS,token,record}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const VIEW_NAME='PROJECT_VIEW';
const MIRROR_NAME='DATA_CASHCONTROL';
const VIEW_HEADER=['date','company','contractNo','content','ipc','type',
  'income','subcontract','material','otherDirect','indirect','financial',
  'otherPayable','balance','origin','sourceId','openingBalance'];
const MIRROR_HEADER=['sourceId','projectKey','month',...COLUMNS,'sourceSignature','syncStatus'];
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function deny(code,message){throw Object.assign(new Error(message),{code})}
function asRows(arr,name){
  if(!Array.isArray(arr)||arr.length>20000)deny('INVALID_SNAPSHOT',name+' không hợp lệ.');
  return arr;
}
function validateMirror(project,rows){
  const byId=new Map();
  for(const row of asRows(rows,'Mirror')){
    if(!row||row.project!==project||typeof row.id!=='string'||!row.id||
       byId.has(row.id)||row.status!=='synced')
      deny('MIRROR_CONFLICT','Mirror có ID trùng, dự án sai hoặc trạng thái thay đổi.');
    const data=record(row);
    if(String(row.signature)!==token(data))
      deny('MIRROR_TAMPERED','Giao dịch đã đồng bộ bị sửa tay hoặc chữ ký không khớp.');
    byId.set(row.id,{id:row.id,project,signature:row.signature});
  }
  return byId;
}
function viewSignature(rows){
  return digest(asRows(rows,'VIEW').map(r=>{
    if(!r||!Array.isArray(r.values)||r.values.length!==17)
      deny('VIEW_CONFLICT','Tab tổng hợp không đúng 17 cột đã nghiệm thu.');
    return r;
  }));
}
function planTestSync({project,history,source,openingBalance=null,
  mirror=[],currentView=[],expectedViewSignature=null,sourceComplete=false,
  destinationConfirmed=false}={}){
  if(sourceComplete!==true)deny('SOURCE_INCOMPLETE',
    'Chưa tải đủ nguồn Payment của dự án. Không lập lệnh ghi.');
  if(destinationConfirmed!==true)deny('DESTINATION_UNCONFIRMED',
    'Chưa kiểm tra file Google Sheets TEST và tab đích.');
  if(typeof project!=='string'||!project.trim())
    deny('INVALID_PROJECT','Thiếu dự án.');
  const old=validateMirror(project,mirror);
  const result=prepareProjectView({project,history,source,openingBalance,
    previousMirror:[...old.values()]});
  if(result.renderer!=='REUSED_PHU_HUNG_BUILD_LEDGER')
    deny('HISTORY_NOT_READY','Dự án mới cần phê duyệt số dư mở đầu riêng.');
  const nextMirror=result.rows.filter(r=>r.origin==='CASH_CONTROL').map(r=>{
    // The PHU HUNG renderer returns positional values, not source objects.
    const row=record(Object.fromEntries(COLUMNS.map((key,i)=>[key,r.values[i]])));
    return {id:r.sourceId,project,month:row.date.slice(0,7),...row,
      signature:token(row),status:'synced'};
  });
  const oldIds=new Set(old.keys());
  const newIds=new Set(nextMirror.map(r=>r.id));
  for(const id of oldIds)if(!newIds.has(id))
    deny('MIRROR_REMOVED','Khoản đã đồng bộ không còn trong nguồn.');
  const newEntries=nextMirror.filter(r=>!oldIds.has(r.id));
  if(currentView.length){
    if(!expectedViewSignature||expectedViewSignature!==viewSignature(currentView))
      deny('VIEW_CONFLICT','Tab VIEW thay đổi từ lần kiểm tra trước.');
    if(currentView.length!==result.rows.length)
      deny('VIEW_REVIEW','Tab VIEW có số hàng khác kế hoạch; không tự xóa hoặc ghi đè.');
    // Only an identical existing tab is safe to mark as already synced.
    const expected=result.grid.map(row=>({values:row.values.map(c=>
      c.userEnteredValue?.formulaValue??c.userEnteredValue?.numberValue??
      c.userEnteredValue?.stringValue??'')}));
    if(digest(currentView)!==digest(expected))
      deny('VIEW_REVIEW','Tab VIEW có khác biệt, cần đọc/đối chiếu cụ thể trước cập nhật.');
  }
  const preview={
    project,viewTab:VIEW_NAME,mirrorTab:MIRROR_NAME,
    existingMirror:old.size,additions:newEntries.length,
    historicCount:result.historicCount,sourceCount:source.length,
    totalRows:result.rows.length,openingBalance:result.openingBalance,
    closingBalance:result.closingBalance,
    beforeFingerprint:digest({project,mirror,currentView}),
    afterFingerprint:digest({view:result.grid,mirror:nextMirror}),
    viewExists:currentView.length>0,
    wouldChange:currentView.length===0||newEntries.length>0,
    canWrite:false,needsExplicitAdminConfirmation:true,
    requiresServerAuthorization:true
  };
  // Plain data, not a Google mutation payload. A future restricted API must
  // recheck destination and snapshot fingerprints before performing writes.
  return Object.freeze({preview,mirrorAdditions:newEntries,
    expectedView:result.grid,mirrorHeader:MIRROR_HEADER,viewHeader:VIEW_HEADER});
}
function verifyAfterWrite(prepared,{mirror=[],view=[]}={}){
  if(!prepared||!prepared.preview)deny('MISSING_PLAN','Không có kế hoạch đã xác nhận.');
  const p=prepared.preview;
  const found=validateMirror(p.project,mirror);
  const required=new Map(prepared.mirrorAdditions.map(r=>[r.id,r.signature]));
  for(const [id,signature] of required)
    if(found.get(id)?.signature!==signature)
      deny('WRITE_NOT_VERIFIED','Google Sheets chưa lưu/khớp nguồn: '+id.slice(0,60));
  // Validate actual calculated balances separately at the Google read stage.
  // A matching output grid alone cannot certify Sheets formula evaluation.
  const rows=asRows(view,'VIEW');
  if(rows.length!==p.totalRows+1)
    deny('VIEW_NOT_VERIFIED','Số dòng Google Sheets sau ghi chưa đúng.');
  return {status:'SNAPSHOT_MATCH_ONLY',project:p.project,
    verifiedMirrorAdditions:required.size,verifiedViewRows:rows.length,
    balancesVerified:false,canWrite:false};
}
module.exports={VIEW_NAME,MIRROR_NAME,VIEW_HEADER,MIRROR_HEADER,
  viewSignature,planTestSync,verifyAfterWrite};
