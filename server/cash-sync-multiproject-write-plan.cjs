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
// The 19-column PHU HUNG mirror reserves column Q for calculated balance;
 // generated TEST mirror leaves Q blank and stores signature/status in R/S.
const MIRROR_HEADER=['sourceId','projectKey','month',...COLUMNS,'balance','sourceSignature','syncStatus'];
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
function sourceSnapshotFingerprint({project,mirror=[],currentView=[]}){
  return digest({project,mirror,currentView});
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
  // Reconstruct the CURRENT view solely from immutable historical rows and
  // previously-synced mirror IDs. A legitimate new source changes the desired
  // view, but must never make an edited existing view appear trustworthy.
  let originalViewSignature=null;
  if(currentView.length){
    const oldSource=mirror.map(row=>({...row,id:row.id,project}));
    const prior=prepareProjectView({project,history,source:oldSource,openingBalance});
    if(prior.renderer!=='REUSED_PHU_HUNG_BUILD_LEDGER')
      deny('VIEW_REVIEW','Chưa xác minh được bản tổng hợp đã có.');
    const originalGrid=prior.grid.map(row=>({values:row.values.map(c=>
      c.userEnteredValue?.formulaValue??c.userEnteredValue?.numberValue??
      c.userEnteredValue?.stringValue??'')}));
    originalViewSignature=viewSignature(currentView);
    if(!expectedViewSignature||expectedViewSignature!==originalViewSignature)
      deny('VIEW_CONFLICT','Tab VIEW thay đổi từ lần kiểm tra trước.');
    if(currentView.length!==originalGrid.length||
       digest(currentView)!==digest(originalGrid))
      deny('VIEW_REVIEW','Tab VIEW khác sổ cũ được xác minh; không ghi đè chỉnh sửa tay.');
  }
  const preview={
    project,viewTab:VIEW_NAME,mirrorTab:MIRROR_NAME,
    existingMirror:old.size,additions:newEntries.length,
    historicCount:result.historicCount,sourceCount:source.length,
    totalRows:result.rows.length,openingBalance:result.openingBalance,
    closingBalance:result.closingBalance,
    beforeFingerprint:sourceSnapshotFingerprint({project,mirror,currentView}),
    afterFingerprint:digest({view:result.grid,mirror:nextMirror}),
    viewExists:currentView.length>0,
    originalViewSignature,
    wouldChange:currentView.length===0||newEntries.length>0,
    canWrite:false,needsExplicitAdminConfirmation:true,
    requiresServerAuthorization:true
  };
  // Plain data, not a Google mutation payload. A future restricted API must
  // recheck destination and snapshot fingerprints before performing writes.
  return Object.freeze({preview,mirrorAdditions:newEntries,
    expectedView:result.grid,expectedBalances:result.rows.map(row=>row.balance),
    mirrorHeader:MIRROR_HEADER,viewHeader:VIEW_HEADER});
}
// Google API readback must supply separately read UNFORMATTED_VALUE cells
// and FORMULA cells. Google calculated N is not derivable from formula text.
function verifyAfterWrite(prepared,{mirror=[],view=[],formulas=[]}={}){
  if(!prepared||!prepared.preview)deny('MISSING_PLAN','Không có kế hoạch đã xác nhận.');
  const p=prepared.preview;
  const found=validateMirror(p.project,mirror);
  const required=new Map(prepared.mirrorAdditions.map(r=>[r.id,r.signature]));
  for(const [id,signature] of required)
    if(found.get(id)?.signature!==signature)
      deny('WRITE_NOT_VERIFIED','Google Sheets chưa lưu/khớp nguồn: '+id.slice(0,60));
  const rows=asRows(view,'VIEW');
  const formulaRows=asRows(formulas,'VIEW formulas');
  const expected=prepared.expectedView;
  if(!Array.isArray(expected)||rows.length!==expected.length||
     formulaRows.length!==expected.length-1)
    deny('VIEW_NOT_VERIFIED','Thiếu dòng hoặc thiếu công thức Google Sheets sau ghi.');
  // The metadata/header must be exact; no unexpected transaction/ID can hide
  // behind a matching row count or a coincidentally matching closing balance.
  for(let i=0;i<rows.length;i++){
    const actual=rows[i]?.values;
    const cells=expected[i]?.values;
    if(!Array.isArray(actual)||!Array.isArray(cells)||actual.length>17)
      deny('VIEW_NOT_VERIFIED','Bố cục tab VIEW bị thay đổi tại hàng '+(i+1)+'.');
    for(let j=0;j<17;j++){
      const expectedCell=cells[j]?.userEnteredValue||{};
      const expectedFormula=expectedCell.formulaValue;
      const raw=actual[j]??'';
      if(i>0&&j===13){
        if(!Number.isFinite(raw))
          deny('BALANCE_NOT_VERIFIED','Số dư N chưa được Google tính tại hàng '+(i+1)+'.');
        const expectedBalance=Number(prepared.expectedBalances?.[i-1]);
        if(!Number.isFinite(expectedBalance)||Math.abs(raw-expectedBalance)>0.000001)
          deny('BALANCE_NOT_VERIFIED','Số dư N của Google không đúng tại hàng '+(i+1)+'.');
        if(String(formulaRows[i-1]?.[0]??'').replace(/\\s+/g,'')!==String(expectedFormula).replace(/\\s+/g,''))
          deny('FORMULA_NOT_VERIFIED','Công thức số dư N bị sửa tại hàng '+(i+1)+'.');
        continue;
      }
      if(expectedFormula!==undefined){
        // No formula in any other column is allowed by this view schema.
        deny('VIEW_NOT_VERIFIED','Công thức không đúng vị trí.');
      }
      const expectedValue=expectedCell.numberValue??expectedCell.stringValue??
        expectedCell.boolValue??'';
      if(typeof expectedValue==='number'){
        if(typeof raw!=='number'||!Number.isFinite(raw)||
           Math.abs(raw-expectedValue)>0.000001)
          deny('VIEW_NOT_VERIFIED','Giá trị tiền thay đổi tại hàng '+(i+1)+', cột '+(j+1)+'.');
      }else if(String(raw)!==String(expectedValue)){
        deny('VIEW_NOT_VERIFIED','Nội dung/ID thay đổi tại hàng '+(i+1)+', cột '+(j+1)+'.');
      }
    }
  }
  if(expected.length<2)deny('BALANCE_NOT_VERIFIED','Chưa có giao dịch để xác nhận số dư cuối.');
  const last=rows.at(-1).values;
  if(Math.abs(Number(last[13])-p.closingBalance)>0.000001)
    deny('BALANCE_NOT_VERIFIED','Số dư cuối trên Google Sheets không khớp.');
  return {status:'FULL_READBACK_VERIFIED',project:p.project,
    verifiedMirrorAdditions:required.size,verifiedViewRows:rows.length,
    closingBalance:Number(last[13]),balancesVerified:true,canWrite:false};
}
module.exports={VIEW_NAME,MIRROR_NAME,VIEW_HEADER,MIRROR_HEADER,
  viewSignature,sourceSnapshotFingerprint,planTestSync,verifyAfterWrite};
