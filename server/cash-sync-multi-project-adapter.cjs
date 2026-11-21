'use strict';
/* Google API command builder for the reusable multi-project ledger engine.
 * Pure and fail-closed; never writes or chooses a spreadsheet ID.
 * Only creates/updates machine-owned tabs, NEVER the original history tab.
 */
const {sha,parseValues}=require('./cash-sync-multi-project-core.cjs');
const MIRROR='DATA_CASHCONTROL';
const VIEW='CASHCONTROL_VIEW';
const MIRROR_HEADER=['sourceId','projectKey','month','date','company','contractNo',
 'content','ipc','type','income','subcontract','material','otherDirect',
 'indirect','financial','otherPayable','importTaxVat','sourceHash','syncStatus'];
const VIEW_HEADER=['date','company','contractNo','content','ipc','type','income',
 'subcontract','material','otherDirect','indirect','financial','otherPayable',
 'importTaxVat','balance','origin','sourceId','openingBalance'];
const die=message=>{throw Object.assign(new Error(message),{statusCode:409})};
const cell=value=>{
 if(value===undefined||value===null||value==='')return {};
 if(typeof value==='number'&&Number.isFinite(value))
  return {userEnteredValue:{numberValue:value}};
 if(typeof value==='boolean')return {userEnteredValue:{boolValue:value}};
 if(typeof value==='string')return {userEnteredValue:{stringValue:value}};
 die('Ô Google không hợp lệ.');
};
const grid=row=>({values:row.map(cell)});
function normalizeMirror(plan){
 if(!plan||!Array.isArray(plan.mirrorNext)||!Array.isArray(plan.viewRows))
   die('Chưa có kế hoạch Cash Control đã kiểm tra.');
 return [MIRROR_HEADER,...plan.mirrorNext.map(r=>{
  const month=String(r.values?.[0]||'').slice(0,7);
  const cells=[r.id,r.project,month,...r.values,r.hash,r.status];
  if(cells.length!==19)die('Sai cấu trúc mirror 19 cột.');
  return cells;
 })];
}
function normalizeView(plan){
 const body=plan.viewRows.map((r,i)=>{
  const row=[...r.cells];
  if(row.length!==18)die('Sai cấu trúc sổ tổng hợp 18 cột.');
  const n=i+2;
  const expected=i===0?'=$R$2+G2-SUM(H2:N2)':
    '=O'+(n-1)+'+G'+n+'-SUM(H'+n+':N'+n+')';
  if(r.formula!==expected)die('Công thức số dư chưa được kiểm chứng.');
  row[14]=expected;
  return row;
 });
 return [VIEW_HEADER,...body];
}
// PHU HUNG launched with a 13-value mirror (Q = unused balance,
// not importTaxVat). Accept that exact original schema ONCE under independent
// history/hash checks, then upgrade the machine-owned mirror atomically with
// the visible ledger. No attempt is made to modify the original backup tab.
const PHU_HUNG_OLD_MIRROR_HEADER=[
 ...MIRROR_HEADER.slice(0,16),'balance','sourceHash','syncStatus'
];
function parseStoredMirror(matrix,{project='',history=null}={}){
 if(!Array.isArray(matrix)||!matrix.length)return null;
 const header=JSON.stringify(matrix[0]);
 const modern=header===JSON.stringify(MIRROR_HEADER);
 const old=project==='PHU HUNG'&&
  header===JSON.stringify(PHU_HUNG_OLD_MIRROR_HEADER);
 if(!modern&&!old)die('Tab máy DATA_CASHCONTROL có header khác, không ghi.');
 if(old&&!Array.isArray(history))
   die('PHU HUNG cần lịch sử gốc độc lập để xác minh tab kỹ thuật cũ.');
 const entries=[],boundRows=new Set();
 for(const row of matrix.slice(1)){
  if(!Array.isArray(row)||row.length<19)die('Mirror đã bị xóa ô.');
  const id=String(row[0]??''),identity=String(row[1]??'');
  const status=String(row[18]??''),oldHash=String(row[17]??'');
  if(!old){
   entries.push({id,project:identity,values:row.slice(3,17),
     hash:oldHash,status});
   continue;
  }
  if(identity!=='PHU HUNG'||!id.startsWith('PHU HUNG:')&&
     !id.startsWith('tax:PHU HUNG:'))
   die('PHU HUNG có ID hoặc dự án ngoài phạm vi lịch sử cũ.');
  if(row[16]!==''&&row[16]!==null&&row[16]!==undefined)
   die('Cột balance của mirror PHU HUNG cũ không được có số tiền.');
  const thirteen=parseValues(row.slice(3,16),{foxconn:false}).slice(0,13);
  if(sha(thirteen)!==oldHash)
   die('PHU HUNG mirror cũ có chứng từ hoặc số tiền đã thay đổi hash.');
  let values=[...thirteen,0];
  const linked=/^history:(\d+)$/.exec(status);
  if(linked){
   const position=Number(linked[1]);
   if(boundRows.has(position))die('PHU HUNG trùng vị trí chứng từ lịch sử.');
   boundRows.add(position);
   const original=history[position-1];
   if(!original||!Array.isArray(original))
    die('PHU HUNG mất dòng lịch sử gốc đã gắn ID.');
   const historical=parseValues(original,{history:true,foxconn:false});
   if(historical[0]!==values[0]||
      historical.slice(6,14).some((n,i)=>Math.abs(n-values[i+6])>0.000001))
    die('PHU HUNG lịch sử gốc khác ngày hoặc số tiền đã chứng nhận.');
   // Old mirror labels were Vietnamese while original Google history is
   // Chinese. Canonicalize ONLY the verified history-bound mirror labels.
   values=historical;
  }else if(status!=='synced')
   die('PHU HUNG mirror cũ có trạng thái chứng từ không hợp lệ.');
  entries.push({id,project:identity,values,hash:sha(values),status});
 }
 return entries;
}
function verifyExistingView(matrix,formulas,plan){
 const expected=normalizeView(plan);
 if(!Array.isArray(matrix)||matrix.length!==expected.length||
    !Array.isArray(formulas)||formulas.length!==expected.length)
   die('Tab tổng hợp có số hàng khác trước; không ghi đè chỉnh tay.');
 for(let i=0;i<expected.length;i++){
  const row=matrix[i]||[],w=expected[i];
  for(let j=0;j<w.length;j++){
   if(i>0&&j===14){
    if(!Number.isFinite(Number(row[j]))||
       Math.abs(Number(row[j])-plan.viewRows[i-1].balance)>0.001||
       String(formulas[i]?.[0]??'')!==w[14])
      die('Số dư/công thức Google VIEW bị sửa ngoài hệ thống.');
   }else if(typeof w[j]==='number'){
    if(!Number.isFinite(Number(row[j]))||
       Math.abs(Number(row[j])-w[j])>0.000001)
      die('VIEW có số tiền bị sửa tay.');
   }else if(String(row[j]??'')!==String(w[j]??'')){
    die('VIEW có nội dung không khớp hoặc đã bị sửa tay.');
   }
  }
 }
 return true;
}
function gridRows(rows,balanceIndex=null){
 return rows.map((row,i)=>({values:row.map((value,j)=>
   i>0&&balanceIndex!==null&&j===balanceIndex?
     {userEnteredValue:{formulaValue:value}}:cell(value))}));
}
// Match PHU HUNG's clean green finance style for the existing internal
// CASHCONTROL_VIEW without shifting rows, changing formulas or the original
// historical worksheet. Only DATA_CASHCONTROL remains a hidden machine tab.
// Excel distributed to staff is separately built with ONE sheet only.
function presentationRequests(viewId,rowCount){
 if(!Number.isSafeInteger(viewId)||viewId<0||
    !Number.isSafeInteger(rowCount)||rowCount<1||rowCount>10001)
  die('Không thể định dạng tab tổng hợp không hợp lệ.');
 const green={red:0.88,green:0.94,blue:0.90};
 const pale={red:0.85,green:0.88,blue:0.85};
 const money='#,##0;-#,##0;;@';
 const widths=[115,190,260,390,115,135];
 const requests=[
  {updateSheetProperties:{properties:{sheetId:viewId,
   gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}},
  {repeatCell:{range:{sheetId:viewId,startRowIndex:0,endRowIndex:1,
    startColumnIndex:0,endColumnIndex:18},
   cell:{userEnteredFormat:{backgroundColor:green,
    textFormat:{bold:true,fontFamily:'Arial',fontSize:11},
    horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE',
    wrapStrategy:'WRAP'}},
   fields:'userEnteredFormat'}},
  {repeatCell:{range:{sheetId:viewId,startRowIndex:1,endRowIndex:rowCount,
    startColumnIndex:6,endColumnIndex:15},
   cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:money}}},
   fields:'userEnteredFormat.numberFormat'}},
  {updateDimensionProperties:{range:{sheetId:viewId,dimension:'COLUMNS',
    startIndex:15,endIndex:18},
   properties:{hiddenByUser:true},fields:'hiddenByUser'}},
  {updateDimensionProperties:{range:{sheetId:viewId,dimension:'COLUMNS',
    startIndex:6,endIndex:15},
   properties:{pixelSize:145},fields:'pixelSize'}}
 ];
 for(let i=0;i<widths.length;i++)
  requests.push({updateDimensionProperties:{range:{sheetId:viewId,
   dimension:'COLUMNS',startIndex:i,endIndex:i+1},
   properties:{pixelSize:widths[i]},fields:'pixelSize'}});
 return requests;
}
function compileBatch({plan,metadata,historySheetId,openingBalance=0}){
 if(plan?.status!=='CANDIDATES_ONLY'||plan.canWrite!==false||
    !Array.isArray(plan.viewRows)||!Array.isArray(plan.mirrorNext))
   die('Chưa có kế hoạch hoàn chỉnh, hoặc có khoản cần rà soát.');
 if(!metadata||!Array.isArray(metadata.sheets))die('Thiếu metadata Google.');
 const used=new Set(),byTitle=new Map();
 for(const s of metadata.sheets){
  const p=s?.properties;
  if(!Number.isInteger(p?.sheetId)||used.has(p.sheetId)||!p.title)
    die('Google metadata có tab không hợp lệ.');
  used.add(p.sheetId);byTitle.set(p.title,p);
 }
 if(!Number.isInteger(historySheetId)||!used.has(historySheetId))
  die('Tab lịch sử phải được xác minh bằng gid.');
 const original=metadata.sheets.find(s=>s.properties.sheetId===historySheetId).properties;
 if(original.title===MIRROR||original.title===VIEW)
  die('Không cho phép chọn tab kỹ thuật làm lịch sử.');
 const mirror=byTitle.get(MIRROR),view=byTitle.get(VIEW);
 if(Boolean(mirror)!==Boolean(view))
  die('Trạng thái tab VIEW/MIRROR không nhất quán, không tự sửa.');
 const mirrorMatrix=normalizeMirror(plan),viewMatrix=normalizeView(plan);
 if(mirrorMatrix.length>10001||viewMatrix.length>10001)
  die('Số giao dịch quá giới hạn.');
 let cursor=10000;
 const allocate=()=>{while(used.has(cursor))cursor++;used.add(cursor);return cursor++};
 const mirrorId=mirror?.sheetId??allocate(),viewId=view?.sheetId??allocate();
 if(historySheetId===mirrorId||historySheetId===viewId||mirrorId===viewId)
  die('Tab lịch sử không được phép ghi.');
 const requests=[];
 if(!mirror)requests.push({addSheet:{properties:{sheetId:mirrorId,title:MIRROR,
   hidden:true,gridProperties:{rowCount:Math.max(1000,mirrorMatrix.length+1),columnCount:19}}}});
 if(!view)requests.push({addSheet:{properties:{sheetId:viewId,title:VIEW,
   gridProperties:{rowCount:Math.max(1000,viewMatrix.length+1),columnCount:18}}}});
 // Google spreadsheets.batchUpdate validates all requests and applies them
 // atomically to machine-owned grids. No API append racing against another click.
 requests.push({updateCells:{range:{sheetId:mirrorId,startRowIndex:0,startColumnIndex:0,
   endRowIndex:mirrorMatrix.length,endColumnIndex:19},
   rows:gridRows(mirrorMatrix),fields:'userEnteredValue'}});
 requests.push({updateCells:{range:{sheetId:viewId,startRowIndex:0,startColumnIndex:0,
   endRowIndex:viewMatrix.length,endColumnIndex:18},
   rows:gridRows(viewMatrix,14),fields:'userEnteredValue'}});
 requests.push(...presentationRequests(viewId,viewMatrix.length));
 return {requests,mirrorId,viewId,historySheetId,
   historyPreserved:true,
   expectedMirror:mirrorMatrix,expectedView:viewMatrix,
   fingerprint:sha({history:plan.historyFingerprint,mirror:plan.mirrorFingerprint,
     project:plan.project,month:plan.month,mirrorMatrix,viewMatrix}),
   canWrite:false,approvedWrites:0};
}
module.exports={MIRROR,VIEW,MIRROR_HEADER,VIEW_HEADER,parseStoredMirror,
 normalizeMirror,normalizeView,verifyExistingView,presentationRequests,compileBatch};
