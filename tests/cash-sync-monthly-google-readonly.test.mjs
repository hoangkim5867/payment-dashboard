import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanMonthlyGoogleReadOnly,compareHistoryToExport,parseLedgerLink} from '../site/assets/js/cash-sync-monthly-google-readonly.mjs';
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
