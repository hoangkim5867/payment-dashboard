/**
 * One deliberate Admin click: compare ONLY already-loaded and already-grouped
 * Cash Control Xuất Excel records with each ACTIVE project's original Google
 * ledger. This file has NO write path and does not access Firebase.
 * No Google scope other than spreadsheets.readonly is requested by the caller.
 */
const validMonth=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
const canonical=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const money=v=>{
 if(v===null||v===undefined||v==='')return 0;
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(typeof v==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v.trim()))
   return Number(v);
 return NaN;
};
const date=v=>{
 if(typeof v==='number'&&Number.isInteger(v)&&v>=20000&&v<100000)
   return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);
 if(typeof v!=='string')return '';
 const match=/^(20\d{2})-(\d{1,2})-(\d{1,2})$/.exec(v.trim());
 if(!match)return '';
 const y=+match[1],m=+match[2],d=+match[3],dt=new Date(Date.UTC(y,m-1,d));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?
   [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'):'';
};
const signature=values=>JSON.stringify([
 date(values[0]),...values.slice(1,6).map(canonical),
 ...values.slice(6).map(money)
]);
const mirrorPrefix=['sourceId','projectKey','month','date','company','contractNo',
 'content','ipc','type','income','subcontract','material','otherDirect',
 'indirect','financial','otherPayable'];
function monthlyMirrorById(rows,project,month){
 const index=new Map();
 if(!rows.length)return index;
 const header=rows[0];
 const last=project==='PHU HUNG'?'balance':'importTaxVat';
 if(header?.length!==19||!mirrorPrefix.every((name,i)=>header[i]===name)||
    header[16]!==last||header[17]!=='sourceHash'||header[18]!=='syncStatus')
   throw Error('GOOGLE_SYNC_INDEX_LAYOUT');
 const seen=new Set();
 for(const row of rows.slice(1)){
   const [id,key,period,rawDate]=row;
   const day=date(rawDate);
   const amounts=row.slice(9,project==='FOXCONN'?17:16).map(money);
   const status=row[18];
   if(row.length!==19||typeof id!=='string'||!id||seen.has(id)||key!==project||
      !day||day.slice(0,7)!==period||!/^[a-f0-9]{64}$/.test(row[17])||
      !/^(?:synced|history(?:Updated)?:[1-9]\d*)$/.test(status)||
      amounts.some(n=>!Number.isFinite(n)))
     throw Error('GOOGLE_SYNC_INDEX_INVALID');
   seen.add(id);
   if(period===month)index.set(id,{day,amounts,status});
 }
 return index;
}
function samePosting(posting,values){
 return posting.day===date(values[0])&&
   posting.amounts.length===values.length-6&&
   posting.amounts.every((n,i)=>Math.abs(n-money(values[i+6]))<0.000001);
}
// A shared contract/IPC, date and posting can identify rows worth reviewing
// even if the company, description or type labels differ.
function paymentIdentity(values){
 const contract=canonical(values[2]),ipc=canonical(values[4]);
 if(!contract||!ipc||!values.slice(6).some(amount=>amount!==0))return '';
 return JSON.stringify([values[0],contract,ipc,...values.slice(6)]);
}
export function parseLedgerLink(link){
 let url;
 try{url=new URL(String(link||''))}catch{throw Error('GOOGLE_LINK_INVALID')}
 if(url.protocol!=='https:'||url.hostname!=='docs.google.com')
   throw Error('GOOGLE_LINK_INVALID');
 const id=/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/.exec(url.pathname)?.[1];
 const query=url.searchParams.get('gid');
 const hash=/^(?:#gid=)(\d+)$/.exec(url.hash)?.[1]??null;
 const gid=query??hash;
 if(!id||gid===null||!/^\d{1,10}$/.test(gid)||
    query!==null&&hash!==null&&query!==hash)
   throw Error('GOOGLE_HISTORY_GID_REQUIRED');
 const number=Number(gid);
 if(!Number.isSafeInteger(number)||number<0)throw Error('GOOGLE_GID_INVALID');
 return Object.freeze({spreadsheetId:id,gid:number});
}
export function compareHistoryToExport({project,month,records,history,mirror=[],audit,excelOnly=false}){
 if(!validMonth(month)||!project||!Array.isArray(records)||
   records.length>10000||!Array.isArray(history)||history.length>20000||
   typeof audit!=='function')throw Error('INVALID_READONLY_COMPARISON');
 // The source must be the canonical grouped Export Excel numeric values.
 // Project-specific owner policy: if the original Google ledger has an
 // October 2026 transaction, its forward sync starts in November. Otherwise
 // October is the first month that may require appending.
 const originalOctoberPresent=history.some(row=>Array.isArray(row)&&
  date(row[0])?.slice(0,7)==='2026-10');
 const syncStartMonth=originalOctoberPresent?'2026-11':'2026-10';
 const synced=monthlyMirrorById(mirror,project,month);
 const signatures=new Map(),historyRows=[],sourceRows=[];
 let historyInMonth=0,invalidHistoryRows=0,latest='';
 for(const [rowIndex,row] of history.entries()){
   if(!Array.isArray(row))continue;
   const day=date(row[0]);
   if(!day)continue;
   if(day>latest)latest=day;
   if(day.slice(0,7)!==month)continue;
   // The S6-1 opening anchor establishes a balance with zero cash movement.
   // Keep it in the balance audit, but never match it as a transaction.
   if(project==='S6-1'&&row[3]==='Số dư đầu kỳ tháng 11/2026'&&
      row[5]==='Số dư đầu kỳ'&&row.slice(6,13).length===7&&
      row.slice(6,13).every(n=>money(n)===0))continue;
   historyInMonth++;
   const amountCount=project==='FOXCONN'?8:7;
   const values=[day,...Array.from({length:5},(_,i)=>String(row[1+i]??'')),
     ...Array.from({length:amountCount},(_,i)=>money(row[6+i]))];
   if(values.slice(6).some(x=>!Number.isFinite(x))){
     invalidHistoryRows++;continue;
   }
   // The original Excel places FOXCONN import tax inside other direct costs.
   if(excelOnly&&project==='FOXCONN'){values[9]+=values[13];values[13]=0;}
   const sig=signature(values);
   const entry={values,matched:false,rowNumber:rowIndex+1};
   historyRows.push(entry);
   if(!signatures.has(sig))signatures.set(sig,[]);
   signatures.get(sig).push(entry);
 }
 let exactMatches=0,unmatchedBeforeHistoryEnd=0,newerCandidates=0,
   backfillCandidates=0,unsafeBackfill=0,
   duplicateHistory=0,duplicateSource=0,invalidSource=0,likelyLabelDifferences=0;
 const consumed=new Set(),sourceCounts=new Map(),unmatched=[],candidateSourceRows=[];
 for(const [sourceIndex,record] of records.entries()){
   if(record?.project!==project||record?.month!==month||
     typeof record.id!=='string'||!record.id||consumed.has(record.id)||
     !Array.isArray(record.values)||
     record.values.length!==(project==='FOXCONN'?14:13)||
     date(record.values[0])!==record.values[0]||
     record.values[0].slice(0,7)!==month||
     record.values.slice(6).some(x=>typeof x!=='number'||!Number.isFinite(x))){
     invalidSource++;continue;
   }
   consumed.add(record.id);
   const sig=signature(record.values);
   sourceRows.push({id:record.id,values:record.values,sig,sourceRow:sourceIndex+1});
   sourceCounts.set(sig,(sourceCounts.get(sig)||0)+1);
 }
 const matchedMirrorRows=new Set();
 let syncedMatches=0,mirrorConflicts=0;
 for(const {id,values,sig,sourceRow} of sourceRows){
   const candidates=signatures.get(sig)||[];
   const posting=synced.get(id);
   if(posting&&sourceCounts.get(sig)===1){
     const boundRow=posting.status==='synced'?null:
       historyRows.find(h=>h.rowNumber===Number(posting.status.split(':')[1]));
     if(!samePosting(posting,values)||
        posting.status!=='synced'&&(!boundRow||boundRow.matched||
          !samePosting(posting,boundRow.values))){
       mirrorConflicts++;
       continue;
     }
     if(boundRow)boundRow.matched=true;
     matchedMirrorRows.add(sourceRow);
     exactMatches++;syncedMatches++;
     continue;
   }
   if(sourceCounts.get(sig)>1)duplicateSource++;
   else if(candidates.length>1)duplicateHistory++;
   else if(candidates.length===1){exactMatches++;candidates[0].matched=true;}
   else if(values[0]<=latest){
     unmatchedBeforeHistoryEnd++;unmatched.push(values);
     // Safe BACKFILL HINT only, never permission to write:
     // same-day same amount columns, contract/IPC, or suspected transfer
     // counterpart must remain in review, even when label text differs.
     const dayRows=historyRows.filter(h=>h.values[0]===values[0]);
     const amountCols=v=>JSON.stringify(v.slice(6));
     const identity=v=>canonical(v[2])&&canonical(v[4])?
       canonical(v[2])+'|'+canonical(v[4]):'';
     const transfer=v=>/归还|借款|还款|hoàn vay|hoan vay|điều chuyển|dieu chuyen|repay|transfer/i
       .test(v.slice(1,6).join(' '));
     const balanceDelta=v=>v[6]-v.slice(7).reduce((n,x)=>n+x,0);
     const similar=dayRows.some(h=>{
       const other=h.values;
       return amountCols(other)===amountCols(values)||
         (identity(values)&&identity(values)===identity(other))||
         (canonical(values[1])===canonical(other[1])&&
           canonical(values[3])===canonical(other[3])&&
           canonical(values[3]))||
         ((transfer(values)||transfer(other))&&
           Math.abs(Math.abs(balanceDelta(values))-
             Math.abs(balanceDelta(other)))<0.000001);
     });
     if(similar)unsafeBackfill++;
     else if(['2026-10','2026-11'].includes(month)){
       backfillCandidates++;candidateSourceRows.push(sourceRow);
     }else unsafeBackfill++;
   }
   else {newerCandidates++;candidateSourceRows.push(sourceRow); }
 }
 // Detailed diagnostics stay inside the signed Admin browser session.
 // Never include amounts, descriptions, raw IDs, or Google file identifiers
 // in the copyable aggregate report.
 const reviewRows=[];
 let detailsTruncated=false;
 const addDetail=entry=>{
   if(reviewRows.length>=100){detailsTruncated=true;return;}
   reviewRows.push(Object.freeze(entry));
 };
 // All pairing signals below are REVIEW HINTS, never certified matches.
 // Require uniqueness on both sides: repeated dates/amounts cannot be paired.
 const unpairedSource=sourceRows.filter(src=>!matchedMirrorRows.has(src.sourceRow)&&
   !(sourceCounts.get(src.sig)===1&&signatures.get(src.sig)?.length===1));
 const unpairedHistory=historyRows.filter(h=>!h.matched);
 const amountKey=v=>JSON.stringify([v[0],...v.slice(6)]);
 const contractIpcKey=v=>{
   const contract=canonical(v[2]),ipc=canonical(v[4]);
   return contract&&ipc?JSON.stringify([v[0],contract,ipc]):'';
 };
 const candidatePairs=new Map(),pairedGoogle=new Set();
 const unmatchedHistoryByKey=(keyFn)=>new Map(
   unpairedHistory.map(h=>[h,keyFn(h.values)]).filter(([,key])=>key));
 function findUniquePair(source,keyFn,code){
   const key=keyFn(source.values);
   if(!key)return null;
   const historyCandidates=unmatchedHistoryByKey(keyFn);
   const matches=[...historyCandidates].filter(([,candidateKey])=>candidateKey===key).map(([h])=>h);
   if(matches.length!==1||pairedGoogle.has(matches[0]))return null;
   const reverse=unpairedSource.filter(other=>keyFn(other.values)===key);
   if(reverse.length!==1)return null;
   return {history:matches[0],code};
 }
 // Keep a strict contract/IPC/date identity ahead of amount-only comparison.
 // A matching IPC with different amounts is a discrepancy, NOT a safe row.
 for(const source of unpairedSource){
   if(sourceCounts.get(source.sig)>1||(signatures.get(source.sig)||[]).length>1)continue;
   const pair=findUniquePair(source,contractIpcKey,'SAME_CONTRACT_IPC_REVIEW')||
     findUniquePair(source,amountKey,'POSSIBLE_SAME_DAY_AMOUNT_REVIEW');
   if(pair){
     if(paymentIdentity(source.values)&&paymentIdentity(source.values)===paymentIdentity(pair.history.values))
       pair.code='SAME_POSTING_DIFFERENT_LABEL';
     candidatePairs.set(source,pair);pairedGoogle.add(pair.history);
   }
 }
 for(const source of unpairedSource){
   const candidates=signatures.get(source.sig)||[];
   const pair=candidatePairs.get(source);
   const identity=paymentIdentity(source.values);
   const identical=identity?unpairedHistory.filter(h=>paymentIdentity(h.values)===identity):[];
   const code=synced.has(source.id)?'EXISTING_SOURCE_ID_REVIEW':
     sourceCounts.get(source.sig)>1?'DUPLICATE_SOURCE':
     candidates.length>1?'DUPLICATE_GOOGLE_HISTORY':
     pair?.code||(identical.length===1?'SAME_POSTING_DIFFERENT_LABEL':
       source.values[0]>latest?'NEWER_THAN_GOOGLE':'SOURCE_NOT_MATCHED');
   const matchedByIdentity=!pair&&identical.length===1?identical[0]:null;
   const counterpart=pair?.history||matchedByIdentity;
   const labelColumns=['COMPANY','CONTRACT','DESCRIPTION','IPC','TYPE'];
   const changedFields=counterpart?Object.freeze([
     ...labelColumns.filter((_,i)=>canonical(source.values[i+1])!==
       canonical(counterpart.values[i+1])),
     ...(source.values.slice(6).some((amount,i)=>
       amount!==counterpart.values[i+6])?['AMOUNT_COLUMNS']:[])
   ]):Object.freeze([]);
   const financialDifference=changedFields.includes('AMOUNT_COLUMNS');
   addDetail({origin:'CASH_CONTROL',sourceRow:source.sourceRow,
     googleRow:counterpart?.rowNumber??null,
     date:source.values[0],code,changedFields,financialDifference,
     matchingHint:pair?.code||(
       matchedByIdentity?'SAME_DATE_CONTRACT_IPC_AMOUNT':'NO_UNIQUE_POSTING_MATCH')});
 }
 for(const row of unpairedHistory){
   addDetail({origin:'GOOGLE_HISTORY',googleRow:row.rowNumber,
     sourceRow:null,date:row.values[0],
     code:[...candidatePairs.values()].some(p=>p.history===row)?
       'GOOGLE_ROW_POSSIBLE_PAIR':'GOOGLE_ROW_NOT_MATCHED',
     matchingHint:'CHECK_SOURCE_OR_HISTORICAL_ENTRY'});
 }
 const historicalIdentities=new Map(),sourceIdentities=new Map();
 for(const entry of historyRows){
   if(entry.matched)continue;
   const id=paymentIdentity(entry.values);
   if(id)historicalIdentities.set(id,(historicalIdentities.get(id)||0)+1);
 }
 for(const values of unmatched){
   const id=paymentIdentity(values);
   if(id)sourceIdentities.set(id,(sourceIdentities.get(id)||0)+1);
 }
 for(const [id,count] of sourceIdentities)
   if(count===1&&historicalIdentities.get(id)===1)likelyLabelDifferences++;
 // This audit checks actual running balances, dates and tax layout, rather
 // than inferring Google correctness from row counts or matching amounts.
 const historicalAudit=audit(history,{project,probeBalanceIndex:project==='FOXCONN'?14:undefined});
 if(!historicalAudit||typeof historicalAudit.status!=='string')
   throw Error('HISTORY_AUDIT_UNAVAILABLE');
 const financialReview=!['internally-consistent','review-date-order'].includes(historicalAudit.status)||
   historicalAudit.financialIssues>0||historicalAudit.missingBalance>0||
   historicalAudit.balanceColumnUnconfirmed===true||
   historicalAudit.layoutErrors>0;
 const dateReview=historicalAudit.nonMonotonicDates>0;
 const historyUnmatched=historyRows.filter(entry=>!entry.matched).length;
 const unmatchedMirrorRows=[...synced.keys()].filter(id=>!consumed.has(id)).length;
 const reviewCount=mirrorConflicts+unmatchedMirrorRows+
   invalidHistoryRows+duplicateHistory+duplicateSource+invalidSource+
   unsafeBackfill+historyUnmatched;
 // Reporting category only: a date-order warning must not masquerade as a
 // financial mismatch, and categorization NEVER permits a write.
 const reviewCategory=financialReview?'FINANCIAL_HISTORY_REVIEW':
   reviewCount?'TRANSACTION_REVIEW':
   newerCandidates||backfillCandidates?'NEWER_OR_BACKFILL_CANDIDATES_ONLY':
   dateReview?'DATE_ORDER_ONLY':'EXACT_HISTORY';
 return Object.freeze({
   project,month,syncStartMonth,originalOctoberPresent,sourceRows:records.length,historyRows:historicalAudit.transactionRows,
   historyInMonth,exactMatches,syncedMatches,mirrorConflicts,unmatchedMirrorRows,
   newerCandidates,backfillCandidates,unsafeBackfill,
   candidateSourceRows:Object.freeze(candidateSourceRows),
   unmatchedBeforeHistoryEnd,
   historyUnmatched,duplicateHistory,duplicateSource,invalidHistoryRows,invalidSource,
   likelyLabelDifferences,financialReview,dateReview,reviewCategory,
   reviewRows:Object.freeze(reviewRows),detailsTruncated,
   historyStatus:historicalAudit.status,closingBalance:historicalAudit.closingBalance,
   nonMonotonicDates:historicalAudit.nonMonotonicDates,
   result:financialReview||reviewCount?'REVIEW_REQUIRED':
     newerCandidates||backfillCandidates?'NEWER_THAN_HISTORY_CANDIDATE':
     dateReview?'REVIEW_REQUIRED':'EXACT_HISTORY_ONLY',
   // Source identity and a snapshot audit alone NEVER authorize writes.
   googleCompared:true,sourceComplete:false,canWrite:false,googleWrites:0
 });
}
// Presentation-only distinction. Date inversion alone is not a financial
// discrepancy or a reason to re-post an already matched transaction.
// This NEVER changes reviewResult, source proof, canWrite, or Google writes.
export function isDateOrderOnlyHistoryWarning(row){
 return row?.reviewCategory==='DATE_ORDER_ONLY'&&
   row.result==='REVIEW_REQUIRED'&&row.dateReview===true&&
   row.financialReview===false&&
   Number.isSafeInteger(row.sourceRows)&&
   row.sourceRows>0&&row.exactMatches===row.sourceRows&&
   row.newerCandidates===0&&row.backfillCandidates===0&&
   row.historyUnmatched===0&&row.duplicateHistory===0&&
   row.duplicateSource===0&&row.invalidSource===0&&
   row.invalidHistoryRows===0&&row.mirrorConflicts===0&&
   row.unmatchedMirrorRows===0;
}
export function summarizeMatchedHistoryReadOnly(results){
 if(!Array.isArray(results))throw Error('INVALID_HISTORY_SUMMARY');
 const dateOrderOnly=results.filter(isDateOrderOnlyHistoryWarning).length;
 const withoutDate=results.filter(row=>row.result==='EXACT_HISTORY_ONLY').length;
 const otherReview=results.length-dateOrderOnly-withoutDate;
 const allRowsMatched=results.length>0&&results.every(row=>
   (row.result==='EXACT_HISTORY_ONLY'||isDateOrderOnlyHistoryWarning(row))&&
   Number.isSafeInteger(row.sourceRows)&&
   row.exactMatches===row.sourceRows&&row.newerCandidates===0&&
   row.backfillCandidates===0);
 return Object.freeze({
   dateOrderOnly,withoutDate,otherReview,allRowsMatched,
   noNewRows:allRowsMatched,canWrite:false,googleWrites:0
 });
}
export async function scanMonthlyGoogleReadOnly({
 month,groups,links,accessToken,fetcher,audit,onProgress,expectedOwner
}={}){
 if(!validMonth(month)||!Array.isArray(groups)||groups.length>150||
   !links||typeof links!=='object'||typeof fetcher!=='function'||
   typeof audit!=='function'||typeof accessToken!=='string'||
   !/^[A-Za-z0-9._~-]{20,4096}$/.test(accessToken))
   throw Error('READONLY_SCAN_INVALID');
 const active=groups.filter(g=>g.groupedExcelRows>0);
 if(active.length>35)throw Error('READONLY_PROJECT_LIMIT');
 let googleReads=0;
 const results=[];
 for(const group of active){
   if(typeof expectedOwner==='function'&&!expectedOwner())
     throw Error('ADMIN_SESSION_CHANGED');
   if(group.state!=='HISTORY_COMPARISON_CANDIDATE'){
     results.push({project:group.project,result:'SOURCE_NOT_READY',
       reason:group.sourceBlockReason||group.state,googleReads:0,googleWrites:0,canWrite:false});
     onProgress?.(results.length,active.length,results.at(-1));continue;
   }
   if(!links[group.project]){
     results.push({project:group.project,result:'GOOGLE_REVIEW_REQUIRED',
       reason:'GOOGLE_LINK_MISSING',googleReads:0,googleWrites:0,canWrite:false});
     onProgress?.(results.length,active.length,results.at(-1));continue;
   }
   let reads=0;
   try{
     const {spreadsheetId,gid}=parseLedgerLink(links[group.project]);
     const root='https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId;
     const get=async endpoint=>{
       if(typeof expectedOwner==='function'&&!expectedOwner())
         throw Error('ADMIN_SESSION_CHANGED');
       const response=await fetcher(root+endpoint,{
         method:'GET',headers:{Authorization:'Bearer '+accessToken},
         signal:AbortSignal.timeout(25000)
       });
       googleReads++;reads++;
       if(!response?.ok)throw Error('GOOGLE_READ_'+String(response?.status||'FAILED'));
       return response.json();
     };
     const metadata=await get('?fields=spreadsheetId,sheets(properties(sheetId,title,hidden,gridProperties(rowCount)))');
     if(metadata.spreadsheetId!==spreadsheetId||
       !Array.isArray(metadata.sheets))throw Error('GOOGLE_FILE_MISMATCH');
     const tabs=metadata.sheets.map(s=>s?.properties);
     const selected=tabs.find(s=>s?.sheetId===gid);
     const mirrorTab=tabs.find(s=>s?.title==='DATA_CASHCONTROL'&&s.hidden===true);
     const visibleMain=tabs.some(s=>s?.title===group.project&&
       s.hidden!==true&&s.sheetId!==gid);
     const visibleLegacy=tabs.some(s=>s?.title==='CASHCONTROL_VIEW'&&s.hidden!==true);
     const archive=selected?.hidden===true&&mirrorTab&&visibleMain&&
       selected.title===(group.project==='PHU HUNG'?
         'PHU_HUNG_HISTORY_BACKUP':group.project+'_HISTORY_BACKUP');
     if(!selected||!selected.title||
       (selected.hidden===true&&!archive)||
       /^(?:DATA_CASHCONTROL|CASHCONTROL_VIEW|DATA_CASHCONTROL_TEST_)/i.test(selected.title)||
       selected.gridProperties?.rowCount>20000)
       throw Error('ORIGINAL_HISTORY_TAB_NOT_VERIFIED');
     const quoted="'"+selected.title.replace(/'/g,"''")+"'";
     const raw=await get('/values/'+encodeURIComponent(quoted+'!A1:O20000')+
       '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
     const mirror=group.excelOnly!==true&&mirrorTab&&(archive||visibleLegacy)?
       await get('/values/'+encodeURIComponent("'DATA_CASHCONTROL'!A1:S20000")+
         '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER'):null;
     const compared=compareHistoryToExport({
       project:group.project,month,records:group.records,history:raw.values||[],
       mirror:mirror?.values||[],audit,excelOnly:group.excelOnly===true
     });
     results.push({...compared,googleReads:reads});
   }catch(err){
     if(err?.message==='ADMIN_SESSION_CHANGED')throw err;
     results.push({project:group.project,result:'GOOGLE_REVIEW_REQUIRED',
       reason:String(err?.message||'GOOGLE_READ_FAILED').slice(0,90),
       googleReads:reads,googleWrites:0,canWrite:false});
   }
   onProgress?.(results.length,active.length,results.at(-1));
 }
 return Object.freeze({month,activeProjects:active.length,
   checkedGoogleProjects:results.filter(x=>x.googleCompared).length,
   blockedProjects:results.filter(x=>!x.googleCompared||x.result==='REVIEW_REQUIRED').length,
   googleReads,googleWrites:0,firestoreReads:0,canWrite:false,
   results:Object.freeze(results)});
}
