'use strict';
/* Google API command builder for the reusable multi-project ledger engine.
 * Pure and fail-closed; never writes or chooses a spreadsheet ID.
 * Only creates/updates machine-owned tabs, NEVER the original history tab.
 */
const {sha}=require('./cash-sync-multi-project-core.cjs');
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
function parseStoredMirror(matrix){
 if(!Array.isArray(matrix)||!matrix.length)return null;
 if(JSON.stringify(matrix[0])!==JSON.stringify(MIRROR_HEADER))
   die('Tab máy DATA_CASHCONTROL có header khác, không ghi.');
 const entries=[];
 for(const row of matrix.slice(1)){
  if(!Array.isArray(row)||row.length<19)die('Mirror đã bị xóa ô.');
  entries.push({id:String(row[0]??''),project:String(row[1]??''),
   values:row.slice(3,17),hash:String(row[17]??''),status:String(row[18]??'')});
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
       Math.abs(Number(row[j])-plan.viewRows[i-1].balance)>0.000001||
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
 return {requests,mirrorId,viewId,historySheetId,
   historyPreserved:true,
   expectedMirror:mirrorMatrix,expectedView:viewMatrix,
   fingerprint:sha({history:plan.historyFingerprint,mirror:plan.mirrorFingerprint,
     project:plan.project,month:plan.month,mirrorMatrix,viewMatrix}),
   canWrite:false,approvedWrites:0};
}
module.exports={MIRROR,VIEW,MIRROR_HEADER,VIEW_HEADER,parseStoredMirror,
 normalizeMirror,normalizeView,verifyExistingView,compileBatch};
