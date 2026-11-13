'use strict';
/* Offline, reusable Cash Control -> Google view/mirror engine.
 * Does not fetch, write or authorize Google data. Never mutates original history.
 * Google write adapter must independently verify Admin, destination, metadata,
 * current source, expected history/mirror fingerprints and returned balances.
 */
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=msg=>{throw Object.assign(new Error(msg),{code:'SYNC_REVIEW_REQUIRED'})};
const round=x=>Math.round(x*1e6)/1e6;
const name=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
function date(v){
  if(Number.isInteger(v)&&v>=20000&&v<100000)
    return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);
  if(typeof v!=='string')return '';
  const s=v.trim();let m=/^(20\d\d)-(\d\d?)-(\d\d?)$/.exec(s),y,mo,d;
  if(m){y=+m[1];mo=+m[2];d=+m[3]}
  else{
    m=/^(\d\d?)[/.-](\d\d?)[/.-](20\d\d)$/.exec(s);
    if(!m)return '';d=+m[1];mo=+m[2];y=+m[3];
  }
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return '';
  return [y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
const cash=v=>{
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='string'&&/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v.trim()))
    return Number(v);
  return NaN;
};
function parseValues(row,{history=false,foxconn=false}={}){
  if(!Array.isArray(row)||row.length<(history?foxconn?15:14:13))
    fail('Giao dịch không đủ cột.');
  const d=date(row[0]);if(!d)fail('Ngày giao dịch không hợp lệ.');
  const values=[d,...row.slice(1,6).map(v=>String(v??''))];
  for(let i=6;i<=13;i++){
    if(i===13&&!foxconn){values.push(0);continue}
    const v=row[i],n=history&&(v===null||v===undefined||v==='')?0:cash(v);
    if(!Number.isFinite(n))fail('Ô tiền nguồn Google/Cash Control không hợp lệ.');
    values.push(n);
  }
  return values;
}
const net=v=>round(v[6]-v.slice(7,14).reduce((n,m)=>n+m,0));
const idSignature=v=>JSON.stringify([v[0],...v.slice(1,6).map(name),...v.slice(6)]);
function auditHistory(raw,{foxconn=false,openingBalance=null}={}){
  if(!Array.isArray(raw)||raw.length>20000)fail('Sổ Google vượt giới hạn kiểm tra.');
  const entries=[];let firstOpening=null,prev=null,maxDate='';
  for(const [i,row] of raw.entries()){
    if(!Array.isArray(row)||!date(row[0]))continue;
    const values=parseValues(row,{history:true,foxconn});
    const balance=cash(row[foxconn?14:13]);
    if(!Number.isFinite(balance))fail('Sổ Google thiếu số dư lịch sử tại hàng '+(i+1));
    if(prev===null)firstOpening=round(balance-net(values));
    else if(Math.abs(round(prev+net(values))-balance)>0.000001)
      fail('Lịch sử Google lệch số dư tại hàng '+(i+1));
    prev=balance;maxDate=maxDate>values[0]?maxDate:values[0];
    entries.push({sheetRow:i+1,values,balance});
  }
  if(!entries.length){
    if(!Number.isFinite(openingBalance))fail('Sổ trống cần số dư đầu kỳ được xác nhận.');
    firstOpening=openingBalance;prev=openingBalance;
  }
  return {entries,openingBalance:firstOpening,closingBalance:prev,maxDate,
    fingerprint:sha(raw)};
}
function validateMirror(raw,projectKey){
  if(!Array.isArray(raw)||raw.length>20000)fail('Tab mirror không hợp lệ.');
  const entries=[],index=new Map();
  for(const record of raw){
    const id=String(record?.id??''),project=name(record?.project);
    if(!id||id.length>500||index.has(id)||project!==projectKey||
       typeof record.hash!=='string'||!record.hash)
      fail('Mirror có ID trùng hoặc sai dự án.');
    const values=parseValues(record.values,{foxconn:true});
    if(sha(values)!==record.hash)
      fail('Mirror đã bị sửa tay hoặc hash nguồn không còn khớp.');
    const status=String(record.status??'');
    if(status!=='synced'&&!/^history(?:Updated)?:[1-9]\d*$/.test(status))
      fail('Trạng thái mirror không hợp lệ.');
    const entry={id,project,values,hash:record.hash,status};
    index.set(id,entry);entries.push(entry);
  }
  return {entries,index,fingerprint:sha(raw)};
}
function planMonth({project,month,source,history,mirror=[],foxconn=false,openingBalance=null}){
  const projectKey=name(project);
  if(!projectKey||projectKey.length>180||!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||
     month<'2026-10'||!Array.isArray(source)||source.length>20000)
    fail('Dự án, kỳ hoặc nguồn Cash Control không hợp lệ.');
  const historical=auditHistory(history,{foxconn,openingBalance});
  const stored=validateMirror(mirror,projectKey);
  const monthlyOld=stored.entries.filter(r=>r.values[0].startsWith(month+'-'));
  const ids=new Set(),sourceSignatures=new Set(),sourceById=new Map();
  for(const rec of source){
    const id=String(rec?.id??'');
    if(id.length<3||id.length>500||ids.has(id)||name(rec.project)!==projectKey||
       rec.month!==month)fail('Nguồn Cash Control có ID trùng/sai dự án/tháng.');
    ids.add(id);
    const values=parseValues(rec.values,{foxconn});
    if(!values[0].startsWith(month+'-'))fail('Giao dịch ngoài kỳ nguồn.');
    const sig=idSignature(values);
    if(sourceSignatures.has(sig))fail('Hai ID nguồn có cùng chữ ký giao dịch.');
    sourceSignatures.add(sig);
    sourceById.set(id,{id,values,hash:sha(values)});
  }
  for(const prev of monthlyOld)if(!sourceById.has(prev.id))
    fail('Mirror có ID không còn trong nguồn tháng này; không tự xóa.');
  const historySignatures=new Map(),usedHistorical=new Set();
  for(const item of historical.entries){
    const sig=idSignature(item.values);
    if(!historySignatures.has(sig))historySignatures.set(sig,[]);
    historySignatures.get(sig).push(item.sheetRow);
  }
  // Bound historical rows remain reserved by IDs synced in earlier sessions.
  for(const item of stored.entries){
    if(!item.status.startsWith('history'))continue;
    const position=Number(item.status.split(':')[1]);
    const original=historical.entries.find(x=>x.sheetRow===position);
    if(!original||usedHistorical.has(position))fail('Mirror tham chiếu dòng lịch sử bị thiếu/trùng.');
    if(item.status.startsWith('history:')&&
       idSignature(original.values)!==idSignature(item.values))
      fail('Dòng Google lịch sử bị thay đổi sau khi gắn ID.');
    usedHistorical.add(position);
  }
  const combinedMirror=stored.entries.filter(r=>!r.values[0].startsWith(month+'-'));
  const changes=[],reviews=[],bindings=[];
  for(const current of sourceById.values()){
    const before=stored.index.get(current.id);
    if(before){
      const status=before.status.startsWith('history:')&&before.hash!==current.hash?
        'historyUpdated:'+before.status.slice(8):before.status;
      const item={...current,project:projectKey,status};
      combinedMirror.push(item);
      if(before.hash!==item.hash||before.status!==item.status)
        changes.push({id:item.id,action:'update',status:item.status});
      continue;
    }
    const found=(historySignatures.get(idSignature(current.values))||[])
      .filter(position=>!usedHistorical.has(position));
    if(found.length>1){reviews.push({id:current.id,reason:'AMBIGUOUS_HISTORY'});continue}
    if(found.length===1){
      const position=found[0];usedHistorical.add(position);
      const item={...current,project:projectKey,status:'history:'+position};
      combinedMirror.push(item);bindings.push({id:item.id,googleRow:position});
      changes.push({id:item.id,action:'bind-history',status:item.status});
      continue;
    }
    if(current.values[0]<=historical.maxDate){
      reviews.push({id:current.id,reason:'MISSING_FROM_OLDER_GOOGLE_HISTORY'});
      continue;
    }
    // Only a strictly later new transaction may be appended automatically;
    // earlier events must be reviewed, but other projects remain independent.
    const item={...current,project:projectKey,status:'synced'};
    combinedMirror.push(item);changes.push({id:item.id,action:'append',status:'synced'});
  }
  if(reviews.length)
    return Object.freeze({project:projectKey,month,status:'REVIEW_REQUIRED',
      reviews,changes:[],bindings:[],canWrite:false,approvedWrites:0,
      requiresOtherProjects:false,historyFingerprint:historical.fingerprint,
      mirrorFingerprint:stored.fingerprint});
  const view=historical.entries.map(item=>({
    values:item.values.slice(),origin:'HISTORY',
    sourceId:'HISTORIC_ROW_'+item.sheetRow,googleRow:item.sheetRow
  }));
  for(const item of combinedMirror){
    if(item.status.startsWith('history')){
      const index=view.findIndex(r=>r.googleRow===Number(item.status.split(':')[1]));
      if(index<0)fail('Mirror gắn ID không có dòng lịch sử.');
      if(item.status.startsWith('historyUpdated:'))view[index].values=item.values.slice();
      view[index].sourceId=item.id;
    }else view.push({values:item.values.slice(),origin:'CASH_CONTROL',sourceId:item.id});
  }
  const historySize=historical.entries.length;
  const preserved=view.slice(0,historySize);
  const extras=view.slice(historySize).sort((a,b)=>
    a.values[0].localeCompare(b.values[0])||a.sourceId.localeCompare(b.sourceId));
  const rows=[...preserved,...extras];let balance=historical.openingBalance;
  const calculated=rows.map((entry,i)=>{
    const index=i+2;
    balance=round(balance+net(entry.values));
    const formula=i?'=O'+(index-1)+'+G'+index+'-SUM(H'+index+':N'+index+')':
      '=$R$2+G2-SUM(H2:N2)';
    return {...entry,balance,formula,cells:[...entry.values,'',entry.origin,entry.sourceId,
      i===0?historical.openingBalance:'']};
  });
  // Source/history/rows are still READ-ONLY evidence: a later authorized
  // adapter must check original and mirror revisions before any write.
  return Object.freeze({project:projectKey,month,status:'CANDIDATES_ONLY',
    changes,bindings,mirrorNext:combinedMirror,viewRows:calculated,
    historicalOpening:historical.openingBalance,
    historicalClosing:historical.closingBalance,closingBalance:balance,
    historyFingerprint:historical.fingerprint,
    mirrorFingerprint:stored.fingerprint,
    requiresOtherProjects:false,canWrite:false,approvedWrites:0});
}
module.exports={planMonth,auditHistory,parseValues,net,idSignature,sha};
