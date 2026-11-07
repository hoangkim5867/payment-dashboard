'use strict';
// Pure, fail-closed comparison of historical PHU HUNG rows.
// This module never connects to a data source and never mutates a spreadsheet.
function normDate(v){
  if(typeof v==='number'&&Number.isFinite(v)){
    const millis=Date.UTC(1899,11,30)+Math.floor(v)*86400000;
    return new Date(millis).toISOString().slice(0,10);
  }
  const s=String(v??'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  const match=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  return match?match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0'):'';
}
function money(v){
  if(typeof v==='number'&&Number.isFinite(v))return v;
  const s=String(v??'').trim().replace(/\s/g,'');
  if(!s)return NaN;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  const n=Number(comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,''));
  return Number.isFinite(n)?n:NaN;
}
function scanRows(input){
  if(!Array.isArray(input))throw Error('Không đọc được dòng lịch sử.');
  const rows=[];
  for(let i=0;i<input.length;i++){
    const raw=input[i]||[],date=normDate(raw[0]);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    if(raw.length<14)throw Error('Lịch sử thiếu cột tại hàng '+(i+1));
    // Income/expense cells in the original manually-kept sheet may be blank (= 0).
    // The running balance column N must be present and numeric.
    const amounts=raw.slice(6,13).map(x=>String(x??'').trim()===''?0:money(x));
    amounts.push(money(raw[13]));
    if(amounts.length!==8||amounts.some(x=>!Number.isFinite(x)))
      throw Error('Lịch sử có giá trị tiền/số dư không hợp lệ tại hàng '+(i+1));
    rows.push({sheetRow:i+1,values:[date,...raw.slice(1,6).map(x=>String(x??'').trim()),...amounts]});
  }
  if(!rows.length)throw Error('Không tìm thấy giao dịch lịch sử để đối chiếu.');
  if(rows.length>10000)throw Error('Lịch sử vượt giới hạn 10.000 dòng.');
  return rows;
}
function compareOriginalWithTest(original,test){
  const orig=scanRows(original),copy=scanRows(test);
  const mismatches=[];
  for(let i=0;i<Math.max(orig.length,copy.length);i++){
    const a=orig[i],b=copy[i];
    if(!a||!b||a.values.some((v,j)=>typeof v==='number'
        ?typeof b.values[j]!=='number'||Math.abs(v-b.values[j])>0.000001
        :v!==b.values[j])){
      if(mismatches.length<5)mismatches.push({originalRow:a?.sheetRow??null,testRow:b?.sheetRow??null});
    }
  }
  return {
    matched:orig.length===copy.length&&mismatches.length===0,
    originalRows:orig.length,testRows:copy.length,
    originalClosing:orig.at(-1).values[13],
    testClosing:copy.at(-1).values[13],
    mismatches
  };
}
module.exports={normDate,money,scanRows,compareOriginalWithTest};
