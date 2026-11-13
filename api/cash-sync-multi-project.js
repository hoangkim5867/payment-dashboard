'use strict';
/* Manual Admin-only multi-project Google Sheets writer.
 * Preview is read-only. Commit is independently disabled until the server
 * explicit release flag is set after TEST confirmation.
 * Original worksheet is NEVER updated, renamed, hidden or deleted.
 */
const {readConfig,verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const core=require('../server/cash-sync-multi-project-core.cjs');
const adapter=require('../server/cash-sync-multi-project-adapter.cjs');
const {canWriteTarget}=require('../server/cash-sync-multi-targets.cjs');
const {planMonth,parseValues,sha}=core;
const {MIRROR,VIEW,parseStoredMirror,verifyExistingView,compileBatch}=adapter;
const prefix='https://sheets.googleapis.com/v4/spreadsheets/';
const die=(message,code=409)=>{throw Object.assign(new Error(message),{statusCode:code})};
function validBody(payload){
 if(!payload||Array.isArray(payload)||typeof payload!=='object'||
    JSON.stringify(payload).length>850000)die('Dữ liệu đồng bộ không hợp lệ.',413);
 const {action,project,month,spreadsheetId,historySheetId,source,signature}=payload;
 if(!['preview','commit'].includes(action)||typeof project!=='string'||
    !project.trim()||project.length>180||
    !/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month<'2026-10'||
    typeof spreadsheetId!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(spreadsheetId)||
    !Number.isSafeInteger(historySheetId)||historySheetId<0||
    !Array.isArray(source)||source.length>3000||
    action==='commit'&&(!/^[a-f0-9]{64}$/.test(signature)||payload.confirm!=='SYNC_THIS_PROJECT'))
  die('Thiếu ID dự án, tháng, file Google hoặc xác nhận ký số.',400);
 return payload;
}
async function google(bearer,id,extra,method='GET',body=null){
 const result=await fetch(prefix+encodeURIComponent(id)+extra,{
  method,headers:{Authorization:bearer,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(28000)
 });
 const json=await result.json().catch(()=>({}));
 if(!result.ok)die('Google Sheets '+result.status+': '+
  String(json?.error?.message||'Yêu cầu bị từ chối.').slice(0,130),502);
 return json;
}
const tabById=(meta,id)=>meta.sheets?.find(x=>x.properties?.sheetId===id)?.properties;
const tabByTitle=(meta,title)=>meta.sheets?.find(x=>x.properties?.title===title)?.properties;
const range=(title,cols)=>'/values/'+encodeURIComponent(
 "'"+title.replace(/'/g,"''")+"'!"+cols)+
 '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
async function state(bearer,id,historySheetId){
 const meta=await google(bearer,id,
  '?fields=spreadsheetId,sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))');
 if(meta.spreadsheetId!==id)die('Google file ID không khớp.');
 const historic=tabById(meta,historySheetId);
 if(!historic||[MIRROR,VIEW].includes(historic.title))
  die('Chưa xác minh được tab lịch sử theo gid.');
 const mirrored=tabByTitle(meta,MIRROR),view=tabByTitle(meta,VIEW);
 if(Boolean(mirrored)!==Boolean(view))
  die('Google có tab kỹ thuật dở dang, không tự sửa.');
 if(mirrored&&mirrored.hidden!==true)die('Tab dữ liệu kỹ thuật không còn được ẩn.');
 if(view&&view.hidden===true)die('Tab tổng hợp đã bị ẩn bất thường.');
 if([historic,mirrored,view].some(x=>x&&x.gridProperties?.rowCount>20000))
  die('Tab Google quá 20.000 dòng.');
 const [raw,oldMirror,oldView,formulas]=await Promise.all([
  google(bearer,id,range(historic.title,'A1:O20000')),
  mirrored?google(bearer,id,range(MIRROR,'A1:S20000')):Promise.resolve(null),
  view?google(bearer,id,range(VIEW,'A1:R20000')):Promise.resolve(null),
  view?google(bearer,id,'/values/'+encodeURIComponent("'"+VIEW+"'!O1:O20000")+
    '?valueRenderOption=FORMULA'):Promise.resolve(null)
 ]);
 const mirror=mirrored?parseStoredMirror(oldMirror.values||[]):[];
 if(mirrored&&!mirror)die('Mirror trống hoặc sai header; không ghi.');
 return {meta,history:raw.values||[],mirror,view:oldView?.values||[],
  formulas:formulas?.values||[],hasTabs:!!mirrored};
}
const equalCells=(a,b)=>a.length===b.length&&a.every((row,i)=>
 Array.isArray(row)&&Array.isArray(b[i])&&row.length===b[i].length&&
 row.every((value,j)=>typeof value==='number'&&typeof b[i][j]==='number'?
  Math.abs(value-b[i][j])<0.000001:String(value??'')===String(b[i][j]??'')));
async function prepare(bearer,input){
 const snapshot=await state(bearer,input.spreadsheetId,input.historySheetId);
 const foxconn=input.project.normalize('NFKC').trim().toUpperCase()==='FOXCONN';
 const opening=input.openingBalance===null||input.openingBalance===undefined?
  null:Number(input.openingBalance);
 if(opening!==null&&!Number.isFinite(opening))die('Số dư đầu kỳ không hợp lệ.');
 const normalized=input.source.map(record=>{
  const values=parseValues(record?.values,{foxconn});
  if(record.hash!==sha(values))die('Nguồn Cash Control thay đổi trong lúc chuẩn bị: '+
   String(record?.id||'').slice(0,45));
  return {...record,values};
 });
 if(snapshot.hasTabs){
  const monthRows=snapshot.mirror.filter(r=>
   String(r.values?.[0]||'').slice(0,7)===input.month).map(r=>({
    id:r.id,project:r.project,month:input.month,values:r.values
   }));
  const existing=planMonth({project:input.project,month:input.month,
   source:monthRows,history:snapshot.history,mirror:snapshot.mirror,
   foxconn,openingBalance:opening});
  if(existing.status!=='CANDIDATES_ONLY')
   die('VIEW kỹ thuật hiện tại có giao dịch chưa xác minh.');
  verifyExistingView(snapshot.view,snapshot.formulas,existing);
 }
 const plan=planMonth({project:input.project,month:input.month,
  source:normalized,history:snapshot.history,mirror:snapshot.mirror,
  foxconn,openingBalance:opening});
 if(plan.status!=='CANDIDATES_ONLY')
  return {blocked:plan.reviews,plan,snapshot};
 const batch=compileBatch({plan,metadata:snapshot.meta,
  historySheetId:input.historySheetId});
 return {plan,snapshot,batch,blocked:[]};
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store,max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='POST')return res.status(405).json({error:'Only POST supported.'});
 if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)
  return res.status(403).json({error:'Cross-origin request rejected.'});
 try{
  const config=readConfig(process.env);
  await verifyFirebaseAdminToken(String(req.headers['x-firebase-id-token']||''),config);
  const authorization=String(req.headers.authorization||'');
  if(!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(authorization))
   die('Google OAuth token missing.',401);
  const input=validBody(typeof req.body==='string'?JSON.parse(req.body):req.body);
  const current=await prepare(authorization,input);
  if(current.blocked.length)
   return res.status(409).json({error:'Có khoản cần đối chiếu, không ghi.',
    project:input.project,blocked:current.blocked.slice(0,30),writes:0});
  const {plan,snapshot,batch}=current;
  const summary={project:plan.project,month:plan.month,
   historical:plan.viewRows.filter(x=>x.origin==='HISTORY').length,
   generated:plan.viewRows.length,changes:plan.changes.length,
   closingBalance:plan.closingBalance,originalUntouched:true};
  if(input.action==='preview')
   return res.status(200).json({mode:'preview',summary,signature:batch.fingerprint,
    writeConfigured:canWriteTarget(process.env,input.project,input.spreadsheetId,input.historySheetId),writes:0});
  if(!canWriteTarget(process.env,input.project,input.spreadsheetId,input.historySheetId))
   die('Dự án/file Google chưa được cho phép ghi trên máy chủ hoặc chưa bật phát hành.',503);
  if(input.signature!==batch.fingerprint)
   die('Google hoặc nguồn Cash Control đã thay đổi sau bước xem trước.');
  if(!plan.changes.length&&snapshot.hasTabs)
   return res.status(200).json({mode:'unchanged',summary,writes:0});
  // Atomic Google batchUpdate only touches machine-owned grid IDs.
  await google(authorization,input.spreadsheetId,':batchUpdate','POST',
   {requests:batch.requests,includeSpreadsheetInResponse:false});
  // Verify exact mirror data, spreadsheet formula layout and closing balance.
  const after=await state(authorization,input.spreadsheetId,input.historySheetId);
  const expected=adapter.normalizeMirror(plan);
  const afterMatrix=[adapter.MIRROR_HEADER,...after.mirror.map(r=>[
   r.id,r.project,String(r.values[0]).slice(0,7),...r.values,r.hash,r.status])];
  if(!equalCells(expected,afterMatrix))
   die('Google đã nhận lệnh nhưng đọc lại mirror chưa khớp; KHÔNG thử ghi lại.');
  verifyExistingView(after.view,after.formulas,plan);
  return res.status(200).json({mode:'verified',summary,writes:1});
 }catch(error){
  const code=[400,401,403,409,413,503].includes(error?.statusCode)?
   error.statusCode:500;
  return res.status(code).json({error:code===500?
   'Không xác minh được Google Sheets; KHÔNG tự ghi lại.':
   String(error.message||'Chặn đồng bộ.')});
 }
};
