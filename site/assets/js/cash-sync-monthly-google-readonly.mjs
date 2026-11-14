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
const sourceSignature=values=>JSON.stringify([
 values[0],...values.slice(1,6).map(canonical),...values.slice(6)
]);
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
export function compareHistoryToExport({project,month,records,history,audit}){
 if(!validMonth(month)||!project||!Array.isArray(records)||
   records.length>10000||!Array.isArray(history)||history.length>20000||
   typeof audit!=='function')throw Error('INVALID_READONLY_COMPARISON');
 // The source must be the canonical grouped Export Excel numeric values.
 const signatures=new Map();
 let historyInMonth=0,invalidHistoryRows=0,latest='';
 for(const row of history){
   if(!Array.isArray(row))continue;
   const day=date(row[0]);
   if(!day)continue;
   if(day>latest)latest=day;
   if(day.slice(0,7)!==month)continue;
   historyInMonth++;
   const amountCount=project==='FOXCONN'?8:7;
   const values=[day,...Array.from({length:5},(_,i)=>String(row[1+i]??'')),
     ...Array.from({length:amountCount},(_,i)=>money(row[6+i]))];
   if(values.slice(6).some(x=>!Number.isFinite(x))){
     invalidHistoryRows++;continue;
   }
   const sig=signature(values);
   signatures.set(sig,(signatures.get(sig)||0)+1);
 }
 let exactMatches=0,unmatchedBeforeHistoryEnd=0,newerCandidates=0,
   duplicateHistory=0,invalidSource=0;
 const consumed=new Set();
 for(const record of records){
   if(record?.project!==project||record?.month!==month||
     typeof record.id!=='string'||!record.id||
     !Array.isArray(record.values)||
     record.values.length!==(project==='FOXCONN'?14:13)||
     record.values[0].slice(0,7)!==month||
     record.values.slice(6).some(x=>typeof x!=='number'||!Number.isFinite(x))){
     invalidSource++;continue;
   }
   if(consumed.has(record.id)){invalidSource++;continue}
   consumed.add(record.id);
   const sig=sourceSignature(record.values);
   const n=signatures.get(sig)||0;
   if(n===1){exactMatches++;signatures.set(sig,0)}
   else if(n>1)duplicateHistory++;
   else if(record.values[0]<=latest)unmatchedBeforeHistoryEnd++;
   else newerCandidates++;
 }
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
 const historyUnmatched=[...signatures.values()].reduce((a,b)=>a+b,0);
 const reviewCount=invalidHistoryRows+duplicateHistory+invalidSource+
   unmatchedBeforeHistoryEnd+historyUnmatched;
 return Object.freeze({
   project,month,sourceRows:records.length,historyRows:historicalAudit.transactionRows,
   historyInMonth,exactMatches,newerCandidates,unmatchedBeforeHistoryEnd,
   historyUnmatched,duplicateHistory,invalidHistoryRows,invalidSource,
   historyStatus:historicalAudit.status,closingBalance:historicalAudit.closingBalance,
   nonMonotonicDates:historicalAudit.nonMonotonicDates,
   result:financialReview||dateReview||reviewCount?'REVIEW_REQUIRED':
     newerCandidates?'NEWER_THAN_HISTORY_CANDIDATE':'EXACT_HISTORY_ONLY',
   // Source identity and a snapshot audit alone NEVER authorize writes.
   googleCompared:true,sourceComplete:false,canWrite:false,googleWrites:0
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
       reason:group.state,googleReads:0,googleWrites:0,canWrite:false});
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
     const selected=metadata.sheets.map(s=>s?.properties).find(s=>s?.sheetId===gid);
     if(!selected||selected.hidden===true||!selected.title||
       /^(?:DATA_CASHCONTROL|CASHCONTROL_VIEW|DATA_CASHCONTROL_TEST_)/i.test(selected.title)||
       selected.gridProperties?.rowCount>20000)
       throw Error('ORIGINAL_HISTORY_TAB_NOT_VERIFIED');
     const quoted="'"+selected.title.replace(/'/g,"''")+"'";
     const raw=await get('/values/'+encodeURIComponent(quoted+'!A1:O20000')+
       '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
     const compared=compareHistoryToExport({
       project:group.project,month,records:group.records,history:raw.values||[],audit
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
