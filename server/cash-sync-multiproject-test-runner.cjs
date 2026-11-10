'use strict';
// Transactional orchestrator reusing PHU HUNG's tested ledger/view format.
// Injected adapter only: no credentials, HTTP calls, Firebase reads or writes
// in this module. The adapter MUST independently enforce a TEST file allowlist.
// A production writer is intentionally not wired up by this module.
const {verifyAfterWrite,viewSignature}=require('./cash-sync-multiproject-write-plan.cjs');
function abort(code,message){
  const error=new Error(message);error.code=code;throw error;
}
function snapshotSignature(snapshot){
  const v=snapshot||{};
  return JSON.stringify({
    mirror:v.mirror||[],view:v.view||[],formulas:v.formulas||[],
    spreadsheetId:v.spreadsheetId||'',project:v.project||'',
    viewTab:v.viewTab||'',mirrorTab:v.mirrorTab||''
  });
}
async function runTestOnlySync({prepared,adapter,explicitAdminConsent=false,
  expectedTestSpreadsheetId}={}){
  if(!prepared?.preview||!Array.isArray(prepared.expectedView))
    abort('MISSING_PLAN','Chưa có kế hoạch PHU HUNG đã đối chiếu.');
  const p=prepared.preview;
  if(p.canWrite!==false||p.requiresServerAuthorization!==true||
     p.needsExplicitAdminConfirmation!==true)
    abort('UNSAFE_PLAN','Kế hoạch không đúng cấu trúc an toàn TEST.');
  if(!explicitAdminConsent)
    abort('NO_CONSENT','Admin chưa xác nhận ghi TEST.');
  if(typeof expectedTestSpreadsheetId!=='string'||
     !/^[-\w]{20,}$/.test(expectedTestSpreadsheetId))
    abort('NO_TEST_ALLOWLIST','Chưa chỉ định file TEST trong cấu hình tin cậy.');
  if(!adapter||!['checkAuthority','readSnapshot','writeMirrorAdditions',
    'writeView','readAfterWrite'].every(name=>typeof adapter[name]==='function'))
    abort('MISSING_ADAPTER','Thiếu bộ kết nối Google Sheets TEST đã bảo vệ.');
  const approved=await adapter.checkAuthority({
    project:p.project,spreadsheetId:expectedTestSpreadsheetId,
    viewTab:p.viewTab,mirrorTab:p.mirrorTab
  });
  if(!approved||approved.adminVerified!==true||approved.testOnly!==true||
     approved.spreadsheetId!==expectedTestSpreadsheetId)
    abort('AUTH_FAILED','Chỉ Admin và file TEST đã xác thực được phép ghi.');
  const before=await adapter.readSnapshot();
  if(!before||before.spreadsheetId!==expectedTestSpreadsheetId||
     before.project!==p.project||before.viewTab!==p.viewTab||
     before.mirrorTab!==p.mirrorTab)
    abort('TARGET_CHANGED','File/tab hoặc dự án không còn đúng cấu hình TEST.');
  // A fresh comparison is required after the user's confirmation.
  if(typeof adapter.recompare!=='function')
    abort('RECOMPARE_REQUIRED','Không có bước tính lại từ nguồn Payment và đích.');
  const fresh=await adapter.recompare();
  if(fresh?.preview?.beforeFingerprint!==p.beforeFingerprint||
     fresh.preview.afterFingerprint!==p.afterFingerprint||
     fresh.preview.sourceCount!==p.sourceCount||
     fresh.preview.totalRows!==p.totalRows)
    abort('STALE_PLAN','Nguồn hoặc đích thay đổi sau khi Admin xác nhận.');
  if(p.viewExists){
    if(!Array.isArray(before.view)||before.view.length<2||
       !before.view.every(row=>Array.isArray(row.values)&&row.values.length===17))
      abort('VIEW_CHANGED','Tab tổng hợp TEST không đủ cấu trúc.');
    // View is immutable except as a regenerated, separately verified ledger.
    if(viewSignature(before.view)!==fresh.preview.originalViewSignature)
      abort('VIEW_CHANGED','Tab tổng hợp TEST thay đổi trước khi ghi.');
  }else if((before.view||[]).length)
    abort('VIEW_CREATED','Tab tổng hợp đã được tạo bởi người khác; so sánh lại.');
  if((before.mirror||[]).length!==p.existingMirror)
    abort('MIRROR_CHANGED','Tab mirror có số dòng khác kế hoạch.');
  // No attempts to silently edit manual entries or delete old mirror rows.
  // The mirror stage is append-only; a repeat will be checked by recompare.
  if(p.additions)await adapter.writeMirrorAdditions(prepared.mirrorAdditions);
  // The single stable VIEW is derived from immutable history + mirror.
  // Write it once. A failure requires a fresh compare; NEVER auto-retry.
  await adapter.writeView(prepared.expectedView);
  const after=await adapter.readAfterWrite();
  if(after?.spreadsheetId!==expectedTestSpreadsheetId||
     after.project!==p.project)
    abort('TARGET_CHANGED','Google Sheets trả về file khác; không xác nhận hoàn tất.');
  const verified=verifyAfterWrite(prepared,after);
  return {...verified,mode:'TEST_ONLY',writesConfirmed:true};
}
module.exports={runTestOnlySync,snapshotSignature};
