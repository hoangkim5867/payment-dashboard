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
  // FOXCONN historical workbook has a separate 进口税+增值税 expense column.
  // Identify its position AND the running-balance position from each section's
  // actual header; never assume all monthly sections use the same template.
  const normHeader=v=>String(v??'').replace(/[\\s　:：()（）+＋\\/_-]/g,'').toLowerCase();
  const isTax=v=>/进口税/.test(String(v??''))&&/增值税/.test(String(v??''));
  const isBalance=v=>/^(?:余额|结余|累计余额|期末余额|资金余额|结存|剩余金额|balance|runningbalance)$/.test(normHeader(v));
  function foxconnHeader(row){
    if(!Array.isArray(row)||dateValue(row[0]))return null;
    const taxCols=[],balanceCols=[];
    for(let i=0;i<Math.min(row.length,32);i++){
      if(isTax(row[i]))taxCols.push(i);
      if(isBalance(row[i]))balanceCols.push(i);
    }
    if(!taxCols.length)return null;
    // Reject ambiguous, partial and unexpected layouts. Original history
    // remains untouched; Admin must inspect if a reliable header is absent.
    if(taxCols.length!==1||balanceCols.length>1)return {invalid:true};
    const taxIndex=taxCols[0],balanceIndex=balanceCols.length?balanceCols[0]:null;
    // FOXCONN uses a split header: row 3 is the category banner
    // and row 4 has N: 进口税+增值税; the balance heading is not present.
    // Never infer the balance column from position alone.
    if(taxIndex<7||taxIndex>30||
       (balanceIndex!==null&&(taxIndex>=balanceIndex||balanceIndex<14||
       balanceIndex>31)))return {invalid:true};
    return {taxIndex,balanceIndex,requiresBalanceSelection:balanceIndex===null};
  }
  function audit(rows,options={}){
    const project=String(options.project||'').trim().toUpperCase();
    const foxconn=project==='FOXCONN';
    if(!Array.isArray(rows)||rows.length>20000)throw Error('Invalid historical snapshot');
    let count=0,previous=null,firstDate='',lastDate='',opening=null,closing=null;
    let missingBalance=0,invalidMoney=0,continuityErrors=0;
    let roundingDifferences=0,monthTransitions=0,nonMonotonicDates=0;
    let taxColumnsDetected=0,taxRows=0,taxTotal=0,layoutErrors=0;
    let activeLayout=null;
    const probeBalanceIndex=foxconn&&options.probeBalanceIndex===14?14:null;
    let provisionalBalanceRows=0;
    const examples=[];
    const issue=(kind,row,detail)=>{
      if(examples.length<8)examples.push({kind,row,detail});
    };
    let previousDate='';
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(!Array.isArray(row))continue;
      const date=dateValue(row[0]);
      if(!date){
        if(foxconn){
          const detected=foxconnHeader(row);
          if(detected){
            activeLayout=detected;
            if(detected.invalid){layoutErrors++;issue('tax-layout',i+1,'Ambiguous tax/balance header')}
            else taxColumnsDetected++;
          }
        }
        continue;
      }
      count++;
      if(!firstDate)firstDate=date;
      lastDate=date;
      if(previousDate&&date<previousDate){nonMonotonicDates++;issue('date-order',i+1,date)}
      if(previousDate&&date.slice(0,7)!==previousDate.slice(0,7))
        monthTransitions++;
      previousDate=date;
      // Each historical section is read using its own verified header.
      const useTax=foxconn&&activeLayout&&!activeLayout.invalid;
      if(foxconn&&activeLayout?.invalid){
        layoutErrors++;issue('tax-layout',i+1,'Unknown tax column layout');
        previous=null;continue;
      }
      if(foxconn&&(!activeLayout||
         (activeLayout.requiresBalanceSelection&&probeBalanceIndex===null))){
        previous=null;continue;
      }
      // An explicit O-column probe can test the arithmetic, not certify that
      // O is the balance. The original header has no balance label.
      const balanceIndex=useTax&&activeLayout.requiresBalanceSelection?
        probeBalanceIndex:useTax?activeLayout.balanceIndex:13;
      if(useTax&&activeLayout.requiresBalanceSelection)provisionalBalanceRows++;
      // 7 original categories: G income; H:M six expenses.
      // An inserted import-tax/VAT column displaces the later expenses.
      const indices=useTax?
        [6,...Array.from({length:6},(_,k)=>k+7>=activeLayout.taxIndex?k+8:k+7)]:
        [6,7,8,9,10,11,12];
      if(useTax&&indices.includes(balanceIndex)){
        layoutErrors++;issue('tax-layout',i+1,'Balance overlaps expense categories');
        previous=null;continue;
      }
      const amounts=indices.map(index=>amount(row[index],true));
      const tax=useTax?amount(row[activeLayout.taxIndex],true):0;
      if(amounts.some(n=>!Number.isFinite(n))||!Number.isFinite(tax)){
        invalidMoney++;issue('invalid-money',i+1,'Invalid expense/tax amount');
        previous=null;continue;
      }
      if(useTax){taxRows++;taxTotal=rounded(taxTotal+tax)}
      const recorded=amount(row[balanceIndex]);
      if(!Number.isFinite(recorded)){
        missingBalance++;issue('missing-balance',i+1,'N is blank/invalid');
        previous=null;continue;
      }
      const net=rounded(amounts[0]-amounts.slice(1).reduce((s,n)=>s+n,0)-tax);
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
    const taxLayoutUnverified=foxconn&&(layoutErrors>0||
      taxColumnsDetected===0||activeLayout?.requiresBalanceSelection);
    const status=blank?'blank-tab':taxLayoutUnverified?
      (provisionalBalanceRows>0&&layoutErrors===0&&taxColumnsDetected>0?
        'provisional-balance-review':'unsupported-tax-layout'):
      count===0||missingEveryBalance?
      'unsupported-layout':financialIssues||missingBalance?
      'needs-financial-review':nonMonotonicDates?
      'review-date-order':'internally-consistent';
    return Object.freeze({status,transactionRows:count,firstDate,lastDate,
      openingBalance:opening,closingBalance:closing,monthTransitions,
      invalidMoney,missingBalance,continuityErrors,roundingDifferences,
      nonMonotonicDates,missingEveryBalance,financialIssues,
      taxColumnsDetected,taxRows,taxTotal,layoutErrors,provisionalBalanceRows,
      balanceColumnUnconfirmed:foxconn&&!!activeLayout?.requiresBalanceSelection,
      taxColumn:foxconn&&activeLayout&&!activeLayout.invalid?activeLayout.taxIndex+1:null,
      examples,
      historyOnly:true,canWrite:false});
  }
  // Header-only diagnostics for atypical FOXCONN layouts. No financial
  // cells are exposed, persisted or transmitted by this helper.
  function diagnoseHeaders(rows){
    if(!Array.isArray(rows))return [];
    const output=[];
    for(let i=0;i<rows.length&&output.length<12;i++){
      const row=rows[i];
      if(!Array.isArray(row)||dateValue(row[0]))continue;
      const columns=[];
      for(let j=0;j<Math.min(32,row.length);j++){
        const value=row[j];
        if(typeof value!=='string')continue;
        const v=value.trim();
        if(!v||v.length>55||/^[-+]?\\d[\\d.,\\s]*$/.test(v))continue;
        if(!/(税|增值|进口|余额|结余|结存|balance|income|支出|收入|分包|材料|间接|日期|项目)/i.test(v))continue;
        let k=j+1,label='';
        while(k){k--;label=String.fromCharCode(65+k%26)+label;k=Math.floor(k/26)}
        columns.push(label+': '+v.slice(0,45));
      }
      if(columns.length)output.push({row:i+1,columns:columns.slice(0,16)});
    }
    return output;
  }
  function foxconnBalanceCandidates(rows){
    if(!Array.isArray(rows))return [];
    const transactionRows=rows.filter(row=>Array.isArray(row)&&!!dateValue(row[0]));
    if(!transactionRows.length)return [];
    // Count numeric coverage only. No amounts, cross-project data or IDs escape.
    return Array.from({length:10},(_,i)=>i+14).map(index=>{
      const numeric=transactionRows.filter(row=>Number.isFinite(amount(row[index]))).length;
      let n=index+1,column='';
      while(n){n--;column=String.fromCharCode(65+n%26)+column;n=Math.floor(n/26)}
      return {column,numericRows:numeric,totalRows:transactionRows.length};
    }).filter(x=>x.numericRows>0);
  }
  return Object.freeze({audit,dateValue,amount,diagnoseHeaders,foxconnBalanceCandidates});
});
