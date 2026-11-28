'use strict';
/* Append-only, human-facing Google ledger compatible with PHU HUNG's form.
 * The original <project>_HISTORY_BACKUP is read-only. DATA_CASHCONTROL is the
 * durable ID index. The visible <project> tab owns the Chinese presentation.
 * All writes are compiled into ONE Sheets batchUpdate after signed source
 * verification by the API. There is no background synchronization.
 */
const {normalizeMirror,MIRROR_HEADER}=require('./cash-sync-multi-project-adapter.cjs');
const {net}=require('./cash-sync-multi-project-core.cjs');
const {presentationValues}=require('./cash-sync-design-fee.cjs');
const die=s=>{throw Object.assign(new Error(s),{statusCode:409})};
const round=n=>Math.round(n*1e6)/1e6;
const num=n=>n===''||n===undefined||n===null?0:Number(n);
const same=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<0.000001;
const sameCalculation=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<0.001;
const valuesOf=cell=>cell?.userEnteredValue?.numberValue??cell?.userEnteredValue?.stringValue;
const cell=v=>v===undefined||v===null||v===''?{}:
  typeof v==='number'?{userEnteredValue:{numberValue:v}}:
  {userEnteredValue:{stringValue:String(v)}};
const cashCell=f=>({userEnteredValue:{formulaValue:f}});
const row=v=>({values:v.map(cell)});
const ledgerTitle=project=>project+'项目现金流明细表';
const ledgerTab=project=>project;
const balanceColumn=foxconn=>foxconn?14:13;
const columns=foxconn=>foxconn?15:14;
const colLetter=foxconn=>foxconn?'O':'N';
// Empty project sheets retain the real opening balance without fabricating a
// payment row. Once a real source ID arrives, humanRows replaces this total.
const emptyTotalFormula=(opening,foxconn=false)=>
  opening===0?'='+colLetter(foxconn)+'4':'='+Number(opening);
function chinese(values,project){
 const v=[...values];
 const company={'Lương Việt Nam':'越籍员工工资',
   'Điều chuyển nội bộ':'内部调剂'};
 if(company[v[1]])v[1]=company[v[1]];
 const type={'Chi phí nhân sự':'职工薪酬','Vật tư':'材料款',
  'Nhân công':'劳务款','Thầu phụ':'分包款','Cho vay':'借出',
  'Nhận điều chuyển':'内部调剂收入','Nhận hoàn vay':'收回借款',
  'Tiền thu chủ đầu tư':'收款','Chi phí gián tiếp':'间接费',
  'Thu tiền':'收款','Thanh toán':'支付'};
 v[5]=type[v[5]]||v[5];
 v[3]=String(v[3]||'')
  .replace(/^Lương Việt Nam · Tháng (\d\d)\/(\d{4})$/,'$2年$1月越籍员工工资')
  .replace(/^Thu tiền · (IPC\d+)/,'内部结算$1')
  .replace(/ hoàn trả /g,'归还')
  .replace(/ điều chuyển sang /g,'调剂转入')
  .replace(/ vay /g,'借款');
 if(project==='FOXCONN')v[3]=v[3].replace('SSIS hoàn trả FOXCONN','SSIS归还FOXCONN借款');
 return v;
}
function rowFormula(i,foxconn,opening){
 const n=i+5,C=colLetter(foxconn),end=foxconn?'N':'M';
 return i===0?(opening===0?'=G5-SUM(H5:'+end+'5)':
  '='+opening+'+G5-SUM(H5:'+end+'5)'):
  '='+C+(n-1)+'+G'+n+'-SUM(H'+n+':'+end+n+')';
}
function totalFormula(j,through){const C=String.fromCharCode(65+j);
 return '=SUM('+C+'5:'+C+through+')'}
function requireHumanMetadata(meta,{project,historySheetId}){
 const original=meta?.sheets?.find(s=>s.properties?.sheetId===historySheetId)?.properties;
 const mirror=meta?.sheets?.find(s=>s.properties?.title==='DATA_CASHCONTROL')?.properties;
 const legacyTitle={'OCEAN LINK':'Ocean Link','H14-3':'H14-3',
   SSIS:'SSIS','红鹤别墅1.1区':'红鹤别墅'}[project];
 const legacy=meta?.sheets?.find(s=>s.properties?.title==='CASHCONTROL_VIEW')?.properties;
 const migrated=!!(legacyTitle&&original?.title===legacyTitle&&
   original.hidden===true&&legacy&&legacy.hidden!==true);
 const visible=migrated?legacy:
   meta?.sheets?.find(s=>s.properties?.title===project)?.properties;
 const goodHistory=original?.title===project+'_HISTORY_BACKUP'||
   (project==='PHU HUNG'&&original?.title==='PHU_HUNG_HISTORY_BACKUP')||
   migrated;
 if(!original||!goodHistory||
    original.hidden!==true||
    !mirror||mirror.hidden!==true||!visible||visible.hidden===true||
    visible.sheetId===historySheetId||visible.sheetId===mirror.sheetId)
  die('Tab dự án không đúng cấu trúc đã phát hành theo mẫu PHU HUNG.');
 return {mirrorId:mirror.sheetId,viewId:visible.sheetId};
}
function verifyHumanView(matrix,formulaRows,plan,{foxconn=false,project}={}){
 if(plan?.status!=='CANDIDATES_ONLY')die('Không có kế hoạch đồng bộ hợp lệ.');
 const c=columns(foxconn),balanceIndex=balanceColumn(foxconn);
 const body=plan.viewRows||[];
 const targetLength=body.length+5;
 if(!Array.isArray(matrix)||matrix.length!==targetLength||
    !Array.isArray(formulaRows)||formulaRows.length<targetLength)
  die('Tab tổng hợp đã bị sửa hoặc có số dòng khác nguồn. Không ghi đè.');
 if(String(matrix[0]?.[0])!==ledgerTitle(project)||
    String(matrix[2]?.[0])!=='日期'||
    String(matrix[2]?.[balanceIndex])!=='余额'||
    String(matrix[targetLength-1]?.[0])!=='合计')
  die('Bố cục sổ Google không phải mẫu PHU HUNG đã xác nhận.');
 const opening=plan.historicalOpening;
 if(!Number.isFinite(opening))die('Thiếu số dư đầu kỳ.');
 let previous=opening;
 for(let i=0;i<body.length;i++){
  const record=body[i],actual=matrix[i+4]||[],v=record.values;
  if(String(actual[0]||'')!==v[0])
   die('Ngày giao dịch ở sổ hiển thị đã thay đổi.');
  // Read-only original backups retain the source classification. For
  // history-bound design fees only, allow their original (legacy) or corrected
  // DISPLAY bucket; the monetary total of each row remains unchanged.
  const shown=record.origin==='HISTORY'?presentationValues(v):v;
  const allowed=[shown];
  if(shown!==v)allowed.push(v);
  if(!allowed.some(candidate=>candidate.slice(6,balanceIndex)
       .every((n,j)=>same(num(actual[j+6]),n))))
   die('Số tiền hoặc phân loại sổ hiển thị lệch tại dòng '+(i+5)+'.');
  previous=round(previous+net(v));
  if(!sameCalculation(num(actual[balanceIndex]),previous))
   die('Số dư ở sổ hiển thị không khớp Cash Control.');
  const expected=rowFormula(i,foxconn,opening);
  const actualFormula=String(formulaRows[i+4]?.[0]||'');
  // PHU HUNG's original February 2026 pilot uses a ZERO opening-balance
  // anchor at Q5. Preserve it as a recognized legacy first-row formula,
  // but ONLY if the independently recomputed balance of every row matches.
  // On the next authorized update the machine regenerates the canonical
  // first-row formula. Other projects/rows cannot use this exception.
  const legacyPilotOpening=project==='PHU HUNG'&&!foxconn&&i===0&&
    opening===0&&actualFormula==='=$Q$5+G5-SUM(H5:M5)';
  if(actualFormula!==expected&&!legacyPilotOpening)
   die('Công thức số dư ở sổ hiển thị đã bị sửa.');
 }
 const total=matrix[targetLength-1]||[];
 if(!sameCalculation(num(total[balanceIndex]),previous)||
    String(formulaRows[targetLength-1]?.[0]||'')!==
       (body.length===0?emptyTotalFormula(opening,foxconn):
         '='+colLetter(foxconn)+(body.length+4)))
  die('Dòng tổng Google không khớp.');
 for(let j=6;j<balanceIndex;j++){
  const sum=round(matrix.slice(4,targetLength-1)
    .reduce((n,r)=>n+num(r[j]),0));
  if(!sameCalculation(num(total[j]),sum))die('Dòng tổng chi phí/thu nhập Google không khớp.');
 }
 return true;
}
function humanRows(plan,previousPlan,previousRows,{project,foxconn=false}={}){
 const body=plan.viewRows,old=previousPlan.viewRows,c=columns(foxconn);
 if(!Array.isArray(previousRows)||previousRows.length!==old.length+5)
  die('Sổ tổng hợp đã bị thay đổi sau kiểm tra.');
 const retained=new Map(old.map((r,i)=>[r.sourceId,previousRows[i+4]]));
 const upper=previousRows.slice(0,4).map(r=>row(Array.from({length:c},(_,i)=>r?.[i]??'')));
 upper[1].values[0]=cell('期间：'+body[0]?.values[0]?.slice(0,7)+
  ' ~ '+body.at(-1)?.values[0]?.slice(0,7));
 const out=[...upper],opening=plan.historicalOpening,balanceIndex=balanceColumn(foxconn);
 for(let i=0;i<body.length;i++){
  const b=body[i],oldRow=retained.get(b.sourceId);
  const fresh=oldRow?Array.from({length:6},(_,j)=>String(oldRow[j]??'')):
   chinese(b.values,project).slice(0,6);
  // A correction keeps the human description but must update the displayed
  // payment date. Amount columns and all subsequent balances are regenerated.
  if((plan.corrections||[]).some(c=>c.id===b.sourceId))fresh[0]=b.values[0];
  const financial=b.origin==='HISTORY'?presentationValues(b.values):b.values;
  const vals=[...fresh,...financial.slice(6,balanceIndex)];
  if(vals.length!==balanceIndex)die('Sai số cột sổ dự án.');
  out.push({values:[...vals.map(cell),cashCell(rowFormula(i,foxconn,opening))]});
 }
 const last=body.length+4;const total=Array.from({length:c},()=>cell());
 total[0]=cell('合计');
 for(let j=6;j<balanceIndex;j++)total[j]=cashCell(totalFormula(j,last));
 total[balanceIndex]=cashCell('='+colLetter(foxconn)+last);
 out.push({values:total});
 if(out.some(r=>r.values.length!==c))die('Sai cấu trúc bảng tổng hợp.');
 return out;
}
function compileHumanBatch({plan,previousPlan,snapshot,historySheetId,foxconn=false}={}){
 const project=plan?.project;
 if(!project||!previousPlan||!snapshot||plan.status!=='CANDIDATES_ONLY')
  die('Thiếu nguồn đã xác nhận để ghi Google.');
 const {mirrorId,viewId}=requireHumanMetadata(snapshot.meta,{project,historySheetId});
 verifyHumanView(snapshot.view,snapshot.formulas,previousPlan,{project,foxconn});
 const mirror=normalizeMirror(plan),visible=humanRows(
  plan,previousPlan,snapshot.view,{project,foxconn});
 const n=visible.length,c=columns(foxconn);
 if(mirror.length>10001||n>10001)die('Số dòng Google vượt giới hạn.');
 // The existing named primary tab is updated; the original backup remains
 // unchanged. Both writes are a single atomic batchUpdate.
 const requests=[
 {updateCells:{range:{sheetId:mirrorId,startRowIndex:0,endRowIndex:mirror.length,
  startColumnIndex:0,endColumnIndex:19},
  rows:mirror.map(row),fields:'userEnteredValue'}},
 {updateCells:{range:{sheetId:viewId,startRowIndex:0,endRowIndex:n,
  startColumnIndex:0,endColumnIndex:c},rows:visible,fields:'userEnteredValue'}},
 {repeatCell:{range:{sheetId:viewId,startRowIndex:4,endRowIndex:n,
  startColumnIndex:6,endColumnIndex:c},
  cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',
    pattern:foxconn?'#,##0;-#,##0;;@':'#,##0;-#,##0;;@'}}},
  fields:'userEnteredFormat.numberFormat'}}
 ];
 // Match the PHU HUNG visual standard on each manual sync; never touch
 // formulas, number formats, data columns, or immutable history.
 const lightBlue={red:0.91764706,green:0.9490196,blue:0.9882353};
 if(n>5)requests.push({repeatCell:{
   range:{sheetId:viewId,startRowIndex:4,endRowIndex:n-1,
     startColumnIndex:0,endColumnIndex:c},
   cell:{userEnteredFormat:{backgroundColor:{red:1,green:1,blue:1},
     textFormat:{fontFamily:'Calibri',fontSize:11,bold:false}}},
   fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.fontFamily,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.bold'
 }});
 requests.push({repeatCell:{
   range:{sheetId:viewId,startRowIndex:n-1,endRowIndex:n,
     startColumnIndex:0,endColumnIndex:c},
   cell:{userEnteredFormat:{backgroundColor:lightBlue,
     textFormat:{fontFamily:'Calibri',fontSize:11,bold:true}}},
   fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.fontFamily,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.bold'
 }});
 // Real thin cell borders, retained in Google Sheets native XLSX downloads.
 // Keep merged title/period/header cells intact; apply the grid to detail and total only.
 const line={style:'SOLID',color:{red:0.80,green:0.83,blue:0.85}};
 requests.push({updateBorders:{range:{sheetId:viewId,startRowIndex:4,endRowIndex:n,
   startColumnIndex:0,endColumnIndex:c},top:line,bottom:line,left:line,right:line,
   innerHorizontal:line,innerVertical:line}});
 return {requests,historySheetId,viewId,mirrorId,human:true,
   fingerprint:require('./cash-sync-multi-project-core.cjs').sha({
     project,month:plan.month,source:plan.mirrorNext.map(r=>r.id),
     original:plan.historyFingerprint,stored:plan.mirrorFingerprint,
     visible:snapshot.view,mirror,ledger:n
   }),canWrite:false,approvedWrites:0};
}
module.exports={requireHumanMetadata,verifyHumanView,compileHumanBatch,
 humanRows,chinese,rowFormula,emptyTotalFormula};
