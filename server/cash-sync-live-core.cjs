'use strict';
// PHU HUNG only. Cash Control is authoritative for sourced records; the original
// Google historical tab is immutable and only a hidden archive after activation.
const crypto=require('node:crypto');
const {scanRows,normDate,auditKnownPayrollCorrection}=
  require('./cash-sync-original-audit.cjs');
const HEAD_VIEW=['date','company','contractNo','content','ipc','type','income',
  'subcontract','material','otherDirect','indirect','financial','otherPayable',
  'balance','origin','sourceId','openingBalance'];
const HEAD_MIRROR=['sourceId','projectKey','month','date','company','contractNo',
  'content','ipc','type','income','subcontract','material','otherDirect',
  'indirect','financial','otherPayable','balance','sourceHash','syncStatus'];
const HIST_BACKUP='PHU_HUNG_HISTORY_BACKUP';
const LIVE_TITLE='PHU HUNG';
const MIRROR_TITLE='DATA_CASHCONTROL';
function deny(msg){throw Object.assign(new Error(msg),{statusCode:409})}
function money(v){
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v!=='string'||!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v.trim()))
    deny('Tiền nguồn không hợp lệ.');
  const n=Number(v);if(!Number.isFinite(n))deny('Tiền nguồn không hợp lệ.');
  return n;
}
const round=v=>Math.round(v*1e6)/1e6;
function sourcePayload(values){
  if(!Array.isArray(values)||values.length!==13)deny('Nguồn Cash Control thiếu 13 cột.');
  return [...values.slice(0,6).map(v=>String(v??'')),...values.slice(6).map(money)];
}
const sha=content=>crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
function normalizeName(s){return String(s??'').normalize('NFKC').trim().toUpperCase()
  .replace(/\s+/g,'').replace(/[‐-‒–—−]/g,'-')}
const alias=new Map([
  ['LƯƠNGTRUNGQUỐC','PAYROLL_CN'],['中方员工工资','PAYROLL_CN'],
  ['TIỀNĂN','PAYROLL_MEAL'],['伙食费','PAYROLL_MEAL'],
  ['LƯƠNGVIỆTNAM','PAYROLL_VN'],['越籍员工工资','PAYROLL_VN'],
  ['BẢOHIỂMTQ','PAYROLL_CN_INSURANCE'],['中国社保','PAYROLL_CN_INSURANCE'],
  ['BẢOHIỂMVN','PAYROLL_VN_INSURANCE'],['越南社保','PAYROLL_VN_INSURANCE'],
  ['PHÍCÔNGĐOÀN','PAYROLL_UNION'],['工会经费','PAYROLL_UNION']
]);
function identity(values){
  const v=values,contract=normalizeName(v[2]),ipc=normalizeName(v[4]);
  const name=normalizeName(v[1]),company=contract||ipc?name:(alias.get(name)||name);
  return normDate(v[0])+'|'+v.slice(6,13).map(n=>String(round(money(n)))).join('|')+
    '|'+contract+'|'+ipc+'|'+company;
}
function sanitizeSource(payload){
  if(!payload||typeof payload!=='object'||!Array.isArray(payload.rows)||
     payload.rows.length>5000||payload.rows.length<30||
     payload.fromMonth!=='2026-10'||!/^\d{4}-\d{2}$/.test(payload.throughMonth)||
     payload.throughMonth<'2026-10')deny('Nguồn đồng bộ không đủ tháng kể từ 10/2026.');
  const rows=[],ids=new Set(),months=new Set();
  for(const row of payload.rows){
    if(!row||row.project!=='PHU HUNG'||typeof row.id!=='string'||
       row.id.length<3||row.id.length>300||ids.has(row.id)||
       !/^\d{4}-\d{2}$/.test(row.month)||
       row.month<'2026-10'||row.month>payload.throughMonth)
      deny('Nguồn Cash Control có ID trùng/sai dự án/tháng.');
    ids.add(row.id);
    const values=sourcePayload(row.values);
    if(normDate(values[0])!==values[0]||values[0].slice(0,7)!==row.month)
      deny('Ngày giao dịch không thuộc tháng nguồn.');
    const hash=sha(values);
    if(row.hash!==hash)deny('Hash giao dịch Cash Control không khớp: '+row.id.slice(0,50));
    rows.push({id:row.id,project:'PHU HUNG',month:row.month,values,hash});
    months.add(row.month);
  }
  // Source covers every month in period, even months with zero transactions.
  if(!Array.isArray(payload.months)||payload.months.length<1)deny('Thiếu danh sách tháng nguồn.');
  const required=[],year=Number(payload.throughMonth.slice(0,4)),mo=Number(payload.throughMonth.slice(5,7));
  if(year>2032)deny('Khoảng tháng quá rộng.');
  for(let y=2026;y<=year;y++)for(let m=y===2026?10:1;m<=(y===year?mo:12);m++)
    required.push(y+'-'+String(m).padStart(2,'0'));
  if(JSON.stringify(payload.months)!==JSON.stringify(required))
    deny('Không gửi đủ tất cả tháng Cash Control trước khi đồng bộ.');
  return rows.sort((a,b)=>a.month.localeCompare(b.month)||a.id.localeCompare(b.id));
}
function correctedHistory(original){
  const rows=scanRows(original).map(r=>({...r,values:r.values.slice()}));
  if(rows.length!==160)deny('Sổ lịch sử gốc không còn 160 giao dịch đã nghiệm thu.');
  const payroll=rows.find(r=>r.sheetRow===148);
  if(!payroll||payroll.values[0]!=='2026-10-27'||
     (Math.abs(payroll.values[10]-350945181.3)>0.000001&&
      Math.abs(payroll.values[10]-350945181)>0.000001))
    deny('Khoản lương K148 không khớp giá trị gốc hoặc giá trị đã sửa được duyệt; dừng chuyển đổi.');
  // Legacy original may already have been manually corrected to Cash Control's
  // authoritative integer value. Normalize the in-memory copy only; never
  // change the original archive, and never apply the 0.3 VND adjustment twice.
  payroll.values[10]=350945181;
  return rows;
}
function prepareNewMirror(source,history,previous=[]){
  const byId=new Map(),historyIndex=new Map(),free=new Map();
  for(const entry of history){
    const f=identity(entry.values);
    if(!free.has(f))free.set(f,[]);
    free.get(f).push(entry.sheetRow);
    historyIndex.set(entry.sheetRow,entry);
  }
  // Historical bound records always retain their sheetRow in syncStatus.
  const old=new Map();
  for(const row of previous){
    if(!Array.isArray(row)||row.length<19)deny('Dữ liệu đồng bộ cũ thiếu cột.');
    const id=String(row[0]??''),value=sourcePayload(row.slice(3,16));
    if(!id||old.has(id)||String(row[1])!=='PHU HUNG'||
       String(row[2])!==value[0].slice(0,7)||
       String(row[17])!==sha(value))deny('Dữ liệu đã đồng bộ bị sửa ngoài hệ thống.');
    const status=String(row[18]??'');
    if(status!=='synced'&&!/^(history|historyUpdated):\d+$/.test(status))
      deny('Trạng thái dữ liệu đồng bộ không hợp lệ.');
    old.set(id,{id,month:row[2],values:value,hash:String(row[17]),status});
    if(status.startsWith('history:')||status.startsWith('historyUpdated:')){
      const sheetRow=Number(status.split(':')[1]);
      if(!historyIndex.has(sheetRow)||byId.has(sheetRow))
        deny('Ràng buộc giao dịch lịch sử không hợp lệ.');
      byId.set(sheetRow,id);
      const f=identity(historyIndex.get(sheetRow).values);
      const candidates=free.get(f)||[];
      free.set(f,candidates.filter(x=>x!==sheetRow));
    }
  }
  const incoming=new Map(source.map(row=>[row.id,row]));
  for(const id of old.keys())if(!incoming.has(id))
    deny('Cash Control không còn giao dịch đã đồng bộ: '+id.slice(0,70)+'. Chặn xóa âm thầm.');
  const newMirror=[];
  for(const entry of source){
    const before=old.get(entry.id);
    let status=before?.status;
    if(status&&status.startsWith('history:')&&before.hash!==entry.hash)
      status='historyUpdated:'+status.split(':')[1];
    if(!status){
      const matches=free.get(identity(entry.values))||[];
      if(matches.length){const index=matches.shift();status='history:'+index;
        if(byId.has(index))deny('Hai nguồn trỏ vào cùng giao dịch lịch sử.');
        byId.set(index,entry.id);
      }else status='synced';
    }
    newMirror.push({...entry,status});
  }
  if(source.filter(row=>row.month==='2026-10').length<30)
    deny('Nguồn Cash Control tháng 10/2026 thiếu ít nhất một giao dịch lịch sử.');
  // Every October item in the baseline was a previously matched historical row.
  if(!previous.length&&newMirror.some(x=>x.month==='2026-10'&&x.status==='synced'))
    deny('Tháng 10 có nguồn chưa khớp lịch sử; không chuyển đổi tự động.');
  return {newMirror,prior:old,historyIndex};
}
function buildLedger(history,mirror){
  const byHistory=new Map(),extras=[];
  for(const row of mirror){
    if(row.status.startsWith('history:')||row.status.startsWith('historyUpdated:')){
      const index=Number(row.status.split(':')[1]);
      if(byHistory.has(index))deny('Dòng lịch sử bị trùng ràng buộc.');
      byHistory.set(index,row);
    }else extras.push(row);
  }
  const entries=history.map(h=>{
    const source=byHistory.get(h.sheetRow);
    if(source&&(source.status.startsWith('historyUpdated:')||identity(source.values)!==identity(h.values))){
      // Cash Control explicitly overrides a previously linked historical amount.
      if(source.values[0]<history[0].values[0])
        deny('Nguồn sửa có ngày sớm hơn đầu sổ lịch sử.');
      return {values:source.values,origin:'LỊCH SỬ',
        sourceId:'HISTORIC_ROW_'+h.sheetRow,index:h.sheetRow};
    }
    return {values:h.values.slice(0,13),origin:'LỊCH SỬ',
      sourceId:'HISTORIC_ROW_'+h.sheetRow,index:h.sheetRow};
  });
  for(const row of extras){
    if(row.values[0]<history[0].values[0])deny('Giao dịch mới trước đầu sổ lịch sử.');
    entries.push({values:row.values,origin:'CASH_CONTROL',sourceId:row.id,index:999999});
  }
  entries.sort((a,b)=>a.values[0].localeCompare(b.values[0])||
    a.index-b.index||a.sourceId.localeCompare(b.sourceId));
  const first=history[0].values;
  const cash=v=>v[6]-v.slice(7,13).reduce((sum,n)=>sum+money(n),0);
  const opening=round(first[13]-cash(first));
  let balance=opening;
  const rows=entries.map((r,i)=>{
    balance=round(balance+cash(r.values));
    return {
      ...r,balance,formula:i===0?'=$Q$2+G2-SUM(H2:M2)':
        '=N'+(i+1)+'+G'+(i+2)+'-SUM(H'+(i+2)+':M'+(i+2)+')',
      cells:[...r.values,'',r.origin,r.sourceId,i===0?opening:'']
    };
  });
  if(!rows.length||rows.length>10000)deny('Sổ tổng hợp không hợp lệ.');
  return {rows,opening,closingBalance:balance,
    historicCount:history.length,extraCount:extras.length};
}
function historicalDisplayHeader(original){
  // Reuse the actual A:N labels stored in the immutable PHU HUNG archive.
  const source=original?.[0];
  if(!Array.isArray(source)||source.length<14||
     typeof source[0]!=='string'||!source[0].trim())
    deny('Không tìm thấy đủ tiêu đề A:N của sổ PHU HUNG lịch sử.');
  return [...Array.from({length:14},(_,i)=>String(source[i]??'')),...HEAD_VIEW.slice(14)];
}
function totalRow(plan){
  const end=plan.rows.length+1;
  const cells=Array.from({length:17},()=>({}));
  cells[0]=gridValue('合计');
  for(let j=6;j<=12;j++){
    const col=String.fromCharCode(65+j);
    cells[j]={userEnteredValue:{formulaValue:'=SUM('+col+'2:'+col+end+')'}};
  }
  cells[13]={userEnteredValue:{formulaValue:'=N'+end}};
  return {values:cells};
}
function verifyView(view,formulas,plan,displayHeader=null){
  const header=view?.[0]||[];
  const legacy=JSON.stringify(header)===JSON.stringify(HEAD_VIEW)&&
    view.length===plan.rows.length+1;
  const modern=!!displayHeader&&
    JSON.stringify(header)===JSON.stringify(displayHeader)&&
    view.length===plan.rows.length+2;
  if(!legacy&&!modern)return false;
  const cells=view.slice(1);
  if(!Array.isArray(formulas)||
     formulas.length!==plan.rows.length+(modern?1:0))return false;
  for(let i=0;i<plan.rows.length;i++){
    const a=cells[i]||[],b=plan.rows[i],expected=b.cells;
    for(let j=0;j<17;j++){
      if(j===13){if(Math.abs(Number(a[13])-b.balance)>0.000001)return false;continue}
      const lhs=a[j]??'',rhs=expected[j]??'';
      if(j<6||j===14||j===15){
        if(String(lhs).trim()!==String(rhs).trim())return false;
      }else if(j===16&&i>0){
        if(String(lhs).trim()!=='')return false;
      }else if(j===16||j>=6&&j<=12){
        if(!Number.isFinite(Number(lhs))||Math.abs(Number(lhs)-Number(rhs))>0.000001)return false;
      }
    }
    if(String(formulas[i]?.[0]??'').replace(/\s+/g,'')!==b.formula)return false;
  }
  if(modern){
    const total=cells.at(-1)||[];
    if(String(total[0])!=='合计'||Math.abs(Number(total[13])-plan.closingBalance)>0.000001||
       String(formulas.at(-1)?.[0]??'').replace(/\s+/g,'')!=='=N'+(plan.rows.length+1))
      return false;
    for(let j=6;j<=12;j++){
      const col=String.fromCharCode(65+j);
      const expected=plan.rows.reduce((sum,r)=>sum+r.values[j],0);
      if(!Number.isFinite(Number(total[j]))||
         Math.abs(Number(total[j])-expected)>0.000001)return false;
      // Validate SUM expression using data values via a separate formula check
      // in the output grid; computed values alone are validated here.
    }
  }
  return true;
}
function gridValue(v){
  if(v===null||v===undefined||v==='')return {};
  return {userEnteredValue:typeof v==='number'?{numberValue:v}:
    typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)}};
}
function viewGrid(plan,displayHeader=null){
  const result=[{values:(displayHeader||HEAD_VIEW).map(gridValue)}];
  for(const row of plan.rows){
    const cells=row.cells.map(gridValue);
    cells[13]={userEnteredValue:{formulaValue:row.formula}};
    result.push({values:cells});
  }
  if(displayHeader)result.push(totalRow(plan));
  return result;
}
function mirrorGrid(rows){
  const result=[{values:HEAD_MIRROR.map(gridValue)}];
  for(const row of rows){
    const cells=[row.id,'PHU HUNG',row.month,...row.values,'',row.hash,row.status];
    if(cells.length!==19)deny('Mirror row length incorrect.');
    result.push({values:cells.map(gridValue)});
  }
  return result;
}
function planSignature(components){return sha(components)}
module.exports={
  HEAD_VIEW,HEAD_MIRROR,HIST_BACKUP,LIVE_TITLE,MIRROR_TITLE,
  correctedHistory,sanitizeSource,prepareNewMirror,buildLedger,verifyView,
  historicalDisplayHeader,totalRow,viewGrid,mirrorGrid,planSignature,deny,sha
};
