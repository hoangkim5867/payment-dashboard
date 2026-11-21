/**
 * PHU HUNG-aligned, ONE-sheet-only Excel export of a previously verified
 * Google Cash Control VIEW. No Google writes, no Firebase reads, no hidden
 * source tabs/IDs, no formulas or spreadsheet links in the distributed file.
 *
 * IMPORTANT: Sharing the ORIGINAL Google workbook is NOT safe merely because
 * its technical tabs are hidden. Distribute ONLY this generated XLSX (or a
 * separately created one-sheet public workbook).
 */
const HEADER=['date','company','contractNo','content','ipc','type','income',
 'subcontract','material','otherDirect','indirect','financial','otherPayable',
 'importTaxVat','balance'];
const EXPENSE=['分包款','材料款','其他直接费用','间接费','财务费用','其他应付款'];
const TAX='进口税+增值税';
const RND=v=>Math.round(v*1e6)/1e6;
const fail=code=>{throw Error(code)};
const validDate=d=>typeof d==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01])$/.test(d)&&
 (()=>{const [y,m,n]=d.split('-').map(Number),v=new Date(Date.UTC(y,m-1,n));return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===n})();
const number=(v)=>v===''||v===null||v===undefined?0:
 typeof v==='number'&&Number.isFinite(v)?v:NaN;
const safeText=(v)=>v===null||v===undefined?'':typeof v==='string'?
 v.slice(0,3000):fail('INVALID_VIEW_TEXT');
const isBlank=r=>!Array.isArray(r)||r.every(v=>v===''||v===null||v===undefined);
const color=(rgb)=>({rgb});
function parseTechnical(matrix,project){
 if(!Array.isArray(matrix)||matrix.length<2||matrix.length>10010||
    !Array.isArray(matrix[0])||
    HEADER.some((k,i)=>String(matrix[0][i]||'')!==k))
  fail('MAIN_VIEW_HEADER_UNVERIFIED');
 const foxconn=project==='FOXCONN',moneyCount=foxconn?8:7;
 const entries=[];
 let previousBalance=null,opening=null;
 for(const row of matrix.slice(1)){
  if(isBlank(row))continue;
  if(!Array.isArray(row)||row.length>15||!validDate(row[0]))
   fail('MAIN_VIEW_UNEXPECTED_DATA');
  const texts=row.slice(1,6).map(safeText);
  const sums=Array.from({length:8},(_,i)=>number(row[i+6]));
  if(sums.some(v=>!Number.isFinite(v))||(!foxconn&&sums[7]!==0)||
     !Number.isFinite(Number(row[14]))||
     row[14]===null||row[14]===undefined||row[14]==='')
   fail('MAIN_VIEW_AMOUNT_UNVERIFIED');
  const balance=Number(row[14]);
  const net=RND(sums[0]-sums.slice(1).reduce((a,b)=>a+b,0));
  if(previousBalance===null)opening=RND(balance-net);
  else if(Math.abs(RND(previousBalance+net)-balance)>0.000001)
   fail('MAIN_VIEW_BALANCE_MISMATCH');
  previousBalance=balance;
  entries.push([String(row[0]),...texts,sums[0],...sums.slice(1,moneyCount),balance]);
 }
 if(!entries.length)fail('MAIN_VIEW_NO_TRANSACTIONS');
 return {entries,foxconn,opening,closing:previousBalance};
}
function parsePhuHung(matrix){
 if(!Array.isArray(matrix)||matrix.length<6||matrix.length>10010||
    String(matrix[0]?.[0]||'')!=='PHU HUNG项目现金流明细表'||
    String(matrix[2]?.[7]||'')!=='支出'||
    String(matrix[2]?.[13]||'')!=='余额')
  fail('PHU_HUNG_MAIN_FORMAT_UNVERIFIED');
 const entries=[];
 let closing=null;
 for(const row of matrix.slice(4)){
  if(isBlank(row))continue;
  if(row[0]==='合计')break;
  if(!Array.isArray(row)||row.length>14||!validDate(row[0]))
   fail('PHU_HUNG_MAIN_ROW_UNVERIFIED');
  const cash=Array.from({length:8},(_,j)=>number(row[j+6]));
  if(cash.some(v=>!Number.isFinite(v)))fail('PHU_HUNG_MAIN_AMOUNT_UNVERIFIED');
  entries.push([String(row[0]),...row.slice(1,6).map(safeText),
    ...cash]);
  closing=cash[7];
 }
 if(!entries.length)fail('PHU_HUNG_MAIN_EMPTY');
 return {entries,foxconn:false,opening:null,closing};
}
export function prepareMainOnlyExport({project,values,sourceKind='technical'}={}){
 if(typeof project!=='string'||!project.trim()||project.length>180||
    !['technical','phu-hung'].includes(sourceKind))
  fail('MAIN_EXPORT_INVALID_PROJECT');
 const canonical=project.normalize('NFKC').trim();
 if(sourceKind==='phu-hung'&&canonical!=='PHU HUNG')
  fail('MAIN_EXPORT_WRONG_PHU_HUNG');
 const parsed=sourceKind==='phu-hung'?
  parsePhuHung(values):parseTechnical(values,canonical);
 const colCount=parsed.foxconn?15:14,balIndex=colCount-1;
 const title=canonical+'项目现金流明细表';
 const months=parsed.entries.map(x=>x[0].slice(0,7));
 const min=months.reduce((a,b)=>a<b?a:b),max=months.reduce((a,b)=>a>b?a:b);
 const header3=Array(colCount).fill(''),header4=Array(colCount).fill('');
 ['日期','公司名称','合同编号','合同内容','IPC','类型','收入'].forEach((x,i)=>header3[i]=x);
 header3[7]='支出';header3[balIndex]='余额';
 [...EXPENSE,...(parsed.foxconn?[TAX]:[])].forEach((x,i)=>header4[7+i]=x);
 const rows=[
  [title,...Array(colCount-1).fill('')],
  ['期间：'+min+' ~ '+max,...Array(colCount-1).fill('')],
  header3,header4,
  ...parsed.entries
 ];
 const total=Array(colCount).fill('');
 total[0]='合计';
 for(let col=6;col<balIndex;col++)total[col]=RND(parsed.entries.reduce((sum,row)=>sum+row[col],0));
 total[balIndex]=parsed.closing;
 rows.push(total);
 const stem=canonical.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,64);
 return Object.freeze({
  project:canonical,sourceKind,colCount,balIndex,
  rows,transactionCount:parsed.entries.length,
  closingBalance:parsed.closing,
  fileName:stem+'_CashControl_MAIN_'+max.replace('-','')+'.xlsx',
  sheetName:canonical.replace(/[\\/?*\[\]:]/g,'_').slice(0,31)||'Cash Control',
  includesHiddenTabs:false,includesSourceIds:false,
  mainSheetOnly:true
 });
}
export function buildMainOnlyWorkbook(xlsx,model){
 if(!xlsx?.utils?.aoa_to_sheet||!xlsx?.utils?.book_new||
    !xlsx?.utils?.book_append_sheet||!model?.mainSheetOnly||
    !Array.isArray(model.rows)||model.rows.length>10012)
  fail('MAIN_EXPORT_WORKBOOK_UNAVAILABLE');
 const ws=xlsx.utils.aoa_to_sheet(model.rows);
 const {colCount,balIndex,rows}=model,last=rows.length-1;
 const cellName=(r,c)=>xlsx.utils.encode_cell({r,c});
 const titleStyle={font:{name:'Arial',sz:16,bold:true,color:color('173B29')},
  fill:{fgColor:color('E0EFE5')},
  alignment:{horizontal:'center',vertical:'center'}};
 const periodStyle={font:{name:'Arial',sz:10,italic:true,color:color('455A48')},
  fill:{fgColor:color('F4F8F4')},alignment:{horizontal:'left',vertical:'center'}};
 const headStyle={font:{name:'Arial',sz:10,bold:true,color:color('233F30')},
  fill:{fgColor:color('D9E3D9')},
  alignment:{horizontal:'center',vertical:'center',wrapText:true},
  border:{bottom:{style:'thin',color:color('A9B8AD')}}};
 const totalStyle={font:{name:'Arial',sz:10,bold:true,color:color('17395E')},
  fill:{fgColor:color('EAF1F8')},
  border:{top:{style:'thin',color:color('99ABBD')}}};
 const normal={font:{name:'Arial',sz:10,color:color('263443')},
  alignment:{vertical:'center'},
  border:{bottom:{style:'hair',color:color('E5EAF0')}}};
 for(let r=0;r<rows.length;r++)for(let c=0;c<colCount;c++){
  const key=cellName(r,c);
  if(!ws[key])ws[key]={t:'s',v:''};
  const style=r===0?titleStyle:r===1?periodStyle:r<=3?headStyle:r===last?totalStyle:normal;
  ws[key].s={...style};
  if(r>=4&&c>=6&&c<=balIndex){
   ws[key].s={...style,numFmt:'#,##0;-#,##0;;@',
    alignment:{horizontal:'right',vertical:'center'}};
   if(typeof rows[r][c]==='number')ws[key].t='n';
  }
  if(r>=4&&r<last&&c===0)ws[key].s={...style,
   alignment:{horizontal:'center',vertical:'center'}};
 }
 const merge=(r1,r2,c1,c2)=>({s:{r:r1,c:c1},e:{r:r2,c:c2}});
 ws['!merges']=[merge(0,0,0,balIndex),merge(1,1,0,balIndex),
  merge(2,2,7,balIndex-1),
  ...[0,1,2,3,4,5,6,balIndex].map(c=>merge(2,3,c,c))];
 ws['!cols']=[
  {wch:14},{wch:22},{wch:31},{wch:51},{wch:14},{wch:16},
  ...Array(colCount-6).fill({wch:17})
 ];
 ws['!rows']=rows.map((_,i)=>({hpt:i===0?32:i===1?24:i===2||i===3?27:i===last?25:21}));
 // Freeze panes are viewer-dependent in SheetJS but no hidden data can be
 // added, even in clients that do not understand the pane hint.
 ws['!freeze']={xSplit:0,ySplit:4,topLeftCell:'A5',activePane:'bottomLeft',state:'frozen'};
 const wb=xlsx.utils.book_new();
 xlsx.utils.book_append_sheet(wb,ws,model.sheetName);
 if(wb.SheetNames.length!==1||wb.SheetNames[0]!==model.sheetName||
    ws['!ref']?.includes('Q20000'))fail('MAIN_EXPORT_SHEET_ISOLATION_FAILED');
 return wb;
}
