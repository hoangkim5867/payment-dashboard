'use strict';
// Cash Control -> original PHU HUNG manual activation and updates, Admin only.
// Never accept a spreadsheet ID, sheet ID or a Google Sheets path from client.
const {readConfig,verifyFirebaseAdminToken,TEST_SPREADSHEET_ID}=
  require('../server/cash-sync-guard.cjs');
const {compareOriginalWithTest,auditKnownPayrollCorrection}=
  require('../server/cash-sync-original-audit.cjs');
const core=require('../server/cash-sync-live-core.cjs');
const {HEAD_VIEW,HEAD_MIRROR,HIST_BACKUP,LIVE_TITLE,MIRROR_TITLE,
  correctedHistory,sanitizeSource,prepareNewMirror,buildLedger,verifyView,
  historicalDisplayHeader,viewGrid,mirrorGrid,planSignature,deny}=core;
function err(msg,statusCode=409){throw Object.assign(new Error(msg),{statusCode})}
// Read-only requests can audit the source before production writing is enabled.
// Write actions MUST still pass both independent server-side production gates.
function actionIsPreview(input){
  try{
    const body=typeof input==='string'?JSON.parse(input):input;
    return !!body&&typeof body==='object'&&!Array.isArray(body)&&
      ['activate-preview','sync-preview'].includes(body.action);
  }catch{return false}
}
const googlePrefix='https://sheets.googleapis.com/v4/spreadsheets/';
const gridPath=(tab,range)=>'/values/'+encodeURIComponent("'"+tab+"'!"+range)+
  '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
const formulaPath=(tab)=>'/values/'+encodeURIComponent("'"+tab+"'!N2:N")+
  '?valueRenderOption=FORMULA';
async function getGoogle(authorization,id,path,method='GET',body){
  const res=await fetch(googlePrefix+id+path,{
    method,headers:{Authorization:authorization,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(25000)
  });
  const json=await res.json().catch(()=>({}));
  if(!res.ok)err('Google Sheets '+res.status+': '+
    String(json?.error?.message||'Không thể truy cập file.').slice(0,180),502);
  return json;
}
const sheet=(meta,name)=>meta.sheets?.find(x=>x.properties?.title===name)?.properties;
const distinct=meta=>new Set((meta.sheets||[]).map(x=>x.properties?.sheetId));
function allocateId(used){for(let n=1000;n<2147480000;n++){if(!used.has(n)){used.add(n);return n}}deny('Không tạo được tab');}
function validateMeta(orig,originalId,test){
  if(orig.spreadsheetId!==originalId||
     !Array.isArray(orig.sheets)||orig.sheets.length>100||
     (test&&test.spreadsheetId!==TEST_SPREADSHEET_ID))
    deny('Sai file Google Sheets gốc/TEST.');
}
async function fetchSource(authorization,id,tab,withFormulas=false){
  const requests=[getGoogle(authorization,id,gridPath(tab,withFormulas?'A1:Q':'A1:N'))];
  if(withFormulas)requests.push(getGoogle(authorization,id,formulaPath(tab)));
  const result=await Promise.all(requests);
  return {values:result[0].values||[],formulas:withFormulas?result[1].values||[]:[]};
}
function mirrorFromSheet(snapshot){
  if(!Array.isArray(snapshot)||snapshot.length<1||
     JSON.stringify(snapshot[0])!==JSON.stringify(HEAD_MIRROR))
    deny('Tab DATA_CASHCONTROL thiếu header hoặc đã bị sửa.');
  if(snapshot.length>5001)deny('Tab mirror quá giới hạn.');
  return snapshot.slice(1);
}
function compareOldAndNext(old,entries){
  if(old.length!==entries.length)return true;
  const stored=new Map(old.map(x=>[String(x[0]),x]));
  return entries.some(x=>{
    const before=stored.get(x.id);
    return !before||before[17]!==x.hash||before[18]!==x.status;
  });
}
function fullViewReport(plan){return {
  historic:plan.historicCount,extra:plan.extraCount,rows:plan.rows.length,
  balance:plan.closingBalance
}}
// Compare the complete A:N Google values snapshot, including headings and non-date rows.
// Numeric tolerance and scanRows alone would miss non-transaction changes.
function unchangedHistoricalSnapshot(before,after){
  return Array.isArray(before)&&Array.isArray(after)&&
    JSON.stringify(before)===JSON.stringify(after);
}
function sameApprovedState(before,after,action){
  return !!before&&!!after&&before.active===after.active&&
    before.signature===after.signature&&
    (action!=='sync'||after.changes===true);
}
async function state(authorization,originalId,source,action){
  const [meta,onlyTestMeta]=await Promise.all([
    getGoogle(authorization,originalId,'?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId,hidden,gridProperties(rowCount,columnCount)))'),
    action==='sync-preview'||action==='sync'?
      Promise.resolve(null):
      getGoogle(authorization,TEST_SPREADSHEET_ID,
        '?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId))')
  ]);
  validateMeta(meta,originalId,onlyTestMeta);
  const archived=sheet(meta,HIST_BACKUP),view=sheet(meta,LIVE_TITLE);
  const mirrorSheet=sheet(meta,MIRROR_TITLE);
  const active=Boolean(archived&&view&&mirrorSheet);
  if(!active&&(archived||mirrorSheet))
    deny('Có tab đồng bộ dở dang; dừng để bảo vệ dữ liệu.');
  if(active){
    if(!archived.hidden||!mirrorSheet.hidden||view.hidden)
      deny('Tab lịch sử, dữ liệu kỹ thuật hoặc tab chính bị thay đổi trạng thái.');
    if(action==='activate'||action==='activate-preview')
      return {active:true,alreadyActivated:true};
    if(!view.sheetId&&!Number.isInteger(view.sheetId))deny('Thiếu mã tab chính.');
    const [history,viewData,mirrorData]=await Promise.all([
      fetchSource(authorization,originalId,HIST_BACKUP),
      fetchSource(authorization,originalId,LIVE_TITLE,true),
      getGoogle(authorization,originalId,gridPath(MIRROR_TITLE,'A1:S'))
    ]);
    const historic=correctedHistory(history.values);
    const displayHeader=historicalDisplayHeader(history.values);
    const oldMirror=mirrorFromSheet(mirrorData.values||[]);
    const oldPlan=buildLedger(historic,oldMirror.map(x=>({
      id:String(x[0]),month:String(x[2]),values:x.slice(3,16),
      hash:String(x[17]),status:String(x[18])
    })));
    // Independently validate mirrored hashes and historical binding before trusting
    // existing ledger cells. No write can "repair" a manually changed ledger.
    prepareNewMirror(oldMirror.map(x=>({
      id:String(x[0]),project:'PHU HUNG',month:String(x[2]),
      values:x.slice(3,16),hash:String(x[17])
    })),historic,oldMirror);
    const modernView=verifyView(viewData.values,viewData.formulas,oldPlan,displayHeader)&&
      viewData.values.length===oldPlan.rows.length+2;
    if(!modernView&&!verifyView(viewData.values,viewData.formulas,oldPlan))
      deny('Sổ PHU HUNG hiện tại đã thay đổi ngoài đồng bộ; dừng để tránh ghi đè.');
    const combined=prepareNewMirror(source,historic,oldMirror);
    const plan=buildLedger(historic,combined.newMirror);
    const changes=compareOldAndNext(oldMirror,combined.newMirror)||!modernView;
    return {active:true,meta,archived,view,mirrorSheet,history,displayHeader,oldMirror,
      oldPlan,plan,combined,changes,
      signature:planSignature({original:history.values,view:viewData.values,
        formulas:viewData.formulas,mirror:mirrorData.values,source})};
  }
  if(action==='sync-preview'||action==='sync')
    return {active:false,notYetActivated:true};
  const testHistorySheet=sheet(onlyTestMeta,LIVE_TITLE);
  const testViewSheet=sheet(onlyTestMeta,'PHU_HUNG_VIEW_TEST');
  if(!view||!Number.isInteger(view.sheetId)||!testHistorySheet||
     !testViewSheet||mirrorSheet||archived)
    deny('Bản gốc hoặc bản TEST không đúng trạng thái đã nghiệm thu.');
  if(meta.sheets.some(s=>['PHU_HUNG_VIEW','PHU_HUNG_VIEW_PREP','PHU_HUNG_HISTORY_BACKUP',
     'DATA_CASHCONTROL'].includes(s.properties?.title)))
    deny('Đã có tab đích/ẩn; dừng để tránh đè dữ liệu.');
  const [history,testHistory,testView]=await Promise.all([
    fetchSource(authorization,originalId,LIVE_TITLE),
    fetchSource(authorization,TEST_SPREADSHEET_ID,LIVE_TITLE),
    fetchSource(authorization,TEST_SPREADSHEET_ID,'PHU_HUNG_VIEW_TEST',true)
  ]);
  const strict=compareOriginalWithTest(history.values,testHistory.values);
  const correction=auditKnownPayrollCorrection(history.values,testHistory.values);
  if(!strict.matched&&!correction.approved)
    deny('Chỉ được chuyển đổi khi khớp lịch sử hoặc đúng duy nhất chênh lệch K148 đã xác minh.');
  const historic=correctedHistory(history.values);
  const displayHeader=historicalDisplayHeader(history.values);
  const oct=source.filter(x=>x.month==='2026-10');
  if(oct.length!==30)deny('Không còn đúng 30 giao dịch Cash Control đã nghiệm thu tháng 10.');
  const baseline=prepareNewMirror(oct,historic);
  if(baseline.newMirror.some(x=>x.status==='synced'))
    deny('Chưa khớp tất cả nguồn tháng 10 với lịch sử.');
  const baselinePlan=buildLedger(historic,baseline.newMirror);
  if(baselinePlan.rows.length!==160||
     Math.abs(baselinePlan.closingBalance-13289845382)>0.000001||
     !verifyView(testView.values,testView.formulas,baselinePlan))
    deny('Bản tổng hợp TEST không còn đúng 160 giao dịch, số dư hoặc dữ liệu đã nghiệm thu.');
  const combined=prepareNewMirror(source,historic);
  const plan=buildLedger(historic,combined.newMirror);
  return {active:false,meta,view,history,testHistory,testView,plan,combined,displayHeader,
    exception:correction.approved?correction:null,
    signature:planSignature({original:history.values,
      testHistory:testHistory.values,testView:testView.values,
      testFormulas:testView.formulas,source})};
}
function batchGrid(sheetId,grid,cols,oldRowCount=0){
  const endRowIndex=Math.max(grid.length,oldRowCount,2);
  if(endRowIndex>10001)deny('Tab tổng hợp vượt số dòng an toàn.');
  return {updateCells:{
    range:{sheetId,startRowIndex:0,endRowIndex,startColumnIndex:0,endColumnIndex:cols},
    rows:grid,fields:'userEnteredValue'
  }};
}
function activateRequests(s){
  const used=distinct(s.meta),newViewId=allocateId(used),newMirrorId=allocateId(used);
  const viewGridRows=viewGrid(s.plan,s.displayHeader),mirrorRows=mirrorGrid(s.combined.newMirror);
  const maxView=Math.max(1000,viewGridRows.length+32);
  const maxMirror=Math.max(1000,mirrorRows.length+32);
  return {newViewId,newMirrorId,requests:[
    {addSheet:{properties:{sheetId:newViewId,title:'PHU_HUNG_READY_STAGE',hidden:true,
      gridProperties:{rowCount:maxView,columnCount:17,frozenRowCount:1}}}},
    {addSheet:{properties:{sheetId:newMirrorId,title:MIRROR_TITLE,hidden:true,
      gridProperties:{rowCount:maxMirror,columnCount:19,frozenRowCount:1}}}},
    batchGrid(newViewId,viewGridRows,17),batchGrid(newMirrorId,mirrorRows,19),
    ...(s.displayHeader?[{repeatCell:{range:{sheetId:newViewId,
      startRowIndex:1,endRowIndex:viewGridRows.length,
      startColumnIndex:6,endColumnIndex:13},
      cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',
        pattern:'#,##0.########;-#,##0.########;;@'}}},
      fields:'userEnteredFormat.numberFormat'}},
      {repeatCell:{range:{sheetId:newViewId,
        startRowIndex:viewGridRows.length-1,endRowIndex:viewGridRows.length,
        startColumnIndex:0,endColumnIndex:14},
        cell:{userEnteredFormat:{textFormat:{bold:true},
          backgroundColor:{red:0.92,green:0.95,blue:0.99}}},
        fields:'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor'}}]:[]),
    // The new view becomes visible first, then the existing title is archived
    // without deleting a single historical cell.
    {updateSheetProperties:{properties:{sheetId:newViewId,hidden:false},fields:'hidden'}},
    {updateSheetProperties:{properties:{sheetId:s.view.sheetId,
      title:HIST_BACKUP,hidden:true},fields:'title,hidden'}},
    {updateSheetProperties:{properties:{sheetId:newViewId,title:LIVE_TITLE},fields:'title'}},
    {updateDimensionProperties:{range:{sheetId:newViewId,dimension:'COLUMNS',
      startIndex:14,endIndex:17},properties:{hiddenByUser:true},fields:'hiddenByUser'}},
    {repeatCell:{range:{sheetId:newViewId,startRowIndex:0,endRowIndex:1,
      startColumnIndex:0,endColumnIndex:17},
      cell:{userEnteredFormat:{textFormat:{bold:true},
        backgroundColor:{red:0.91,green:0.94,blue:0.98}}},
      fields:'userEnteredFormat'}}
  ]};
}
function syncRequests(s){
  const newViewRows=viewGrid(s.plan,s.displayHeader),newMirrorRows=mirrorGrid(s.combined.newMirror);
  const requests=[];
  if(newViewRows.length>s.view.gridProperties.rowCount)
    requests.push({updateSheetProperties:{properties:{sheetId:s.view.sheetId,
      gridProperties:{rowCount:newViewRows.length+32}},fields:'gridProperties.rowCount'}});
  if(newMirrorRows.length>s.mirrorSheet.gridProperties.rowCount)
    requests.push({updateSheetProperties:{properties:{sheetId:s.mirrorSheet.sheetId,
      gridProperties:{rowCount:newMirrorRows.length+32}},fields:'gridProperties.rowCount'}});
  requests.push(batchGrid(s.mirrorSheet.sheetId,newMirrorRows,19,s.oldMirror.length+1));
  requests.push(batchGrid(s.view.sheetId,newViewRows,17,s.oldPlan.rows.length+2));
  if(s.displayHeader){
    const totalRowIndex=s.plan.rows.length+1;
    requests.push({repeatCell:{range:{sheetId:s.view.sheetId,
      startRowIndex:1,endRowIndex:totalRowIndex+1,
      startColumnIndex:6,endColumnIndex:13},
      cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',
        pattern:'#,##0.########;-#,##0.########;;@'}}},
      fields:'userEnteredFormat.numberFormat'}});
    requests.push({repeatCell:{range:{sheetId:s.view.sheetId,
      startRowIndex:totalRowIndex,endRowIndex:totalRowIndex+1,
      startColumnIndex:0,endColumnIndex:14},
      cell:{userEnteredFormat:{textFormat:{bold:true},
        backgroundColor:{red:0.92,green:0.95,blue:0.99}}},
      fields:'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor'}});
  }
  return requests;
}
async function run(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'Only POST.'});
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)
    return res.status(403).json({error:'Origin not authorized.'});
  try{
    if(process.env.VERCEL_ENV!=='production')err('Only production Admin.',403);
    const cfg=readConfig(actionIsPreview(req.body)?
      {...process.env,VERCEL_ENV:'preview'}:process.env);
    await verifyFirebaseAdminToken(String(req.headers['x-firebase-id-token']||''),cfg);
    const authorization=String(req.headers.authorization||'');
    if(!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(authorization))
      err('Need Google OAuth.',401);
    const originalId=String(process.env.CASH_SYNC_ORIGINAL_SPREADSHEET_ID||'');
    if(!/^[A-Za-z0-9_-]{30,100}$/.test(originalId)||
       originalId===TEST_SPREADSHEET_ID)err('File gốc chưa cấu hình an toàn.',503);
    let input=req.body;
    if(typeof input==='string')input=JSON.parse(input);
    if(!input||typeof input!=='object'||Array.isArray(input)||
       JSON.stringify(input).length>850000)err('Invalid request.',413);
    const action=String(input.action||'');
    if(!['activate-preview','activate','sync-preview','sync'].includes(action))
      err('Unrecognized action.',400);
    const source=sanitizeSource(input.snapshot);
    const report=await state(authorization,originalId,source,action);
    if(report.alreadyActivated)
      return res.status(200).json({mode:'activated',message:'Already activated. No write.'});
    if(report.notYetActivated)
      return res.status(409).json({error:'Chưa chuyển tab PHU HUNG chính; hãy kích hoạt an toàn trước.'});
    const summary=fullViewReport(report.plan);
    if(action.endsWith('-preview'))
      return res.status(200).json({mode:report.active?'sync':'activate',
        signature:report.signature,summary,changed:report.active?report.changes:true,
        knownException:!report.active&&!!report.exception,readOnly:true});
    if(report.active!==(action==='sync'))
      err('Trạng thái tab chính đã thay đổi sau bước xác nhận.',409);
    if(typeof input.signature!=='string'||input.signature!==report.signature||
       input.confirm!==('CONFIRM_'+action.toUpperCase()))
      err('Kết quả đối chiếu đã thay đổi hoặc chưa xác nhận. Bấm kiểm tra lại.',409);
    if(process.env.CASH_SYNC_ORIGINAL_LIVE_ENABLED!=='YES')
      err('Cổng ghi file gốc chưa bật.',503);
    if(action==='sync'&&!report.changes)
      return res.status(200).json({mode:'unchanged',summary,
        verified:true,message:'Đã khớp, không ghi Google.'});
    // Refresh Google state immediately before writing: stale approval must never
    // overwrite a tab edited after the first preview/authorization read.
    const latest=await state(authorization,originalId,source,action);
    if(!sameApprovedState(report,latest,action))
      err('Dữ liệu Google đã thay đổi trong lúc chuẩn bị ghi. DỪNG; kiểm tra lại trước khi đồng bộ.',409);
    const requests=action==='activate'?activateRequests(latest).requests:syncRequests(latest);
    await getGoogle(authorization,originalId,':batchUpdate','POST',{requests});
    // Verify final persisted state by reading the authoritative Google Sheet,
    // no extra Firestore work or background listener.
    const meta=await getGoogle(authorization,originalId,
      '?fields=spreadsheetId,sheets(properties(title,sheetId,hidden))');
    if(!sheet(meta,HIST_BACKUP)?.hidden||sheet(meta,LIVE_TITLE)?.hidden||
       !sheet(meta,MIRROR_TITLE)?.hidden)
      err('Đã ghi, nhưng trạng thái tab chưa khớp. Không bấm lại.',502);
    const [viewBack,mirrorBack,historyBack]=await Promise.all([
      fetchSource(authorization,originalId,LIVE_TITLE,true),
      getGoogle(authorization,originalId,gridPath(MIRROR_TITLE,'A1:S')),
      fetchSource(authorization,originalId,HIST_BACKUP)
    ]);
    // Audit the immutable historical ledger after Google applies the batch.
    // Never declare success solely from the new calculated view/mirror.
    if(!unchangedHistoricalSnapshot(report.history.values,historyBack.values))
      err('Đã ghi nhưng bản chụp toàn bộ A:N của lịch sử PHU HUNG đã thay đổi. DỪNG; kiểm tra sao lưu trước khi tiếp tục.',502);
    const afterMirror=mirrorBack.values||[];
    const expected=report.combined.newMirror;
    let mirrorVerified=afterMirror.length===expected.length+1 &&
      JSON.stringify(afterMirror[0])===JSON.stringify(HEAD_MIRROR);
    if(mirrorVerified){
      for(let i=0;i<expected.length;i++){
        const actual=afterMirror[i+1]||[],item=expected[i];
        if(String(actual[0])!==item.id||String(actual[1])!=='PHU HUNG'||
           String(actual[2])!==item.month||String(actual[17])!==item.hash||
           String(actual[18])!==item.status){mirrorVerified=false;break}
        for(let j=0;j<13;j++){
          const a=actual[3+j],b=item.values[j];
          if(j<6?String(a??'')!==String(b):!Number.isFinite(Number(a))||
             Math.abs(Number(a)-b)>0.000001){mirrorVerified=false;break}
        }
        if(!mirrorVerified)break;
      }
    }
    if(!verifyView(viewBack.values,viewBack.formulas,report.plan,report.displayHeader)||!mirrorVerified){
      err('Tab đã cập nhật nhưng cần đọc lại/xác minh mirror trước khi đồng bộ tiếp.',502);
    }
    return res.status(200).json({mode:action==='activate'?'activated':'synced',
      summary,verified:true,message:'Đã ghi và đối chiếu lại Google Sheets gốc.'});
  }catch(error){
    const code=[400,401,403,409,413,502,503].includes(error?.statusCode)?
      error.statusCode:500;
    return res.status(code).json({error:code===500?
      'Lỗi bảo vệ đồng bộ. Không thử lại liên tục; kiểm tra trạng thái tab Google trước.':
      String(error.message).slice(0,220)});
  }
}
module.exports=run;
module.exports._internals={activateRequests,syncRequests,batchGrid,unchangedHistoricalSnapshot,actionIsPreview,sameApprovedState};
