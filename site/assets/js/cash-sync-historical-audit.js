'use strict';
// Shared offline historical A:N audit for Google Sheets legacy ledgers.
// Read-only; never implies Cash Control source completeness or write approval.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSyncHistoricalAudit=api;
})(typeof window!=='undefined'?window:null,function(){
  const validDate=(y,m,d)=> {
    const date=new Date(Date.UTC(y,m-1,d));
    return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
  };
  function dateValue(v){
    if(typeof v==='number'&&Number.isInteger(v)&&v>=20000&&v<100000){
      const date=new Date(Date.UTC(1899,11,30)+v*86400000);
      return date.toISOString().slice(0,10);
    }
    if(typeof v!=='string')return '';
    const t=v.trim();
    let m=/^(20\d{2})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if(m&&validDate(+m[1],+m[2],+m[3]))
      return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    m=/^(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})$/.exec(t);
    if(m&&validDate(+m[3],+m[2],+m[1]))
      return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    return '';
  }
  function amount(v,blankZero=false){
    if(v===''||v===null||v===undefined)
      return blankZero?0:NaN;
    if(typeof v==='number')return Number.isFinite(v)?v:NaN;
    if(typeof v!=='string')return NaN;
    let s=v.trim().replace(/\s/g,'');
    if(!s)return blankZero?0:NaN;
    // Allow currency formatting only if grouping is unambiguous.
    if(/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s))s=s.replace(/,/g,'');
    else if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s))
      s=s.replace(/\./g,'').replace(',','.');
    else if(/^-?\d+(?:\.\d+)?$/.test(s)){}
    else if(/^-?\d+,\d+$/.test(s))s=s.replace(',','.');
    else return NaN;
    const n=Number(s);
    return Number.isFinite(n)?n:NaN;
  }
  const rounded=v=>Math.round(v*1e6)/1e6;
  function audit(rows){
    if(!Array.isArray(rows)||rows.length>20000)throw Error('Invalid historical snapshot');
    let count=0,previous=null,firstDate='',lastDate='',opening=null,closing=null;
    let missingBalance=0,invalidMoney=0,continuityErrors=0;
    let roundingDifferences=0,monthTransitions=0,nonMonotonicDates=0;
    const examples=[];
    const issue=(kind,row,detail)=>{
      if(examples.length<8)examples.push({kind,row,detail});
    };
    let previousDate='';
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(!Array.isArray(row))continue;
      const date=dateValue(row[0]);
      if(!date)continue;
      count++;
      if(!firstDate)firstDate=date;
      lastDate=date;
      if(previousDate&&date<previousDate){nonMonotonicDates++;issue('date-order',i+1,date)}
      if(previousDate&&date.slice(0,7)!==previousDate.slice(0,7))
        monthTransitions++;
      previousDate=date;
      const amounts=Array.from({length:7},(_,j)=>amount(row[j+6],true));
      if(amounts.some(n=>!Number.isFinite(n))){
        invalidMoney++;issue('invalid-money',i+1,'G:M contains invalid amount');
        previous=null;continue;
      }
      const recorded=amount(row[13]);
      if(!Number.isFinite(recorded)){
        missingBalance++;issue('missing-balance',i+1,'N is blank/invalid');
        previous=null;continue;
      }
      const net=rounded(amounts[0]-amounts.slice(1).reduce((s,n)=>s+n,0));
      if(opening===null)opening=rounded(recorded-net);
      if(previous!==null){
        const expected=rounded(previous+net);
        const diff=rounded(recorded-expected);
        if(Math.abs(diff)>0.000001){
          if(Math.abs(diff)<=0.5){
            roundingDifferences++;issue('rounding',i+1,diff);
          }else{
            continuityErrors++;issue('balance',i+1,diff);
          }
        }
      }
      previous=recorded;
      closing=recorded;
    }
    const blank=count===0&&rows.every(r=>!Array.isArray(r)||
      r.every(v=>String(v??'').trim()===''));
    // A missing balance in every date row usually means column N is not
    // the ledger's balance column. Flag layout, not a proven balance error.
    // Date reversals may reflect manual ordering or month sections; report
    // separately from financial arithmetic errors without accepting the ledger.
    const missingEveryBalance=count>0&&missingBalance===count;
    const financialIssues=invalidMoney+continuityErrors+roundingDifferences;
    const status=blank?'blank-tab':count===0||missingEveryBalance?
      'unsupported-layout':financialIssues||missingBalance?
      'needs-financial-review':nonMonotonicDates?
      'review-date-order':'internally-consistent';
    return Object.freeze({status,transactionRows:count,firstDate,lastDate,
      openingBalance:opening,closingBalance:closing,monthTransitions,
      invalidMoney,missingBalance,continuityErrors,roundingDifferences,
      nonMonotonicDates,missingEveryBalance,financialIssues,examples,
      historyOnly:true,canWrite:false});
  }
  return Object.freeze({audit,dateValue,amount});
});
