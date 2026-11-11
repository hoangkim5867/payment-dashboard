'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readOnlyProjectAudit}=require('../server/cash-sync-multiproject-google-read.cjs');
const entry={project:'EATON',spreadsheetId:'EXAMPLE_sheet_123456789012345',
 gid:'1214250390',status:'pending-readonly-audit'};
const source=[{project:'EATON',id:'tx1',date:'2026-10-01',
 amounts:[100,20,0,0,0,0,0]}];
const history=[['日期'],['2026-10-01','Company','LAB-1','Item','IPC1','type',
 100,20,0,0,0,0,0,1080]];
const token='Bearer '+ 'A'.repeat(40);
function fakeFetch(metadata,rows){
 const requests=[];
 const fetcher=async (url,options)=>{
   requests.push({url,method:options.method});
   const values=url.includes('/values/');
   const body=values?{values:rows}:metadata;
   return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
 };
 return {fetcher,requests};
}
test('two Google GETs, correct file/gid and offline reconciliation, never writes',async()=>{
 const api=fakeFetch({spreadsheetId:entry.spreadsheetId,sheets:[
  {properties:{sheetId:1214250390,title:'Historical records'}}]},history);
 const report=await readOnlyProjectAudit(entry,source,1000,token,{fetcher:api.fetcher});
 assert.equal(report.historicalCount,1);
 assert.equal(report.rowsMatched,1);
 assert.equal(report.closingBalanceVerified,true);
 assert.equal(report.canWrite,false);
 assert.equal(report.sourceCompletenessVerified,false);
 assert.equal(api.requests.length,2);
 assert.ok(api.requests.every(x=>x.method==='GET'));
 assert.ok(api.requests.every(x=>x.url.includes(entry.spreadsheetId)));
 assert.ok(api.requests[1].url.includes('Historical%20records'));
});
test('wrong metadata file ID aborts before reading any tab',async()=>{
 const api=fakeFetch({spreadsheetId:'another',sheets:[
  {properties:{sheetId:1214250390,title:'Historical records'}}]},history);
 await assert.rejects(()=>readOnlyProjectAudit(entry,source,1000,token,
  {fetcher:api.fetcher}));
 assert.equal(api.requests.length,1);
});
test('a changed balance is blocked from write approval',async()=>{
 const changed=history.map(row=>row.slice());changed[1][13]=1081;
 const api=fakeFetch({spreadsheetId:entry.spreadsheetId,sheets:[
  {properties:{sheetId:1214250390,title:'Historical records'}}]},changed);
 const result=await readOnlyProjectAudit(entry,source,1000,token,
  {fetcher:api.fetcher});
 assert.equal(result.status,'requires-manual-reconciliation');
 assert.equal(result.canWrite,false);
});
test('PHU HUNG and missing OAuth cannot reach Google',async()=>{
 const api=fakeFetch({},history);
 await assert.rejects(()=>readOnlyProjectAudit(
  {...entry,project:'PHU HUNG',status:'existing-sync-protected'},
  source,1000,token,{fetcher:api.fetcher}));
 await assert.rejects(()=>readOnlyProjectAudit(entry,source,1000,'',
  {fetcher:api.fetcher}));
 assert.equal(api.requests.length,0);
});
test('Google returned errors fail closed',async()=>{
 const requests=[];
 const fetcher=async (url,opts)=>{
  requests.push(opts.method);return {ok:false,status:403};
 };
 await assert.rejects(()=>readOnlyProjectAudit(entry,source,1000,token,{fetcher}),
   /Google read failed/);
 assert.deepEqual(requests,['GET']);
});
