'use strict';
// Offline, fail-closed planner for future Cash Control project ledgers.
// Pure calculations only: never fetches, authenticates, writes, or authorizes a write.
// Input is normalized by the caller after validating the original Google tab.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSyncMultiProjectPlanner=api;
})(typeof window!=='undefined'?window:null,function(){
  const COLUMNS=['date','company','contractNo','content','ipc','type','income',
    'subcontract','material','otherDirect','indirect','financial','otherPayable'];
  const round=x=>Math.round((x+Number.EPSILON)*1e6)/1e6;
  function fail(code,message){const err=new Error(message);err.code=code;throw err}
  function date(x){
    if(typeof x!=='string'||!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x))
      fail('INVALID_DATE','Ngày phải có dạng YYYY-MM-DD.');
    const d=new Date(x+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x)
      fail('INVALID_DATE','Ngày không tồn tại.');
    return x;
  }
  function numeric(x){
    if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e15)
      fail('INVALID_AMOUNT','Tiền phải là số hữu hạn, không phải ô trống/chuỗi.');
    return round(x);
  }
  function record(input){
    if(!input||typeof input!=='object')fail('INVALID_ROW','Dòng nguồn trống.');
    const v={};
    v.date=date(input.date);
    for(const field of COLUMNS.slice(1,6)){
      if(typeof input[field]!=='string'||input[field].length>4096)
        fail('INVALID_FIELD','Cột '+field+' không hợp lệ.');
      v[field]=input[field].trim();
    }
    for(const field of COLUMNS.slice(6))v[field]=numeric(input[field]);
    return v;
  }
  function net(v){return round(v.income-COLUMNS.slice(7).reduce((n,k)=>n+v[k],0))}
  function token(v){
    // Exact tuple matching, including names and contract/IPC, not date+amount only.
    return JSON.stringify(COLUMNS.map(k=>typeof v[k]==='string'?v[k].normalize('NFKC').trim():v[k]));
  }
  function normalizeHistorical(project,history){
    if(!Array.isArray(history)||history.length>20000)fail('INVALID_HISTORY','Sổ lịch sử vượt giới hạn.');
    const result=[],seen=new Set();
    for(const entry of history){
      const v=record(entry);
      const rowId=entry.rowId;
      if(!Number.isSafeInteger(rowId)||rowId<1||seen.has(rowId))
        fail('HISTORY_ROW_ID','Dòng lịch sử phải có số hàng gốc duy nhất.');
      seen.add(rowId);
      const balance=numeric(entry.balance);
      if(result.length&&v.date<result.at(-1).data.date)
        fail('DATE_ORDER','Lịch sử đang có ngày giảm dần; phải kiểm tra trước.');
      if(result.length){
        const expected=round(result.at(-1).balance+net(v));
        if(Math.abs(expected-balance)>0.000001)
          fail('HISTORY_BALANCE','Số dư lịch sử không khớp tại dòng '+rowId+'.');
      }
      result.push({rowId,data:v,balance,token:token(v)});
    }
    return result;
  }
  function plan({project,history,source,previousMirror=[],openingBalance=null}={}){
    if(typeof project!=='string'||!project.trim()||project.length>180)
      fail('PROJECT','Cần dự án cụ thể.');
    if(!Array.isArray(source)||source.length>20000)
      fail('SOURCE','Nguồn Cash Control thiếu hoặc quá lớn.');
    if(!Array.isArray(previousMirror)||previousMirror.length>20000)
      fail('MIRROR','Dữ liệu đã đồng bộ không hợp lệ.');
    const old=normalizeHistorical(project,history);
    if(!old.length&&openingBalance===null)
      fail('OPENING_NOT_CONFIRMED','Dự án mới phải xác nhận số dư đầu kỳ.');
    const first=old[0];
    const opening=first?round(first.balance-net(first.data)):numeric(openingBalance);
    if(first&&openingBalance!==null&&Math.abs(numeric(openingBalance)-opening)>0.000001)
      fail('OPENING_CONFLICT','Số dư đầu kỳ không khớp lịch sử.');
    const previous=new Map();
    for(const p of previousMirror){
      if(!p||typeof p.id!=='string'||!p.id||previous.has(p.id))
        fail('MIRROR_DUPLICATE','Có ID đã đồng bộ trùng.');
      if(p.project!==project||typeof p.signature!=='string'||!p.signature)
        fail('MIRROR_MISMATCH','Bản ghi mirror khác dự án hoặc thiếu chữ ký.');
      previous.set(p.id,p.signature);
    }
    const buckets=new Map();
    for(const h of old){
      if(!buckets.has(h.token))buckets.set(h.token,[]);
      buckets.get(h.token).push(h.rowId);
    }
    const usedHistory=new Set(),seen=new Set(),newRows=[];
    const lastDate=old.length?old.at(-1).data.date:null;
    for(const item of source){
      if(!item||item.project!==project||typeof item.id!=='string'||
         !item.id||item.id.length>300||seen.has(item.id))
        fail('SOURCE_ID','Nguồn có ID trùng hoặc khác dự án.');
      seen.add(item.id);
      const v=record(item);
      const signature=token(v);
      if(previous.has(item.id)&&previous.get(item.id)!==signature)
        fail('EDIT_REQUIRES_REVIEW','Nguồn đã đồng bộ bị thay đổi; chưa hỗ trợ ghi đè.');
      let historyId=null;
      if(item.historyRowId!==undefined&&item.historyRowId!==null){
        if(!Number.isSafeInteger(item.historyRowId)||item.historyRowId<1)
          fail('INVALID_HISTORY_BINDING','ID hàng lịch sử không hợp lệ.');
        const h=old.find(x=>x.rowId===item.historyRowId);
        if(!h||h.token!==signature)
          fail('HISTORY_BINDING_MISMATCH','Giao dịch và hàng lịch sử không giống nhau.');
        historyId=h.rowId;
      } else {
        const candidates=buckets.get(signature)||[];
        if(candidates.length>1)
          fail('AMBIGUOUS_HISTORY','Nhiều dòng lịch sử giống nhau: phải gắn ID thủ công.');
        if(candidates.length===1)historyId=candidates[0];
      }
      if(historyId!==null){
        if(usedHistory.has(historyId))
          fail('DUPLICATE_MATCH','Hai giao dịch Cash Control trỏ cùng một dòng lịch sử.');
        usedHistory.add(historyId);
      } else {
        if(lastDate&&v.date<=lastDate)
          fail('OVERLAP_UNMATCHED','Giao dịch không khớp nhưng nằm trong kỳ lịch sử; phải xác minh.');
        newRows.push({id:item.id,data:v,signature});
      }
    }
    for(const id of previous.keys())if(!seen.has(id))
      fail('SOURCE_REMOVED','Giao dịch đã đồng bộ biến mất khỏi nguồn: '+id.slice(0,50));
    const entries=old.map(h=>({id:'HISTORY:'+h.rowId,data:h.data,origin:'HISTORY',rowId:h.rowId}));
    for(const x of newRows)entries.push({id:x.id,data:x.data,origin:'CASH_CONTROL',rowId:null});
    entries.sort((a,b)=>a.data.date.localeCompare(b.data.date)||
      (a.origin==='HISTORY'?0:1)-(b.origin==='HISTORY'?0:1)||
      a.id.localeCompare(b.id));
    let running=opening;
    const rows=entries.map((entry,i)=>{
      running=round(running+net(entry.data));
      const sheetRow=i+2;
      return {...entry,balance:running,
        formula:i===0?'=$Q$2+G2-SUM(H2:M2)':
          '=N'+(sheetRow-1)+'+G'+sheetRow+'-SUM(H'+sheetRow+':M'+sheetRow+')'};
    });
    if(old.length){
      const lastHistorical=rows.filter(x=>x.origin==='HISTORY').at(-1);
      if(!lastHistorical||Math.abs(lastHistorical.balance-old.at(-1).balance)>0.000001)
        fail('HISTORY_CHANGED','Tính lại số dư khác lịch sử đã kiểm chứng.');
    }
    return Object.freeze({project,openingBalance:opening,closingBalance:running,
      historicCount:old.length,newCount:newRows.length,matchedHistory:usedHistory.size,
      rows,viewTab:'PROJECT_VIEW',mirrorTab:'DATA_CASHCONTROL',
      canWrite:false,requiresAdminConfirmation:true,
      status:'OFFLINE_PLAN_ONLY'});
  }
  return Object.freeze({COLUMNS,plan,record,net,token});
});
