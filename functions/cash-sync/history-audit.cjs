'use strict';
/*
 * READ-ONLY historical accounting verification.
 * Exact transaction reconciliation mirrors the already-tested Cash Control
 * legacy-ledger identity: date + seven amount columns + contract + IPC +
 * approved payroll label equivalences. No inference of expense categories.
 *
 * Never treats a matching total as evidence that every transaction matches.
 */
const {createHash}=require('node:crypto');
const MAX_ROWS=10000;
const EPSILON=1e-6;
const LABEL_ALIASES=new Map([
  ['LƯƠNGTRUNGQUỐC','PAYROLL_CN'],['中方员工工资','PAYROLL_CN'],
  ['TIỀNĂN','PAYROLL_MEAL'],['伙食费','PAYROLL_MEAL'],
  ['LƯƠNGVIỆTNAM','PAYROLL_VN'],['越籍员工工资','PAYROLL_VN'],
  ['BẢOHIỂMTQ','PAYROLL_CN_INSURANCE'],['中国社保','PAYROLL_CN_INSURANCE'],
  ['BẢOHIỂMVN','PAYROLL_VN_INSURANCE'],['越南社保','PAYROLL_VN_INSURANCE'],
  ['PHÍCÔNGĐOÀN','PAYROLL_UNION'],['工会经费','PAYROLL_UNION']
]);
function normalizeDate(input){
  let value;
  if(typeof input==='number'){
    if(!Number.isFinite(input)||input<1||input>200000)throw Error('Invalid Sheets date serial.');
    value=new Date(Date.UTC(1899,11,30)+Math.floor(input)*86400000).toISOString().slice(0,10);
  }else{
    const text=String(input??'').trim();
    const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const local=text.match(/^(\d{1,2})[\/-\.](\d{1,2})[\/-\.](\d{4})$/);
    if(iso)value=text;
    else if(local)value=local[3]+'-'+local[2].padStart(2,'0')+'-'+local[1].padStart(2,'0');
    else return null;
  }
  const valid=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(valid.getTime())||valid.toISOString().slice(0,10)!==value)
    throw Error('Impossible date in historical ledger.');
  return value;
}
function money(value){
  if(value==null||value==='')return 0;
  if(typeof value==='number')return Number.isFinite(value)?value:NaN;
  const str=String(value).trim().replace(/\s/g,'');
  if(!str)return 0;
  const comma=str.lastIndexOf(','),dot=str.lastIndexOf('.');
  const norm=comma>dot?str.replace(/\./g,'').replace(',','.'):str.replace(/,/g,'');
  const num=Number(norm);
  return Number.isFinite(num)?num:NaN;
}
function moneyKey(value){
  const n=money(value);
  return Number.isFinite(n)?String(Math.round(n*1e6)/1e6):'INVALID';
}
const label=value=>String(value??'').normalize('NFKC').trim().toUpperCase()
  .replace(/\s+/g,'').replace(/[‐‑‒–—−]/g,'-');
const companyKey=(company,contract,ipc)=>{
  const name=label(company);
  if(label(contract)||label(ipc))return name;
  return LABEL_ALIASES.get(name)||name;
};
function fingerprint(values){
  if(!Array.isArray(values)||values.length<13)throw Error('Incomplete fingerprint fields.');
  const d=normalizeDate(values[0]);
  if(!d)throw Error('Source row is missing a date.');
  const keys=values.slice(6,13).map(moneyKey);
  if(keys.some(key=>key==='INVALID'))throw Error('Invalid source money.');
  return [d,...keys,label(values[2]),label(values[4]),
    companyKey(values[1],values[2],values[4])].join('|');
}
const round=n=>Math.round(n*1e6)/1e6;
function verifyHistory(rows,formulas){
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS||
     !Array.isArray(formulas)||formulas.length>MAX_ROWS)
    throw Error('Missing or oversized historical TEST ledger or formulas.');
  const txns=[];let previous=null;let opening=null;
  for(let i=0;i<rows.length;i++){
    const row=rows[i]||[];
    if(!Array.isArray(row)||row.length>14)throw Error('Unexpected history row shape.');
    const date=normalizeDate(row[0]);
    if(!date)continue; // historical title, headings, subtotal or separator
    const amounts=Array.from({length:7},(_,k)=>money(row[6+k]));
    const closing=money(row[13]);
    if(row[13]==null||row[13]===''||
       [...amounts,closing].some(n=>!Number.isFinite(n)))
      throw Error('Missing numeric amount/balance in historic row '+(i+1));
    const flow=round(amounts[0]-amounts.slice(1).reduce((x,y)=>x+y,0));
    const formula=String(formulas[i]?.[0]??'').trim();
    if(!formula.startsWith('='))throw Error('Missing historical balance formula at N'+(i+1));
    if(previous){
      if(date<previous.date)throw Error('Historic dates not ordered at row '+(i+1));
      if(Math.abs(round(previous.closing+flow)-closing)>EPSILON)
        throw Error('Historic running balance mismatch at N'+(i+1));
      // Require next row to actually reference prior transaction's balance,
      // not merely to have a syntactically valid formula.
      const referenced=new RegExp('\\bN\\$?'+previous.sheetRow+'\\b','i');
      if(!referenced.test(formula))throw Error('Historic balance formula does not reference preceding transaction N'+previous.sheetRow);
    }else opening=round(closing-flow);
    txns.push({date,values:[
      date,...Array.from({length:5},(_,k)=>String(row[1+k]??'')),...amounts
    ],sheetRow:i+1,closing});
    previous={date,closing,sheetRow:i+1};
  }
  if(!txns.length)throw Error('No historical dated transactions found.');
  return {transactions:txns,count:txns.length,opening,
    closing:txns.at(-1).closing,complete:true,
    digest:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}
module.exports={MAX_ROWS,EPSILON,LABEL_ALIASES,normalizeDate,money,moneyKey,
  label,companyKey,fingerprint,verifyHistory};
