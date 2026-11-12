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
    for(const row of rows){
      if(!Array.isArray(row))continue;
      const date=dateValue(row[0]);
      if(!date||date<'2026-10-01')continue;
      months.add(date.slice(0,7));historicalScope++;
      const values=row.slice(6,13).map(x=>amount(x,true));
      if(values.length!==7||values.some(x=>!Number.isFinite(x))){invalidHistory++;continue}
      const id=token(date,values);
      add(counts,id);
      saveIdentity(historicIdentity,id,identity(row[1],row[2],row[4]));
    }
    for(const row of cashRows){
      const date=dateValue(row?.date);
      if(!date||date<'2026-10-01')continue;
      sourceScope++;
      const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
      const values=fields.map(x=>amount(row[x],true));
      if(values.some(x=>!Number.isFinite(x))){invalidSource++;continue}
      const id=token(date,values);
      add(sourceCounts,id);
      saveIdentity(sourceIdentity,id,identity(row.company,row.contractNo,row.ipc));
    }
    let matched=0,historicalOnly=0,cashOnly=0,ambiguous=0;
    let identityConflict=0,identityUnverified=0,identityConsistent=0;
    for(const key of new Set([...counts.keys(),...sourceCounts.keys()])){
      const h=counts.get(key)||0,c=sourceCounts.get(key)||0;
      matched+=Math.min(h,c);
      historicalOnly+=Math.max(0,h-c);
      cashOnly+=Math.max(0,c-h);
      if(h>1||c>1)ambiguous+=Math.min(h,c);
      // Only one-to-one coarse candidates can safely be compared by metadata.
      if(h===1&&c===1){
        const historical=historicIdentity.get(key)?.[0]||[];
        const source=sourceIdentity.get(key)?.[0]||[];
        const known=historical.map((v,i)=>v&&source[i]?i:-1).filter(i=>i>=0);
        if(!known.length)identityUnverified++;
        else if(known.some(i=>historical[i]!==source[i]))identityConflict++;
        else if(known.length===3)identityConsistent++;
        else identityUnverified++;
      }
    }
    return {status:!complete?'incomplete-memory-source':'candidates-only',
      project,sourceComplete:complete,historicalScope,sourceScope,matched,
      historicalOnly,cashOnly,ambiguous,identityConflict,identityUnverified,
      identityConsistent,invalidHistory,invalidSource,
      months:[...months].sort(),canWrite:false};
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
    if(expense?.source==='payroll'||expense?.linkedModule==='payroll'||
       /lương|bảo hiểm|phí công đoàn|工资|保险|社保|工会费|职工薪酬/i.test(text))
      return outcome('personnel','Loại chi phí nhân sự + kỳ + ngày + số tiền + ID nguồn',false);
    if(expense?.linkedModule==='inflow'||expense?.direction==='in'||
       Number(row?.income||0)>0&&!!String(row?.ipc||'').trim())
      return outcome('receipt','Dự án + IPC thu tiền + ngày + số tiền + chứng từ thu',false);
    if(expense?.source==='payment')
      return outcome('payment','Dự án + HĐ + IPC + ngày + số tiền + ID Payment',true);
    return outcome('unverified','Loại nguồn chưa xác minh: đối chiếu thủ công, không suy đoán HĐ/IPC',false);
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
  return Object.freeze({audit,dateValue,amount,diagnoseHeaders,foxconnBalanceCandidates,balanceColumnCandidates,dateLayoutDiagnostic,compareLoadedCashControl,compareFoxconnCandidates,classifyCashSource,assessProjectSyncReadiness});
});
