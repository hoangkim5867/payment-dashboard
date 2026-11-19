import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanMonthlyGoogleReadOnly,compareHistoryToExport,parseLedgerLink,isDateOrderOnlyHistoryWarning,summarizeMatchedHistoryReadOnly} from '../site/assets/js/cash-sync-monthly-google-readonly.mjs';
const sheetId='ABCdefghIJ12345KLmnopQRS78901234';
const link='https://docs.google.com/spreadsheets/d/'+sheetId+'/edit#gid=17';
const date='2026-10-26';
const source=(id,amount=100)=>({id,project:'ELYSIAN',month:'2026-10',
 values:[date,'Vendor','LAB-001','Invoice','IPC001','Material',0,0,amount,0,0,0,0]});
const raw=(amount=100)=>[date,'Vendor','LAB-001','Invoice','IPC001','Material',0,0,amount,0,0,0,0,1000];
const audit=(rows)=>({status:'internally-consistent',transactionRows:rows.length,
 closingBalance:1000,financialIssues:0,missingBalance:0,nonMonotonicDates:0,layoutErrors:0});
test('parses trusted original Google gid and rejects view, missing gid and forged host',()=>{
 assert.deepEqual(parseLedgerLink(link),{spreadsheetId:sheetId,gid:17});
 assert.throws(()=>parseLedgerLink('https://docs.google.com/spreadsheets/d/'+sheetId+'/edit'),/GID_REQUIRED/);
 assert.throws(()=>parseLedgerLink('https://evil.example/spreadsheets/d/'+sheetId+'/edit#gid=17'),/LINK_INVALID/);
 assert.throws(()=>parseLedgerLink(link+'?gid=999'),/LINK_INVALID|GID_REQUIRED/);
});
test('compares source with historical exact signatures, no Google writes',()=>{
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
 records:[source('expense:1')],history:[raw()],audit});
 assert.equal(x.exactMatches,1);
 assert.equal(x.newerCandidates,0);
 assert.equal(x.historyUnmatched,0);
 assert.equal(x.result,'EXACT_HISTORY_ONLY');
 assert.equal(x.canWrite,false);
 assert.equal(x.googleWrites,0);
});
test('older mismatches and duplicate historical signatures block eligibility',()=>{
 const mismatch=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
 records:[source('expense:1',120)],history:[raw(100)],audit});
 assert.equal(mismatch.result,'REVIEW_REQUIRED');
 assert.equal(mismatch.unmatchedBeforeHistoryEnd,1);
 const dup=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
 records:[source('expense:1')],history:[raw(),raw()],audit});
 assert.equal(dup.duplicateHistory,1);
 assert.equal(dup.result,'REVIEW_REQUIRED');
});
test('newer source rows are candidates, never proof of full source or write permission',()=>{
 const later={...source('expense:2'),values:['2026-10-27',...source('expense:2').values.slice(1)]};
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
 records:[source('expense:1'),later],history:[raw()],audit});
 assert.equal(x.exactMatches,1);
 assert.equal(x.newerCandidates,1);
 assert.equal(x.result,'NEWER_THAN_HISTORY_CANDIDATE');
 assert.equal(x.sourceComplete,false);
 assert.equal(x.canWrite,false);
});
test('Admin read-only details show source and Google row positions, without raw payment data',()=>{
 const changed={...source('private-payment-id',120),values:[...source('private-payment-id',120).values]};
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[changed],history:[['HEADER'],raw(100)],audit});
 assert.equal(x.result,'REVIEW_REQUIRED');
 assert.equal(x.googleWrites,0);
 assert.equal(x.canWrite,false);
 assert.ok(x.reviewRows.some(r=>r.origin==='CASH_CONTROL'&&r.sourceRow===1));
 assert.ok(x.reviewRows.some(r=>r.origin==='GOOGLE_HISTORY'&&r.googleRow===2));
 const serialized=JSON.stringify(x.reviewRows);
 assert.ok(!serialized.includes('private-payment-id'));
 assert.ok(!serialized.includes('LAB-001'));
 assert.ok(!serialized.includes('120'));
});

test('unique matching contract IPC with different amount gets a review-only pair',()=>{
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
   records:[source('invoice:changing-amount',120)],history:[raw(100)],audit});
 const candidate=x.reviewRows.find(r=>r.origin==='CASH_CONTROL');
 assert.equal(candidate.sourceRow,1);
 assert.equal(candidate.googleRow,1);
 assert.equal(candidate.code,'SAME_CONTRACT_IPC_REVIEW');
 assert.deepEqual(candidate.changedFields,['AMOUNT_COLUMNS']);
 assert.equal(candidate.financialDifference,true);
 assert.equal(x.exactMatches,0);
 assert.equal(x.canWrite,false);
 assert.equal(x.googleWrites,0);
});
test('unique same-day amount but contract mismatch is only a review hint',()=>{
 const changed={...source('invoice:another-contract'),values:[...source('invoice:another-contract').values]};
 changed.values[2]='DIFFERENT-CONTRACT';
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[changed],history:[raw()],audit});
 assert.equal(x.reviewRows.find(r=>r.origin==='CASH_CONTROL').code,'POSSIBLE_SAME_DAY_AMOUNT_REVIEW');
 assert.equal(x.reviewRows.find(r=>r.origin==='CASH_CONTROL').googleRow,1);
 assert.deepEqual(x.reviewRows.find(r=>r.origin==='CASH_CONTROL').changedFields,['CONTRACT']);
 assert.equal(x.reviewRows.find(r=>r.origin==='CASH_CONTROL').financialDifference,false);
 assert.equal(x.canWrite,false);
});
test('ambiguous amount-only matches must not make invented pairs',()=>{
 const src={...source('invoice:different-contract'),values:[...source('invoice:different-contract').values]};
 src.values[2]='OTHER';
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',records:[src],
  history:[raw(),[...raw().slice(0,2),'SECOND',...raw().slice(3)]],audit});
 assert.equal(x.reviewRows.find(r=>r.origin==='CASH_CONTROL').googleRow,null);
 assert.equal(x.canWrite,false);
});

test('35-project one-click read-only scan fetches Google only for active and eligible projects',async()=>{
 const groups=Array.from({length:35},(_,i)=>({
   project:'PROJECT'+i,month:'2026-10',groupedExcelRows:0,records:[],
   state:'NO_ROWS_IN_LOADED_MEMORY'
 }));
 groups[2]={project:'ELYSIAN',month:'2026-10',groupedExcelRows:1,
   records:[source('expense:1')],state:'HISTORY_COMPARISON_CANDIDATE'};
 groups[3]={project:'FOXCONN',month:'2026-10',groupedExcelRows:19,
   records:[],state:'SOURCE_REVIEW_REQUIRED'};
 const calls=[];
 const fetcher=async(url,options)=>{
   calls.push({url,method:options.method,headers:options.headers});
   if(url.includes('?fields='))return {ok:true,json:async()=>({
     spreadsheetId:sheetId,sheets:[{properties:{
       sheetId:17,title:'SỔ GỐC',hidden:false,gridProperties:{rowCount:500}}}]
   })};
   return {ok:true,json:async()=>({values:[raw()]})};
 };
 const progress=[];
 const result=await scanMonthlyGoogleReadOnly({month:'2026-10',groups,
   links:{ELYSIAN:link},accessToken:'T'.repeat(60),fetcher,audit,
   expectedOwner:()=>true,onProgress:(i,n)=>progress.push([i,n])});
 assert.equal(result.activeProjects,2);
 assert.equal(result.checkedGoogleProjects,1);
 assert.equal(result.blockedProjects,1);
 assert.equal(result.googleReads,2);
 assert.equal(result.googleWrites,0);
 assert.equal(result.canWrite,false);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.method==='GET'&&
   x.headers.Authorization==='Bearer '+'T'.repeat(60)&&
   !x.url.includes(':batchUpdate')&&!x.url.includes(':append')));
 assert.deepEqual(progress,[[1,2],[2,2]]);
 assert.equal(result.results[0].exactMatches,1);
 assert.equal(result.results[1].result,'SOURCE_NOT_READY');
});
test('one bad Google link is skipped while other eligible project continues; Admin session cancels',async()=>{
 const rows=[{project:'ELYSIAN',month:'2026-10',groupedExcelRows:1,
   records:[source('expense:1')],state:'HISTORY_COMPARISON_CANDIDATE'},
   {project:'SSIS',month:'2026-10',groupedExcelRows:1,
    records:[],state:'HISTORY_COMPARISON_CANDIDATE'}];
 const x=await scanMonthlyGoogleReadOnly({month:'2026-10',groups:rows,
    links:{ELYSIAN:'not a link',SSIS:link},
    accessToken:'X'.repeat(60),fetcher:async(url)=>url.includes('?fields=')?
      {ok:true,json:async()=>({spreadsheetId:sheetId,sheets:[
        {properties:{sheetId:17,title:'SOURCE',hidden:false}}]})}:
      {ok:true,json:async()=>({values:[]})},audit,expectedOwner:()=>true});
 assert.equal(x.results[0].result,'GOOGLE_REVIEW_REQUIRED');
 assert.equal(x.checkedGoogleProjects,1);
 assert.equal(x.googleReads,2);
 await assert.rejects(scanMonthlyGoogleReadOnly({month:'2026-10',
   groups:rows,links:{},accessToken:'X'.repeat(60),fetcher:async()=>{throw Error('must not read')},
   audit,expectedOwner:()=>false}),/ADMIN_SESSION_CHANGED/);
});
test('historic audit requiring inspection cannot be promoted to ready',()=>{
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
 records:[source('expense:1')],history:[raw()],audit:()=>({
   ...audit([raw()]),status:'review-date-order',nonMonotonicDates:3})});
 assert.equal(x.result,'REVIEW_REQUIRED');
 assert.equal(x.reviewCategory,'DATE_ORDER_ONLY');
 assert.equal(x.canWrite,false);
});

test('an unresolved historical posting remains a transaction review even with a date warning',()=>{
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[source('expense:1',120)],history:[raw(100)],audit:()=>({
   ...audit([raw()]),status:'review-date-order',nonMonotonicDates:2})});
 assert.equal(x.result,'REVIEW_REQUIRED');
 assert.equal(x.reviewCategory,'TRANSACTION_REVIEW');
 assert.equal(x.canWrite,false);
});

test('new month candidates are never labeled date-only when history has inverted dates',()=>{
 const later={...source('expense:2'),values:['2026-10-27',...source('expense:2').values.slice(1)]};
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[later],history:[['2026-09-26',...raw().slice(1)]],audit:()=>({
   ...audit([raw()]),status:'review-date-order',nonMonotonicDates:2})});
 assert.equal(x.newerCandidates,1);
 assert.equal(x.reviewCategory,'NEWER_OR_BACKFILL_CANDIDATES_ONLY');
 assert.equal(x.result,'NEWER_THAN_HISTORY_CANDIDATE');
 // Date order is preserved; no original Google row is changed.
 assert.equal(x.canWrite,false);
});

test('FOXCONN Excel comparison folds import VAT into other direct only for workbook evidence',()=>{
 const values=[date,'Vendor','','Invoice','','Tax',0,0,0,125,0,0,0,0];
 const google=[date,'Vendor','','Invoice','','Tax',0,0,0,25,0,0,0,100,875];
 const args={project:'FOXCONN',month:'2026-10',
   records:[{id:'excel-row:6',project:'FOXCONN',month:'2026-10',values}],
   history:[google],audit};
 assert.equal(compareHistoryToExport(args).exactMatches,0);
 assert.equal(compareHistoryToExport({...args,excelOnly:true}).exactMatches,1);
});

test('identical source rows remain duplicates even with different Excel positions',()=>{
 const x=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
   records:[source('excel-row:6'),source('excel-row:7')],history:[raw()],audit});
 assert.equal(x.duplicateSource,2);
 assert.equal(x.exactMatches,0);
 assert.equal(x.newerCandidates,0);
 assert.equal(x.result,'REVIEW_REQUIRED');
});

test('unique contract and IPC posting with a label difference stays review-only',()=>{
 const old=raw();
 old[3]='Old wording';
 const args={project:'ELYSIAN',month:'2026-10',records:[source('expense:1')],audit};
 const x=compareHistoryToExport({...args,history:[old]});
 assert.equal(x.likelyLabelDifferences,1);
 assert.equal(x.exactMatches,0);
 assert.equal(x.canWrite,false);
 assert.equal(compareHistoryToExport({...args,history:[old,old]}).likelyLabelDifferences,0);
});

test('PHU HUNG archived original may be hidden only with real visible main and hidden mirror',async()=>{
 const items=[{project:'PHU HUNG',month:'2026-10',groupedExcelRows:1,
  records:[{...source('expense:PHU'),project:'PHU HUNG'}],
  state:'HISTORY_COMPARISON_CANDIDATE'}];
 const makeMeta=(mainVisible,mirrorHidden)=>({spreadsheetId:sheetId,sheets:[
  {properties:{sheetId:17,title:'PHU_HUNG_HISTORY_BACKUP',hidden:true,
   gridProperties:{rowCount:500}}},
  {properties:{sheetId:18,title:'PHU HUNG',hidden:!mainVisible}},
  {properties:{sheetId:19,title:'DATA_CASHCONTROL',hidden:mirrorHidden}}
 ]});
 for(const [mainVisible,mirrorHidden,pass] of [
  [true,true,true],[false,true,false],[true,false,false]]){
  let reads=0;
  const result=await scanMonthlyGoogleReadOnly({month:'2026-10',groups:items,
   links:{'PHU HUNG':link},accessToken:'T'.repeat(60),audit,
   expectedOwner:()=>true,fetcher:async url=>{
    reads++;
    return {ok:true,json:async()=>url.includes('?fields=')?
     makeMeta(mainVisible,mirrorHidden):{values:url.includes('DATA_CASHCONTROL')?[]:[raw()]}};
   }});
  assert.equal(result.googleWrites,0);
  assert.equal(result.canWrite,false);
  assert.equal(result.checkedGoogleProjects,pass?1:0);
  assert.equal(reads,pass?3:1);
  if(pass)assert.equal(result.results[0].exactMatches,1);
  else assert.equal(result.results[0].reason,'ORIGINAL_HISTORY_TAB_NOT_VERIFIED');
 }
});
test('an arbitrary hidden original remains blocked even if the project resembles PHU HUNG',async()=>{
 const row={project:'ELYSIAN',month:'2026-10',groupedExcelRows:1,
  records:[source('expense:1')],state:'HISTORY_COMPARISON_CANDIDATE'};
 const result=await scanMonthlyGoogleReadOnly({month:'2026-10',
  groups:[row],links:{ELYSIAN:link},accessToken:'T'.repeat(60),
  expectedOwner:()=>true,audit,fetcher:async url=>({ok:true,json:async()=>url.includes('?fields=')?
   {spreadsheetId:sheetId,sheets:[{properties:{
    sheetId:17,title:'HIDDEN_PRIVATE_LEDGER',hidden:true}}]}:
   {values:[raw()]}})});
 assert.equal(result.results[0].reason,'ORIGINAL_HISTORY_TAB_NOT_VERIFIED');
 assert.equal(result.googleWrites,0);
});

test('missing October posting before the last Google date is a BACKFILL candidate only if identity and money do not collide',()=>{
 const earlier={...source('expense:backfill'),values:[
  '2026-10-13','Vendor B','SUBP-OTHER','New invoice','IPC008','Material',
  0,0,150,0,0,0,0]};
 const result=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[source('expense:historical'),earlier],history:[raw()],audit});
 assert.equal(result.exactMatches,1);
 assert.equal(result.newerCandidates,0);
 assert.equal(result.backfillCandidates,1);
 assert.equal(result.unsafeBackfill,0);
 assert.equal(result.result,'NEWER_THAN_HISTORY_CANDIDATE');
 assert.equal(result.canWrite,false);
 assert.equal(result.googleWrites,0);
 const suspicious={...earlier,id:'expense:conflict',
  values:[date,'Someone else','different-contract','New label','IPC003','Material',
   0,0,100,0,0,0,0]};
 const bad=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[suspicious],history:[raw()],audit});
 assert.equal(bad.backfillCandidates,0);
 assert.equal(bad.unsafeBackfill,1);
 assert.equal(bad.result,'REVIEW_REQUIRED');
});


test('start-month proposal depends only on presence of October 2026 original rows',()=>{
 const present=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[source('expense:oct')],history:[raw()],audit});
 assert.equal(present.syncStartMonth,'2026-11');
 assert.equal(present.originalOctoberPresent,true);
 const prior=['2026-09-30','Vendor','LAB-001','Invoice','IPC001',
  'Material',0,0,100,0,0,0,0,900];
 const missing=compareHistoryToExport({project:'ELYSIAN',month:'2026-10',
  records:[source('expense:oct')],history:[prior],audit});
 assert.equal(missing.syncStartMonth,'2026-10');
 assert.equal(missing.originalOctoberPresent,false);
 assert.equal(missing.canWrite,false);
});

const mirrorHeader=['sourceId','projectKey','month','date','company','contractNo',
 'content','ipc','type','income','subcontract','material','otherDirect',
 'indirect','financial','otherPayable','importTaxVat','sourceHash','syncStatus'];
const synced=(r,status='synced')=>[r.id,r.project,r.month,...r.values,0,'a'.repeat(64),status];

test('reads a managed archived ledger and recognizes a posted ID even when labels differ',async()=>{
 const receipt=source('expense:posted');
 const existing=synced(receipt);
 existing[6]='Previously posted wording';
 const calls=[];
 const result=await scanMonthlyGoogleReadOnly({month:'2026-10',
  groups:[{project:'ELYSIAN',groupedExcelRows:1,records:[receipt],
   state:'HISTORY_COMPARISON_CANDIDATE'}],links:{ELYSIAN:link},
  accessToken:'T'.repeat(60),audit,fetcher:async (url,{method})=>{
    calls.push(method);
    return {ok:true,json:async()=>url.includes('?fields=')?
      {spreadsheetId:sheetId,sheets:[
       {properties:{sheetId:17,title:'ELYSIAN_HISTORY_BACKUP',hidden:true}},
       {properties:{sheetId:18,title:'ELYSIAN'}},
       {properties:{sheetId:19,title:'DATA_CASHCONTROL',hidden:true}}]}:
      {values:url.includes('DATA_CASHCONTROL')?[mirrorHeader,existing]:[]}};
  }});
 assert.deepEqual(calls,['GET','GET','GET']);
 assert.equal(result.results[0].syncedMatches,1);
 assert.equal(result.results[0].newerCandidates,0);
 assert.equal(result.results[0].result,'EXACT_HISTORY_ONLY');
 assert.equal(result.googleWrites,0);
});

test('changed or duplicate mirror IDs cannot become new candidates',()=>{
 const existing=source('expense:posted');
 const args={project:'ELYSIAN',month:'2026-10',history:[],audit,
   records:[source(existing.id,120)],mirror:[mirrorHeader,synced(existing)]};
 const result=compareHistoryToExport(args);
 assert.equal(result.mirrorConflicts,1);
 assert.equal(result.newerCandidates,0);
 assert.equal(result.result,'REVIEW_REQUIRED');
 assert.throws(()=>compareHistoryToExport({...args,
   mirror:[...args.mirror,synced(existing)]}),/GOOGLE_SYNC_INDEX_INVALID/);
});

test('S6-1 opening balance remains in the audit but is not an unmatched transaction',()=>{
 const opening=['2026-11-01','','','Số dư đầu kỳ tháng 11/2026','','Số dư đầu kỳ',
  0,0,0,0,0,0,0,978418722];
 const receipt={id:'expense:receipt',project:'S6-1',month:'2026-11',
  values:['2026-11-01','','','IPC23','IPC23','Receipt',138700853,0,0,0,0,0,0]};
 const result=compareHistoryToExport({project:receipt.project,month:receipt.month,
  history:[opening],records:[receipt],mirror:[mirrorHeader,synced(receipt)],
  audit:rows=>{assert.deepEqual(rows,[opening]);return audit(rows)}});
 assert.equal(result.historyUnmatched,0);
 assert.equal(result.syncedMatches,1);
 assert.equal(result.result,'EXACT_HISTORY_ONLY');
});

test('date order only is not called a financial/source discrepancy in read-only presentation',()=>{
 const dateOnly=compareHistoryToExport({
   project:'ELYSIAN',month:'2026-10',records:[source('expense:matched')],
   history:[raw()],audit:()=>({...audit([raw()]),
     status:'review-date-order',nonMonotonicDates:2})
 });
 const clean=compareHistoryToExport({
   project:'ELYSIAN',month:'2026-10',records:[source('expense:matched')],
   history:[raw()],audit
 });
 assert.equal(isDateOrderOnlyHistoryWarning(dateOnly),true);
 assert.equal(isDateOrderOnlyHistoryWarning(clean),false);
 const summary=summarizeMatchedHistoryReadOnly([dateOnly,clean]);
 assert.equal(summary.dateOrderOnly,1);
 assert.equal(summary.withoutDate,1);
 assert.equal(summary.otherReview,0);
 assert.equal(summary.noNewRows,true);
 assert.equal(summary.googleWrites,0);
 assert.equal(summary.canWrite,false);
 assert.equal(dateOnly.result,'REVIEW_REQUIRED'); // Server review gate is unchanged.
});
test('date warning with amount mismatch or unmatched records remains blocked',()=>{
 const mismatch=compareHistoryToExport({
   project:'ELYSIAN',month:'2026-10',records:[source('expense:changed',120)],
   history:[raw()],audit:()=>({...audit([raw()]),
     status:'review-date-order',nonMonotonicDates:1})
 });
 assert.equal(isDateOrderOnlyHistoryWarning(mismatch),false);
 const summary=summarizeMatchedHistoryReadOnly([mismatch]);
 assert.equal(summary.otherReview,1);
 assert.equal(summary.allRowsMatched,false);
 assert.equal(summary.canWrite,false);
});


test('empty read-only batch never claims all 35-project history verified',()=>{
 const summary=summarizeMatchedHistoryReadOnly([]);
 assert.equal(summary.dateOrderOnly,0);
 assert.equal(summary.withoutDate,0);
 assert.equal(summary.allRowsMatched,false);
 assert.equal(summary.noNewRows,false);
 assert.equal(summary.canWrite,false);
 assert.equal(summary.googleWrites,0);
});
test('November checkpoint: seven date-order-only and four exact, zero extra posts',()=>{
 const template={result:'REVIEW_REQUIRED',reviewCategory:'DATE_ORDER_ONLY',
  dateReview:true,financialReview:false,sourceRows:2,exactMatches:2,
  newerCandidates:0,backfillCandidates:0,historyUnmatched:0,
  duplicateHistory:0,duplicateSource:0,invalidSource:0,
  invalidHistoryRows:0,mirrorConflicts:0,unmatchedMirrorRows:0};
 const results=[
  ...Array.from({length:7},(_,i)=>({...template,project:'WARN_'+i})),
  ...Array.from({length:4},(_,i)=>({...template,project:'CLEAN_'+i,
    result:'EXACT_HISTORY_ONLY',reviewCategory:'EXACT_HISTORY',dateReview:false}))
 ];
 const summary=summarizeMatchedHistoryReadOnly(results);
 assert.equal(summary.dateOrderOnly,7);
 assert.equal(summary.withoutDate,4);
 assert.equal(summary.otherReview,0);
 assert.equal(summary.allRowsMatched,true);
 assert.equal(summary.noNewRows,true);
 assert.equal(summary.canWrite,false);
 assert.equal(summary.googleWrites,0);
});
