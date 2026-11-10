'use strict';
// Google Sheets TEST-copy adapter for multi-project Cash Control.
// The file ID is server-owned, never accepted from the caller. This code
// NEVER writes PHU HUNG, historical tabs or real project Google Sheets.
const {TEST_SPREADSHEET_ID}=require('./cash-sync-guard.cjs');
const {tabNames,MIRROR_HEADER,VIEW_HEADER}=require('./cash-sync-multiproject-write-plan.cjs');
const {COLUMNS,record,token}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const BASE='https://sheets.googleapis.com/v4/spreadsheets/'+TEST_SPREADSHEET_ID;
function reject(code,message){
  const error=new Error(message);error.code=code;throw error;
}
function requireToken(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9._~-]{20,4096}$/.test(value))
    reject('NO_GOOGLE_TOKEN','Thiếu phiên OAuth Google hợp lệ.');
}
function createGoogleTestAdapter({project,accessToken,adminVerified=false,
  recompare,fetcher=fetch}={}){
  if(typeof project!=='string'||!project.trim()||project.length>180)
    reject('PROJECT','Dự án TEST không hợp lệ.');
  if(adminVerified!==true)reject('AUTH_FAILED','Chỉ server đã xác thực Admin được tạo adapter.');
  requireToken(accessToken);
  if(typeof fetcher!=='function')reject('FETCH','Google API không khả dụng.');
  const tabs=tabNames(project);
  let metadata=null;
  async function call(path,{method='GET',body}={}){
    if(!path.startsWith('/')&&!path.startsWith(':')&&!path.startsWith('?'))
      reject('GOOGLE_PATH','Đường dẫn Google API không hợp lệ.');
    const response=await fetcher(BASE+path,{
      method,
      headers:{Authorization:'Bearer '+accessToken,
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)reject('GOOGLE_HTTP',
      'Google Sheets TEST HTTP '+response.status+'; chưa xác nhận đồng bộ.');
    return response.json();
  }
  const tabQuote=title=>"'"+title.replace(/'/g,"''")+"'";
  const valuesPath=(tab,range,mode='UNFORMATTED_VALUE')=>
    '/values/'+encodeURIComponent(tabQuote(tab)+'!'+range)+
    '?valueRenderOption='+mode;
  async function refreshMeta(){
    const result=await call('?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId,hidden))');
    if(result.spreadsheetId!==TEST_SPREADSHEET_ID||
       !/\bTEST\b/i.test(String(result.properties?.title||''))||
       !Array.isArray(result.sheets)||
       !result.sheets.some(x=>x.properties?.title==='PHU HUNG'))
      reject('NOT_TEST_COPY','Không phải bản sao PHU HUNG TEST được phép.');
    metadata=result;
    return result;
  }
  function sheet(name){
    return metadata?.sheets?.find(x=>x.properties?.title===name)?.properties||null;
  }
  async function inspect(name){
    const target=sheet(name);
    if(!target)return false;
    if(target.hidden===true||!Number.isSafeInteger(target.sheetId)||target.sheetId<0)
      reject('SHEET_CHANGED','Tab TEST đang ẩn hoặc không có ID hợp lệ.');
    return true;
  }
  async function readMirror(){
    if(!await inspect(tabs.mirror))return [];
    const response=await call(valuesPath(tabs.mirror,'A1:S20000'));
    const rows=response.values||[];
    if(!Array.isArray(rows)||rows.length>20000||!rows.length||
       JSON.stringify(rows[0])!==JSON.stringify(MIRROR_HEADER))
      reject('MIRROR_HEADER','Tab dữ liệu TEST bị thay đổi cấu trúc.');
    return rows.slice(1).map((cells,i)=>{
      if(!Array.isArray(cells)||cells.length>19||cells[16]&&String(cells[16]).trim())
        reject('MIRROR_SCHEMA','Mirror có ô số dư/chỉnh sửa bất thường tại dòng '+(i+2)+'.');
      const data=record(Object.fromEntries(COLUMNS.map((key,j)=>[key,cells[j+3]])));
      const item={id:String(cells[0]??''),project:String(cells[1]??''),
        month:String(cells[2]??''),...data,signature:String(cells[17]??''),
        status:String(cells[18]??'')};
      if(item.month!==item.date.slice(0,7)||item.signature!==token(data))
        reject('MIRROR_TAMPERED','Mirror TEST sai tháng hoặc chữ ký tại dòng '+(i+2)+'.');
      return item;
    });
  }
  async function readView({calculated=false}={}){
    if(!await inspect(tabs.view))return {view:[],formulas:[]};
    const [v,f]=await Promise.all([
      call(valuesPath(tabs.view,'A1:Q20000')),
      call(valuesPath(tabs.view,'N2:N20000','FORMULA'))
    ]);
    const rows=v.values||[],formulas=f.values||[];
    if(!Array.isArray(rows)||!rows.length||rows.length>10001||
       JSON.stringify(rows[0])!==JSON.stringify(VIEW_HEADER))
      reject('VIEW_HEADER','Tab tổng hợp TEST bị thay đổi cấu trúc.');
    if(formulas.length!==rows.length-1)
      reject('VIEW_FORMULAS','Thiếu công thức số dư TEST.');
    return {view:rows.map((cells,i)=>{
      if(!Array.isArray(cells)||cells.length>17)
        reject('VIEW_SCHEMA','Tab VIEW sai cấu trúc.');
      const values=Array.from({length:17},(_,j)=>cells[j]??'');
      // Preview uses the formula representation for an exact comparison
      // with PHU HUNG's original generated grid; post-write uses calculated N.
      if(i>0&&!calculated)values[13]=String(formulas[i-1]?.[0]??'');
      return {values};
    }),formulas};
  }
  async function readSnapshot(){
    await refreshMeta();
    const [mirror,viewData]=await Promise.all([readMirror(),readView()]);
    return {spreadsheetId:TEST_SPREADSHEET_ID,project,
      viewTab:tabs.view,mirrorTab:tabs.mirror,mirror,view:viewData.view,
      formulas:viewData.formulas};
  }
  async function ensureTab(name,header,endColumn){
    await refreshMeta();
    if(await inspect(name))return;
    await call(':batchUpdate',{method:'POST',body:{
      requests:[{addSheet:{properties:{title:name}}}]
    }});
    await refreshMeta();
    if(!await inspect(name))reject('CREATE_FAILED','Không tìm thấy tab TEST vừa tạo.');
    await call('/values/'+encodeURIComponent(tabQuote(name)+'!A1:'+endColumn+'1')+
      '?valueInputOption=RAW',{method:'PUT',body:{values:[header]}});
  }
  async function writeMirrorAdditions(entries){
    if(!Array.isArray(entries)||!entries.length||entries.length>5000)
      reject('MIRROR_PLAN','Không có dòng mới hợp lệ.');
    await ensureTab(tabs.mirror,MIRROR_HEADER,'S');
    const before=await readMirror();
    const seen=new Set(before.map(x=>x.id));
    const rows=entries.map(row=>{
      if(row.project!==project||seen.has(row.id)||row.status!=='synced')
        reject('MIRROR_CONFLICT','Giao dịch trùng hoặc sai dự án trước khi append.');
      seen.add(row.id);
      const data=record(row);
      if(row.signature!==token(data)||row.month!==data.date.slice(0,7))
        reject('MIRROR_TAMPERED','Nguồn ghi TEST không khớp chữ ký.');
      return [row.id,project,row.month,...COLUMNS.map(key=>data[key]),
        '',row.signature,'synced'];
    });
    await call('/values/'+encodeURIComponent(tabQuote(tabs.mirror)+'!A:S')+
      ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      {method:'POST',body:{values:rows}});
  }
  async function writeView(grid){
    if(!Array.isArray(grid)||grid.length<2||grid.length>10001)
      reject('VIEW_PLAN','Sổ tổng hợp TEST không hợp lệ.');
    await ensureTab(tabs.view,VIEW_HEADER,'Q');
    const dest=sheet(tabs.view);
    if(!Number.isInteger(dest?.sheetId))reject('VIEW_SHEET_ID','Thiếu ID tab VIEW TEST.');
    // No historical tab is ever mutated; the generated TEST VIEW is atomic.
    await call(':batchUpdate',{method:'POST',body:{requests:[{updateCells:{
      range:{sheetId:dest.sheetId,startRowIndex:0,
        endRowIndex:Math.max(grid.length,2),startColumnIndex:0,endColumnIndex:17},
      rows:grid,fields:'userEnteredValue'
    }}]}});
  }
  async function readAfterWrite(){
    await refreshMeta();
    const [mirror,viewData]=await Promise.all([readMirror(),readView({calculated:true})]);
    return {spreadsheetId:TEST_SPREADSHEET_ID,project,
      mirror,view:viewData.view,formulas:viewData.formulas};
  }
  async function checkAuthority({spreadsheetId,viewTab,mirrorTab}={}){
    if(spreadsheetId!==TEST_SPREADSHEET_ID||viewTab!==tabs.view||
       mirrorTab!==tabs.mirror)
      reject('TARGET','Chỉ được thao tác đúng file và tab TEST đã khóa.');
    await refreshMeta();
    return {adminVerified:true,testOnly:true,spreadsheetId:TEST_SPREADSHEET_ID};
  }
  return {checkAuthority,readSnapshot,writeMirrorAdditions,writeView,
    readAfterWrite,recompare};
}
module.exports={createGoogleTestAdapter};
