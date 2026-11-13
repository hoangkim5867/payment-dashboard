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
    m=/^(\d{1,2})([-\/.])(\d{1,2})\2(20\d{2})$/.exec(t);
    if(m&&validDate(+m[4],+m[3],+m[1]))
      return m[4]+'-'+m[3].padStart(2,'0')+'-'+m[1].padStart(2,'0');
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
  // Sheets may return invisible Unicode marks or an appended currency/unit
  // with a visual 余额 header. Normalize text, never infer by O's position.
  const normHeader=v=>String(v??'').normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD\uFE0E\uFE0F]/g,'')
    .replace(/[\s　:：()（）+＋\\/_-]/g,'').toLowerCase();
  const isTax=v=>/进口税/.test(String(v??''))&&/增值税/.test(String(v??''));
  const isBalance=v=>{
    const s=normHeader(v);
    return /^(?:余额|余額|結余|结余|累计余额|期末余额|资金余额|结存|剩余金额|balance|runningbalance)(?:vnd|đ|元|人民币|越南盾)?$/.test(s);
  };
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
    const financialExamples=[];
    const dateOrderExamples=[];
    let previousDateRow=0;
    const issue=(kind,row,detail)=>{
      if((kind==='balance'||kind==='rounding'||kind==='missing-balance'||kind==='invalid-money')&&financialExamples.length<60)
        financialExamples.push({kind,row,detail});
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
            // FOXCONN's merged section banner has O: 余额 on row 3, while
            // N: 进口税+增值税 is on row 4. Confirm an adjacent balance header
            // by its TEXT, not by O's position or arithmetic alone.
            if(!detected.invalid&&detected.balanceIndex===null){
              const nearby=[];
              for(let back=1;back<=2&&i-back>=0;back++){
                const prior=rows[i-back];
                if(!Array.isArray(prior)||dateValue(prior[0]))break;
                for(let col=0;col<Math.min(prior.length,32);col++)
                  if(isBalance(prior[col]))nearby.push(col);
              }
              if(nearby.length===1&&nearby[0]>detected.taxIndex&&nearby[0]>=14)
                detected.balanceIndex=nearby[0];
              if(nearby.length>1)detected.invalid=true;
              detected.requiresBalanceSelection=detected.balanceIndex===null;
            }
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
      if(previousDate&&date<previousDate){
        nonMonotonicDates++;issue('date-order',i+1,date);
        if(dateOrderExamples.length<100)dateOrderExamples.push({
          previousRow:previousDateRow,previousDate,dateRow:i+1,date,
          crossesMonth:date.slice(0,7)!==previousDate.slice(0,7)
        });
      }
      if(previousDate&&date.slice(0,7)!==previousDate.slice(0,7))
        monthTransitions++;
      previousDate=date;
      previousDateRow=i+1;
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
    const status=project==='S19-3'&&count===0?'new-project-no-transactions':
      blank?'blank-tab':taxLayoutUnverified?
      (provisionalBalanceRows>0&&layoutErrors===0&&taxColumnsDetected>0?
        'provisional-balance-review':'unsupported-tax-layout'):
      count===0||missingEveryBalance?
      'unsupported-layout':financialIssues||missingBalance?
      'needs-financial-review':nonMonotonicDates?
      'review-date-order':'internally-consistent';
    return Object.freeze({status,transactionRows:count,firstDate,lastDate,
      openingBalance:opening,closingBalance:closing,monthTransitions,
      invalidMoney,missingBalance,continuityErrors,roundingDifferences,
      nonMonotonicDates,dateOrderExamples,
      dateOrderOnly:status==='review-date-order'&&
        continuityErrors===0&&roundingDifferences===0&&
        missingBalance===0&&invalidMoney===0&&layoutErrors===0,
      missingEveryBalance,financialIssues,
      taxColumnsDetected,taxRows,taxTotal,layoutErrors,provisionalBalanceRows,
      balanceColumnUnconfirmed:foxconn&&!!activeLayout?.requiresBalanceSelection,
      taxColumn:foxconn&&activeLayout&&!activeLayout.invalid?activeLayout.taxIndex+1:null,
      examples,financialExamples,
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
  function balanceColumnCandidates(rows,start=13,end=17){
    if(!Array.isArray(rows))return [];
    const entries=rows.filter(row=>Array.isArray(row)&&!!dateValue(row[0]));
    return Array.from({length:Math.max(0,Math.min(end,32)-start+1)},(_,i)=>start+i).map(index=>{
      const numericRows=entries.filter(row=>Number.isFinite(amount(row[index]))).length;
      let n=index+1,column='';
      while(n){n--;column=String.fromCharCode(65+n%26)+column;n=Math.floor(n/26)}
      return {column,numericRows,totalRows:entries.length};
    }).filter(x=>x.numericRows>0);
  }
  // Structural counts only. Never disclose or automatically reinterpret
  // unrecognized dates; an old project with 0 recognized dates is not blank.
  function dateLayoutDiagnostic(rows){
    if(!Array.isArray(rows))return {nonemptyRows:0,validDatesByColumn:[0,0,0],
      suspectCount:0,suspectRows:[],truncatedExamples:false};
    const validDatesByColumn=[0,0,0],suspectRows=[];
    let nonemptyRows=0,suspectCount=0;
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(!Array.isArray(row)||!row.some(v=>String(v??'').trim()))continue;
      nonemptyRows++;
      for(let j=0;j<3;j++)if(dateValue(row[j]))validDatesByColumn[j]++;
      const a=row[0],raw=String(a??'').trim();
      const numeric=typeof a==='number'&&Number.isFinite(a);
      // Count EVERY date-like value that cannot be parsed, but retain only
      // eight row-number examples and never disclose original cells/amounts.
      // This count must not stop at 8: otherwise "clean" could hide omissions.
      const suspect=!dateValue(a)&&raw&&(
        numeric||/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(raw)||
        /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(raw)||
        /^\d{2,4}年\d{1,2}月\d{1,2}日?$/.test(raw));
      if(suspect){
        suspectCount++;
        if(suspectRows.length<8)suspectRows.push({row:i+1,type:numeric?'number':'text'});
      }
    }
    return {nonemptyRows,validDatesByColumn,suspectCount,suspectRows,
      truncatedExamples:suspectCount>suspectRows.length};
  }
  // Candidate reconciliation on already loaded in-memory Cash Control only.
  // A date + seven-category amount signature is NOT a unique transaction ID;
  // report ambiguous multiplicities and never authorize a write.
  function compareLoadedCashControl(rows,project,cashRows,opts={}){
    if(!Array.isArray(rows)||!Array.isArray(cashRows)||
       rows.length>20000||cashRows.length>20000)throw Error('Invalid comparison input');
    const key=String(project||'').trim().toUpperCase();
    const complete=opts.sourceComplete===true;
    if(key==='FOXCONN')return {status:'requires-tax-mapping',project,
      reason:'FOXCONN has a separate import-tax column',canWrite:false};
    const months=new Set();
    const counts=new Map(),sourceCounts=new Map();
    const historicIdentity=new Map(),sourceIdentity=new Map();
    const add=(map,id)=>map.set(id,(map.get(id)||0)+1);
    const token=(date,values)=>JSON.stringify([date,...values.map(x=>Math.round(x*1e6)/1e6)]);
    const normalize=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
    // Metadata is diagnostic only. A shared date/amount is NOT proof of the
    // same company/contract/IPC. Missing fields must remain unverified.
    const identity=(company,contractNo,ipc)=>
      [company,contractNo,ipc].map(normalize);
    const saveIdentity=(bucket,key,value)=>{
      if(!bucket.has(key))bucket.set(key,[]);
      bucket.get(key).push(value);
    };
    let historicalScope=0,invalidHistory=0,sourceScope=0,invalidSource=0;
    for(const [index,row] of rows.entries()){
      if(!Array.isArray(row))continue;
      const date=dateValue(row[0]);
      if(!date||date<'2026-10-01')continue;
      months.add(date.slice(0,7));historicalScope++;
      const values=row.slice(6,13).map(x=>amount(x,true));
      if(values.length!==7||values.some(x=>!Number.isFinite(x))){invalidHistory++;continue}
      const id=token(date,values);
      add(counts,id);
      saveIdentity(historicIdentity,id,{position:index+1,identity:identity(row[1],row[2],row[4])});
    }
    for(const [index,row] of cashRows.entries()){
      const date=dateValue(row?.date);
      if(!date||date<'2026-10-01')continue;
      sourceScope++;
      const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
      const values=fields.map(x=>amount(row[x],true));
      if(values.some(x=>!Number.isFinite(x))){invalidSource++;continue}
      const id=token(date,values);
      add(sourceCounts,id);
      saveIdentity(sourceIdentity,id,{position:index+1,identity:identity(row.company,row.contractNo,row.ipc)});
    }
    let matched=0,historicalOnly=0,cashOnly=0,ambiguous=0;
    let identityConflict=0,identityUnverified=0,identityConsistent=0;
    const sourceOnlyPositions=[],historyOnlyPositions=[],ambiguousSourcePositions=[];
    const identityConflictPositions=[],identityUnverifiedPositions=[];
    for(const key of new Set([...counts.keys(),...sourceCounts.keys()])){
      const h=counts.get(key)||0,c=sourceCounts.get(key)||0;
      matched+=Math.min(h,c);
      historicalOnly+=Math.max(0,h-c);
      cashOnly+=Math.max(0,c-h);
      const historicalRows=historicIdentity.get(key)||[],sourceRows=sourceIdentity.get(key)||[];
      // Positions are diagnostics, NOT approval to match a duplicate.
      if(!h)for(const item of sourceRows)sourceOnlyPositions.push(item.position);
      if(!c)for(const item of historicalRows)historyOnlyPositions.push(item.position);
      if(h>1||c>1){
        ambiguous+=Math.min(h,c);
        for(const item of sourceRows)ambiguousSourcePositions.push(item.position);
      }
      if(h===1&&c===1){
        const historical=historicalRows[0].identity;
        const source=sourceRows[0].identity;
        const known=historical.map((v,i)=>v&&source[i]?i:-1).filter(i=>i>=0);
        if(!known.length){identityUnverified++;identityUnverifiedPositions.push(sourceRows[0].position)}
        else if(known.some(i=>historical[i]!==source[i])){
          identityConflict++;identityConflictPositions.push(sourceRows[0].position);
        }else if(known.length===3)identityConsistent++;
        else {identityUnverified++;identityUnverifiedPositions.push(sourceRows[0].position)}
      }
    }
    return {status:!complete?'incomplete-memory-source':'candidates-only',
      project,sourceComplete:complete,historicalScope,sourceScope,matched,
      historicalOnly,cashOnly,ambiguous,identityConflict,identityUnverified,
      identityConsistent,invalidHistory,invalidSource,
      months:[...months].sort(),
      sourceOnlyPositions,historyOnlyPositions,ambiguousSourcePositions,
      identityConflictPositions,identityUnverifiedPositions,
      candidateOnly:true,canWrite:false};
  }
  // FOXCONN has a separate import-tax + VAT column N (index 13).
  // Exact numerical matches are candidates, NEVER authorization or proof of identity.
  // Do not assume that an ordinary Cash Control expense bucket is import tax.
  function compareFoxconnCandidates(historicalRows,sourceRows,opts={}){
    if(!Array.isArray(historicalRows)||!Array.isArray(sourceRows)||
       historicalRows.length>20000||sourceRows.length>20000)
      throw Error('Invalid FOXCONN snapshots');
    const startMonth=String(opts.startMonth||'2026-10');
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(startMonth))
      throw Error('Invalid month');
    const key=(date,amounts)=>JSON.stringify([date,...amounts.map(v=>Math.round(v*1e6)/1e6)]);
    const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
    const signature=(company,contractNo,ipc)=>[clean(company),clean(contractNo),clean(ipc)];
    const hMap=new Map(),sMap=new Map();
    const add=(m,k,id,position)=>m.set(k,[...(m.get(k)||[]),{id,position}]);
    let historicalScope=0,sourceScope=0,invalidHistory=0,invalidSource=0,unmappedTax=0;
    // Historical workbooks may repeat section headings with different layouts.
    // Verify N is actually the tax column for EACH dated section. No header
    // means no reliable column mapping, not an assumed numeric candidate.
    let verifiedTaxColumn=false;
    for(const [index,row] of historicalRows.entries()){
      if(!Array.isArray(row))continue;
      const d=dateValue(row[0]);
      if(!d){
        const header=foxconnHeader(row);
        if(header)verifiedTaxColumn=!header.invalid&&header.taxIndex===13&&
          (header.balanceIndex===null||header.balanceIndex===14);
        continue;
      }
      if(d.slice(0,7)<startMonth)continue;
      historicalScope++;
      if(!verifiedTaxColumn){invalidHistory++;continue}
      // Header-verified FOXCONN: G income, H:M 6 expenses, N tax; O balance.
      const values=row.slice(6,14).map(v=>amount(v,true));
      if(values.length!==8||values.some(v=>!Number.isFinite(v))){
        invalidHistory++;continue;
      }
      add(hMap,key(d,values),signature(row[1],row[2],row[4]),index+1);
    }
    for(const [index,row] of sourceRows.entries()){
      const d=dateValue(row?.date);
      if(!d||d.slice(0,7)<startMonth)continue;
      sourceScope++;
      // A missing dedicated tax field MUST NOT be interpreted as zero.
      // A present-but-blank tax field is not a verified zero.
      // The read-only projection must explicitly provide a finite number.
      if(!Object.hasOwn(row,'importTaxVat')||
         row.importTaxVat===null||row.importTaxVat===undefined||
         String(row.importTaxVat).trim()===''){
        unmappedTax++;continue;
      }
      const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
      const values=[...fields.map(f=>amount(row[f],true)),amount(row.importTaxVat)];
      if(values.some(v=>!Number.isFinite(v))){invalidSource++;continue}
      add(sMap,key(d,values),signature(row.company,row.contractNo,row.ipc),index+1);
    }
    let candidates=0,historyOnly=0,sourceOnly=0,ambiguous=0;
    let identityConflict=0,identityUnverified=0,identityConsistent=0;
    // Position-only diagnostics, never disclose amounts or infer which
    // duplicate is new when identical date/category signatures repeat.
    const sourceOnlyPositions=[],historyOnlyPositions=[];
    const ambiguousSourcePositions=[],identityConflictPositions=[];
    const identityUnverifiedPositions=[];
    for(const k of new Set([...hMap.keys(),...sMap.keys()])){
      const a=hMap.get(k)||[],b=sMap.get(k)||[];
      const matches=Math.min(a.length,b.length);
      candidates+=matches;
      if(a.length>1||b.length>1){
        ambiguous+=matches;
        for(const item of b)if(ambiguousSourcePositions.length<20)
          ambiguousSourcePositions.push(item.position);
      }
      // Only label an exact source row as missing when the signature is
      // entirely absent from Google; excess duplicates are unresolved.
      if(a.length===0)for(const item of b)if(sourceOnlyPositions.length<20)
        sourceOnlyPositions.push(item.position);
      if(b.length===0)for(const item of a)if(historyOnlyPositions.length<20)
        historyOnlyPositions.push(item.position);
      historyOnly+=Math.max(0,a.length-b.length);
      sourceOnly+=Math.max(0,b.length-a.length);
      if(a.length===1&&b.length===1){
        const known=a[0].id.map((x,i)=>x&&b[0].id[i]?i:-1).filter(i=>i>=0);
        if(known.some(i=>a[0].id[i]!==b[0].id[i])){
          identityConflict++;
          if(identityConflictPositions.length<20)identityConflictPositions.push(b[0].position);
        }else if(known.length===3)identityConsistent++;
        else{
          identityUnverified++;
          if(identityUnverifiedPositions.length<20)identityUnverifiedPositions.push(b[0].position);
        }
      }
    }
    return Object.freeze({project:'FOXCONN',status:unmappedTax?
      'blocked-tax-mapping':'candidates-only',historicalScope,sourceScope,
      candidates,historyOnly,sourceOnly,ambiguous,unmappedTax,
      identityConflict,identityUnverified,identityConsistent,
      invalidHistory,invalidSource,
      // Cash positions refer to the read-only projected source array (1-based);
      // Google positions are actual worksheet row numbers (1-based).
      sourceOnlyPositions,historyOnlyPositions,ambiguousSourcePositions,
      identityConflictPositions,identityUnverifiedPositions,
      sourceComplete:false,identityVerified:false,canWrite:false});
  }
  // Identify one-to-one Payment candidates within a collided numeric signature.
  // Multiple historic rows or sources with the same HĐ/IPC remain unresolved.
  // This is a read-only candidate result, never proof of record identity.
  function resolvePaymentCollisionCandidates(historicalRows,sourceRows,matched,recordsById){
    if(!Array.isArray(historicalRows)||!Array.isArray(sourceRows)||
       historicalRows.length>20000||sourceRows.length>20000)
      throw Error('Invalid candidate input');
    const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
    const numerical=(date,values)=>JSON.stringify([date,...values.map(rounded)]);
    const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable','importTaxVat'];
    const historyByKey=new Map(),sourceByKey=new Map();
    const add=(map,k,row)=>map.set(k,[...(map.get(k)||[]),row]);
    let taxHeaderValid=false;
    for(const [index,row] of historicalRows.entries()){
      if(!Array.isArray(row))continue;
      const date=dateValue(row[0]);
      if(!date){
        const header=foxconnHeader(row);
        if(header)taxHeaderValid=!header.invalid&&header.taxIndex===13&&
          (header.balanceIndex===null||header.balanceIndex===14);
        continue;
      }
      if(date<'2026-10-01'||!taxHeaderValid)continue;
      const values=row.slice(6,14).map(v=>amount(v,true));
      if(values.length!==8||values.some(v=>!Number.isFinite(v)))continue;
      add(historyByKey,numerical(date,values),{
        position:index+1,contract:norm(row[2]),ipc:norm(row[4])
      });
    }
    const target=new Set(matched?.ambiguousSourcePositions||[]);
    for(const [index,row] of sourceRows.entries()){
      const position=index+1,date=dateValue(row?.date);
      // Include every loaded Payment row in uniqueness checks, not only flagged rows.
      // A non-flagged duplicate must prevent a false one-to-one candidate.
      if(!date||date<'2026-10-01')continue;
      if(classifyCashSource(row,recordsById).kind!=='payment')continue;
      const values=fields.map(f=>amount(row?.[f],true));
      if(!Object.hasOwn(row,'importTaxVat')||values.some(v=>!Number.isFinite(v)))continue;
      add(sourceByKey,numerical(date,values),{
        position,contract:norm(row.contractNo),ipc:norm(row.ipc)
      });
    }
    const supported=[],unresolved=[];
    for(const [key,items] of sourceByKey){
      const historic=historyByKey.get(key)||[];
      for(const item of items){
        if(!target.has(item.position))continue;
        if(!item.contract||!item.ipc){unresolved.push(item.position);continue}
        const sMatches=items.filter(x=>x.contract===item.contract&&x.ipc===item.ipc);
        const hMatches=historic.filter(x=>x.contract===item.contract&&x.ipc===item.ipc);
        if(sMatches.length===1&&hMatches.length===1)
          supported.push({sourcePosition:item.position,googleRow:hMatches[0].position});
        else unresolved.push(item.position);
      }
    }
    return Object.freeze({
      supported,unresolved,
      supportedCount:supported.length,
      candidateOnly:true,sourceComplete:false,canWrite:false
    });
  }
  // Conservative non-Payment counterpart candidates using the same already
  // downloaded worksheet. A one-to-one numeric signature plus textual
  // description supports a review candidate, not an immutable transaction ID.
  function resolveFoxconnNonPaymentCandidates(historicalRows,sourceRows,matched,recordsById){
    if(!Array.isArray(historicalRows)||!Array.isArray(sourceRows)||
       historicalRows.length>20000||sourceRows.length>20000)
      throw Error('Invalid non-Payment candidate input');
    const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
    const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable','importTaxVat'];
    const key=(date,values)=>JSON.stringify([date,...values.map(rounded)]);
    const history=new Map(),source=new Map();
    const append=(map,k,item)=>map.set(k,[...(map.get(k)||[]),item]);
    let taxHeaderValid=false;
    for(const [i,row] of historicalRows.entries()){
      if(!Array.isArray(row))continue;
      const date=dateValue(row[0]);
      if(!date){
        const head=foxconnHeader(row);
        if(head)taxHeaderValid=!head.invalid&&head.taxIndex===13&&
          (head.balanceIndex===null||head.balanceIndex===14);
        continue;
      }
      if(date<'2026-10-01'||!taxHeaderValid)continue;
      const values=row.slice(6,14).map(x=>amount(x,true));
      if(values.length!==8||values.some(v=>!Number.isFinite(v)))continue;
      append(history,key(date,values),{position:i+1,description:norm(row[3]),type:norm(row[5])});
    }
    const flagged=new Set([
      ...(matched?.identityConflictPositions||[]),
      ...(matched?.identityUnverifiedPositions||[])
    ]);
    for(const [i,row] of sourceRows.entries()){
      const position=i+1,date=dateValue(row?.date);
      // Count even unflagged source rows when determining a unique counterpart.
      if(!date||date<'2026-10-01')continue;
      const classification=classifyCashSource(row,recordsById);
      if(!['personnel','tax-or-aggregate','receipt'].includes(classification.kind))continue;
      if(!Object.hasOwn(row,'importTaxVat')||
         row.importTaxVat==null||String(row.importTaxVat).trim()==='')continue;
      const values=fields.map(k=>amount(row[k],true));
      if(values.some(v=>!Number.isFinite(v)))continue;
      append(source,key(date,values),{position,kind:classification.kind,
        description:norm(row.content),type:norm(row.type)});
    }
    // Cross-language labels can differ while representing the same payroll,
    // tax or receipt period. This supports a REVIEW CANDIDATE only, never an ID.
    const period=text=>{
      const zh=/(20\d{2})年(0?[1-9]|1[0-2])月/.exec(text);
      const vi=/(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})/.exec(text);
      return zh?zh[1]+'-'+zh[2].padStart(2,'0'):
        vi?vi[2]+'-'+vi[1].padStart(2,'0'):'';
    };
    const quarter=text=>{
      const zh=/(20\d{2})年(?:第)?([1-4])季度/.exec(text);
      const vi=/(?:QUÝ|QUY)\s*([1-4])\s*\/\s*(20\d{2})/.exec(text);
      return zh?zh[1]+'-Q'+zh[2]:vi?vi[2]+'-Q'+vi[1]:'';
    };
    const semantic=(kind,text)=>{
      const names={
        personnel:[
          ['salary',/LƯƠNG|工资/],
          ['insurance',/BẢO HIỂM|社保|保险/],
          ['union',/CÔNG ĐOÀN|工会/]
        ],
        'tax-or-aggregate':[['pit',/THUẾ TNCN|THUẾ THU NHẬP CÁ NHÂN|个人所得税/]],
        receipt:[['receipt',/THU TIỀN|内部结算|业主收款/]]
      };
      const match=(names[kind]||[]).filter(([,re])=>re.test(text));
      if(match.length!==1)return '';
      const category=match[0][0];
      if(category==='pit'){const q=quarter(text);return q?category+':'+q:''}
      if(category==='receipt'){
        const ipc=/\bIPC\s*0*([0-9]+)\b/.exec(text);
        return ipc?category+':IPC'+Number(ipc[1]):'';
      }
      const p=period(text);
      return p?category+':'+p:'';
    };
    const supported=[],unresolved=[],numericOnly=[],semanticCandidates=[];
    for(const [k,items] of source){
      const candidates=history.get(k)||[];
      for(const item of items){
        if(!flagged.has(item.position))continue;
        // Date + amount bucket only is a NON-IDENTITY clue. Reveal its Google
        // row to help investigate translated/renamed descriptions, but never
        // upgrade it to a verified counterpart or grant writing.
        const pairs=candidates.filter(h=>(item.description&&h.description===item.description)||
          (item.type&&h.type===item.type&&item.description&&h.description&&
           (h.description.includes(item.description)||item.description.includes(h.description))));
        const sourceSemantic=semantic(item.kind,item.description+' '+item.type);
        const semanticMatches=candidates.filter(h=>sourceSemantic&&
          semantic(item.kind,h.description+' '+h.type)===sourceSemantic);
        if(items.length===1&&candidates.length===1&&pairs.length===1){
          supported.push({sourcePosition:item.position,googleRow:pairs[0].position,
            kind:item.kind});
        }else if(items.length===1&&candidates.length===1&&
                  semanticMatches.length===1){
          // A translated name plus an exact period/IPC is useful evidence,
          // but never upgrades the reconciliation or authorizes a write.
          semanticCandidates.push({sourcePosition:item.position,
            googleRow:semanticMatches[0].position,kind:item.kind,
            semanticKey:sourceSemantic,candidateOnly:true});
          unresolved.push(item.position);
        }else{
          unresolved.push(item.position);
          if(items.length===1&&candidates.length===1&&pairs.length===0)
            numericOnly.push({sourcePosition:item.position,
              googleRow:candidates[0].position,kind:item.kind,
              googleContent:candidates[0].description,
              sourceContent:item.description,
              reason:'same-numbers-different-description'});
        }
      }
    }
    return Object.freeze({supported,unresolved,numericOnly,semanticCandidates,
      supportedCount:supported.length,numericOnlyCount:numericOnly.length,
      semanticCandidateCount:semanticCandidates.length,
      candidateOnly:true,sourceComplete:false,canWrite:false});
  }
  // Review-only impact of transfer rows absent from the historical signature
  // set. This is NOT a proposal to insert them: the source completeness,
  // original cross-project transfer identity, and chronological balance
  // formulas all remain unverified.
  function assessUnmatchedTransfers(sourceRows,matched){
    if(!Array.isArray(sourceRows)||sourceRows.length>20000)
      throw Error('Invalid transfer projection');
    const entries=[],seen=new Set(),errors=[];
    let net=0;
    for(const position of matched?.sourceOnlyPositions||[]){
      if(!Number.isSafeInteger(position)||position<1||position>sourceRows.length){
        errors.push('invalid-position');continue;
      }
      const row=sourceRows[position-1];
      const ids=Array.isArray(row?._syncIds)?row._syncIds.map(String):[];
      if(ids.length!==1||!/^transfer:.+:(?:in|out)$/.test(ids[0])){
        errors.push('not-single-transfer:'+position);continue;
      }
      if(seen.has(ids[0])){errors.push('duplicate-id:'+position);continue}
      seen.add(ids[0]);
      const date=dateValue(row.date);
      const value=amount(row.income);
      const allOther=['subcontract','material','otherDirect','indirect',
        'financial','otherPayable','importTaxVat'].map(k=>amount(row[k],true));
      if(!date||!Number.isFinite(value)||value===0||
         allOther.some(v=>!Number.isFinite(v)||v!==0)){
        errors.push('invalid-amount-or-date:'+position);continue;
      }
      if(ids[0].endsWith(':out')&&value>=0||
         ids[0].endsWith(':in')&&value<=0){
        errors.push('direction-mismatch:'+position);continue;
      }
      entries.push(Object.freeze({position,date,sourceId:ids[0],
        direction:value>0?'in':'out',signedAmount:value}));
      net=rounded(net+value);
    }
    return Object.freeze({entries,net,errors,readyToWrite:false,
      sourceComplete:false,googleTransferVerified:false,canWrite:false});
  }
  // Confirm the two signed legs against existing in-memory Cash Control
  // transfers; this does NOT verify a Google Sheets counterpart.
  function verifyTransferSourceLegs(project,transferImpact,transfers){
    const norm=v=>String(v??'').normalize('NFKC').trim().toUpperCase();
    if(!Array.isArray(transfers)||transfers.length>20000)
      throw Error('Invalid transfer source');
    const target=norm(project);
    const verified=[],unverified=[];
    for(const item of transferImpact?.entries||[]){
      const match=/^transfer:(.+):(in|out)$/.exec(item.sourceId);
      const record=match&&transfers.filter(x=>String(x?.id??'')===match[1]);
      const x=record?.length===1?record[0]:null;
      const from=norm(x?.fromProject),to=norm(x?.toProject);
      const value=amount(x?.actualAmount??x?.amount);
      const direction=match?.[2];
      const correctLeg=direction==='out'?from===target&&to!==target:
        direction==='in'?to===target&&from!==target:false;
      const safe=!!x&&correctLeg&&from!==to&&from&&to&&
        x.status==='paid'&&dateValue(x.actualDate)===item.date&&
        Number.isFinite(value)&&Math.abs(value)===Math.abs(item.signedAmount);
      if(safe)verified.push(Object.freeze({position:item.position,
        fromProject:from,toProject:to,counterparty:direction==='out'?to:from,
        sourceId:item.sourceId,date:item.date,signedAmount:item.signedAmount,
        sourceLegVerified:true,googleCounterpartVerified:false}));
      else unverified.push(item.position);
    }
    return Object.freeze({verified,unverified,
      sourceLegVerifiedCount:verified.length,canWrite:false,
      googleCounterpartVerified:false,sourceComplete:false});
  }
  // Compare a verified transfer source leg with already supplied Google Sheet
  // snapshots of BOTH projects. Do not fetch Sheets or claim immutable IDs.
  // G is the signed flow column in the supported ledger layouts; the caller
  // must independently verify the sheet schema, provenance and balances.
  function reviewTransferGoogleCounterparts(sourceLegs,googleByProject){
    if(!sourceLegs||!Array.isArray(sourceLegs.verified)||
       !googleByProject||typeof googleByProject!=='object')
      throw Error('Invalid transfer comparison input');
    const readCandidates=(project,date,signed)=>{
      const snapshot=googleByProject[project];
      if(!snapshot||!Array.isArray(snapshot.rows)||snapshot.rows.length>20000)
        return {status:'not-loaded',positions:[]};
      if(snapshot.schemaVerified!==true)
        return {status:'schema-unverified',positions:[]};
      const positions=[];
      for(let i=0;i<snapshot.rows.length;i++){
        const row=snapshot.rows[i];
        if(!Array.isArray(row)||dateValue(row[0])!==date)continue;
        const income=amount(row[6],true);
        // In Google ledgers G is receipts, H:M are non-negative outflows.
        // FOXCONN additionally uses N for import tax/VAT. Never treat a
        // negative G value as the only way to represent a transfer out.
        const expenses=row.slice(7,snapshot.taxColumnIndex===13?14:13)
          .map(value=>amount(value,true));
        if(!Number.isFinite(income)||expenses.some(value=>!Number.isFinite(value))||
           expenses.some(value=>value<0)||income<0)continue;
        const nonzero=[income,...expenses].filter(value=>value!==0);
        // Require one unambiguous monetary posting; composite rows cannot
        // identify a single transfer and must stay unresolved.
        if(nonzero.length!==1)continue;
        const signedFlow=rounded(income-expenses.reduce((sum,value)=>sum+value,0));
        if(signedFlow===rounded(signed))positions.push(i+1);
      }
      // A ledger may record a loan repayment under a different accounting
      // column or amount. Expose the textual evidence instead of claiming
      // that its Google row is absent. Date, direction and project names are
      // diagnostic clues only and cannot establish a transfer ID.
      const textCandidates=[];
      if(!positions.length){
        for(let i=0;i<snapshot.rows.length;i++){
          const row=snapshot.rows[i];
          if(!Array.isArray(row)||dateValue(row[0])!==date)continue;
          const description=String(row[3]??'').normalize('NFKC').toUpperCase()
            .replace(/\s+/g,'');
          if(!(/归还|还款|HOÀNTRẢ|TRẢNỢ|REPAY/.test(description)))continue;
          const income=amount(row[6],true);
          const expenses=row.slice(7,snapshot.taxColumnIndex===13?14:13)
            .map(v=>amount(v,true));
          const total=Number.isFinite(income)&&expenses.every(Number.isFinite)?
            rounded(income-expenses.reduce((sum,v)=>sum+v,0)):null;
          textCandidates.push({googleRow:i+1,description:String(row[3]??'').slice(0,150),
            signedFlow:total,expectedSigned:rounded(signed),
            sameAmount:total!==null&&total===rounded(signed)});
        }
      }
      return {status:positions.length===0?
          (textCandidates.length?'amount-or-category-review':'missing'):
          positions.length===1?'candidate-only':'ambiguous',
        positions,textCandidates};
    };
    const reviews=[];
    for(const leg of sourceLegs.verified){
      if(!leg?.date||!leg?.fromProject||!leg?.toProject||
         !Number.isFinite(leg.signedAmount))continue;
      const target=leg.signedAmount<0?leg.fromProject:leg.toProject;
      const other=leg.signedAmount<0?leg.toProject:leg.fromProject;
      const primary=readCandidates(target,leg.date,leg.signedAmount);
      const counterpart=readCandidates(other,leg.date,-leg.signedAmount);
      // Refine textual evidence to the expected pair. Avoid interpreting
      // unrelated repayments on the same date as this transfer.
      for(const [result,project] of [[primary,target],[counterpart,other]]){
        result.textCandidates=result.textCandidates.filter(item=>{
          const text=String(item.description).normalize('NFKC').toUpperCase()
            .replace(/\s+/g,'');
          return text.includes(leg.fromProject.replace(/\s+/g,''))&&
            text.includes(leg.toProject.replace(/\s+/g,''));
        });
        if(result.status==='amount-or-category-review'&&!result.textCandidates.length)
          result.status='missing';
      }
      reviews.push(Object.freeze({position:leg.position,sourceId:leg.sourceId,
        primaryProject:target,counterpartProject:other,
        primary,counterpart,
        status:primary.status==='candidate-only'&&counterpart.status==='candidate-only'?
          'two-sided-candidate-only':
          primary.status==='missing'&&counterpart.status==='candidate-only'?
          'counterpart-only-candidate':'unresolved',
        idVerified:false,balancesVerified:false,canWrite:false}));
    }
    return Object.freeze({reviews,reviewed:reviews.length,
      twoSidedCandidateCount:reviews.filter(x=>x.status==='two-sided-candidate-only').length,
      counterpartOnlyCandidateCount:reviews.filter(x=>x.status==='counterpart-only-candidate').length,
      sourceComplete:false,canWrite:false,approvedWrites:0});
  }
  // Shared reconciliation routing. This is a classification hint, never a
  // transaction identity or write eligibility. Source IDs are already loaded
  // into Cash Control RAM; no network calls or mutation are needed.
  function classifyCashSource(row,recordsById){
    const ids=Array.isArray(row?._syncIds)?row._syncIds.map(String):[];
    const text=String(row?.content||'')+' '+String(row?.type||'');
    const outcome=(kind,rule,needsContractIpc)=>Object.freeze({
      kind,rule,needsContractIpc,canWrite:false
    });
    if(ids.some(id=>id.startsWith('transfer:')))
      return outcome('transfer','Dự án đi/đến + loại điều chuyển + ngày + số tiền + ID nguồn',false);
    if(ids.length>1||row?._taxQuarter||
       /thuế tncn|个人所得税|thuế thu nhập cá nhân/i.test(text))
      return outcome('tax-or-aggregate','Loại thuế + quý + dự án + ngày + số tiền + ID nhóm',false);
    const paymentId=ids.length===1&&ids[0].startsWith('expense:')?ids[0].slice(8):null;
    const expense=paymentId&&recordsById?.get(paymentId);
    // Stable Payment provenance outranks free-text keywords (e.g. a contract
    // description can contain the word "lương"). Explicit inbound stays receipt.
    if(expense?.source==='payment'&&expense?.direction!=='in')
      return outcome('payment','Dự án + HĐ + IPC + ngày + số tiền + ID Payment',true);
    if(expense?.source==='payroll'||expense?.linkedModule==='payroll'||
       /lương|bảo hiểm|phí công đoàn|工资|保险|社保|工会费|职工薪酬/i.test(text))
      return outcome('personnel','Loại chi phí nhân sự + kỳ + ngày + số tiền + ID nguồn',false);
    if(expense?.linkedModule==='inflow'||expense?.direction==='in'||
       Number(row?.income||0)>0&&!!String(row?.ipc||'').trim())
      return outcome('receipt','Dự án + IPC thu tiền + ngày + số tiền + chứng từ thu',false);
    return outcome('unverified','Loại nguồn chưa xác minh: đối chiếu thủ công, không suy đoán HĐ/IPC',false);
  }
  // Payment-only HĐ/IPC issues are distinct from missing counterpart
  // metadata on payroll, tax, receipts and transfers. Never approve writes.
  function auditFoxconnIdentityGroups(matched,sourceRows,recordsById){
    const groups={
      paymentIdentityReview:[],
      nonPaymentCounterpartReview:[],
      unknownSourceReview:[],
      ambiguousPayment:[],
      ambiguousOther:[]
    };
    const collect=(positions,kind)=>{
      for(const position of positions||[]){
        const row=sourceRows?.[position-1];
        if(!row)continue;
        const category=classifyCashSource(row,recordsById).kind;
        if(kind==='ambiguous'){
          (category==='payment'?groups.ambiguousPayment:groups.ambiguousOther).push(position);
        }else if(category==='payment'){
          groups.paymentIdentityReview.push(position);
        }else if(category==='unverified'){
          groups.unknownSourceReview.push(position);
        }else{
          groups.nonPaymentCounterpartReview.push(position);
        }
      }
    };
    collect(matched?.identityConflictPositions,'identity');
    collect(matched?.identityUnverifiedPositions,'identity');
    collect(matched?.ambiguousSourcePositions,'ambiguous');
    for(const group of Object.values(groups))group.sort((a,b)=>a-b);
    return Object.freeze({
      ...groups,
      identityReviewCount:groups.paymentIdentityReview.length,
      nonPaymentReviewCount:groups.nonPaymentCounterpartReview.length,
      pending:groups.paymentIdentityReview.length+groups.nonPaymentCounterpartReview.length+
        groups.unknownSourceReview.length+groups.ambiguousPayment.length+groups.ambiguousOther.length,
      canWrite:false
    });
  }
  // One shared, conservative dry-run for every project. Position sets are
  // diagnostic only: the Google history has no immutable source ID column.
  // Zero source rows are authorized for insertion by this function.
  function buildReadOnlySyncPlan(project,comparison,sourceRows){
    if(!Array.isArray(sourceRows)||sourceRows.length>20000||
       !comparison||typeof comparison!=='object')throw Error('Invalid dry-run snapshot');
    const safePositions=values=>{
      if(!Array.isArray(values))return [];
      return [...new Set(values.filter(v=>Number.isSafeInteger(v)&&v>=1&&v<=sourceRows.length))].sort((a,b)=>a-b);
    };
    const sourceOnly=safePositions(comparison.sourceOnlyPositions);
    const ambiguous=safePositions(comparison.ambiguousSourcePositions);
    const conflict=safePositions(comparison.identityConflictPositions);
    const missing=safePositions(comparison.identityUnverifiedPositions);
    const review=new Set([...ambiguous,...conflict,...missing]);
    const absentCandidates=sourceOnly.filter(position=>!review.has(position));
    // Even the unmatched source rows are merely candidates for insertion:
    // missing aliases, old history and transfer counterparts can still hide duplicates.
    const report=Object.freeze({
      project:String(project||''),sourceScope:Number(comparison.sourceScope||0),
      historyScope:Number(comparison.historicalScope||0),
      existingCandidates:Number(comparison.candidates??comparison.matched??0),
      newUnverifiedPositions:Object.freeze(absentCandidates),
      ambiguousPositions:Object.freeze(ambiguous),
      identityConflictPositions:Object.freeze(conflict),
      identityUnverifiedPositions:Object.freeze(missing),
      googleOnlyCount:Number(comparison.historyOnly??comparison.historicalOnly??0),
      unmatchedCount:Number(comparison.sourceOnly??comparison.cashOnly??0),
      invalidSource:Number(comparison.invalidSource||0),
      invalidHistory:Number(comparison.invalidHistory||0),
      unmappedTax:Number(comparison.unmappedTax||0),
      incompleteSource:comparison.sourceComplete!==true,
      verifiedNewCount:0,approvedWrites:0,canWrite:false,
      status:'REVIEW_ONLY_NO_WRITES',
      note:'Ứng viên mới CHƯA được phép ghi: cần ID nguồn, đối chiếu lịch sử và kiểm tra số dư.'
    });
    return report;
  }
  // Pure read-only release gate for real project Sheets. A consistent ledger
  // is not proof that payments are complete or that automatic writes are safe.
  // This function deliberately NEVER returns write authorization.
  function assessProjectSyncReadiness(project,historical,comparison){
    const blockers=[];
    const add=(code,message)=>{if(!blockers.some(x=>x.code===code))blockers.push({code,message})};
    if(!historical||typeof historical!=='object')add('NO_HISTORY','Chưa kiểm tra sổ Google Sheets gốc.');
    else {
      if(historical.status!=='internally-consistent')
        add('HISTORY_REVIEW','Bố cục hoặc thứ tự ngày của sổ lịch sử chưa được xác nhận.');
      if(historical.continuityErrors!==0||historical.roundingDifferences!==0||
        historical.missingBalance!==0||historical.invalidMoney!==0)
        add('BALANCE_REVIEW','Số dư hoặc giá trị tiền trong sổ lịch sử cần kiểm tra.');
      if(historical.nonMonotonicDates!==0)
        add('DATE_ORDER','Ngày giao dịch lịch sử chưa tăng dần.');
      if(historical.transactionRows===0)
        add('EMPTY_HISTORY','Dự án chưa có giao dịch lịch sử; phải xác nhận số dư đầu kỳ.');
    }
    if(!comparison||comparison.sourceComplete!==true)
      add('SOURCE_INCOMPLETE','Chưa tải đủ Payment thật của dự án để chống trùng.');
    else {
      if(comparison.invalidHistory>0||comparison.invalidSource>0)
        add('INVALID_TRANSACTIONS','Có dòng giao dịch chưa đọc được.');
      if(comparison.ambiguous>0)
        add('AMBIGUOUS_MATCH','Có nhiều giao dịch cùng ngày và cùng số tiền; không tự chọn bản ghi.');
      if(Number(comparison.historicalOnly??comparison.historyOnly??0)>0||
         Number(comparison.cashOnly??comparison.sourceOnly??0)>0)
        add('UNRESOLVED_MATCH','Còn giao dịch chỉ xuất hiện ở một nguồn; cần gắn ID trước khi ghi.');
      if(Number(comparison.identityConflict||0)>0)
        add('IDENTITY_CONFLICT','Hợp đồng/IPC hoặc công ty không khớp giữa hai nguồn.');
      if(Number(comparison.identityUnverified||0)>0)
        add('IDENTITY_UNVERIFIED','Chưa đủ thông tin định danh khoản thanh toán.');
      if(Number(comparison.unmappedTax||0)>0)
        add('TAX_UNMAPPED','Thuế nhập khẩu/VAT chưa ánh xạ được vào nguồn.');
      if(Number(comparison.layoutErrors||0)>0)
        add('SOURCE_LAYOUT','Bố cục nguồn chưa xác nhận.');
    }
    return Object.freeze({project,status:blockers.length?'blocked':'review-required',
      blockers,canWrite:false,
      note:blockers.length?
        'CHẶN ĐỒNG BỘ: '+blockers.map(x=>x.message).join(' '):
        'Đã qua điều kiện kiểm tra sơ bộ. Vẫn cần kiểm tra ID, nối số dư và xác nhận Admin; chưa được ghi.'});
  }
  return Object.freeze({audit,dateValue,amount,diagnoseHeaders,foxconnBalanceCandidates,balanceColumnCandidates,dateLayoutDiagnostic,compareLoadedCashControl,compareFoxconnCandidates,resolvePaymentCollisionCandidates,resolveFoxconnNonPaymentCandidates,assessUnmatchedTransfers,verifyTransferSourceLegs,reviewTransferGoogleCounterparts,classifyCashSource,auditFoxconnIdentityGroups,buildReadOnlySyncPlan,assessProjectSyncReadiness});
});
