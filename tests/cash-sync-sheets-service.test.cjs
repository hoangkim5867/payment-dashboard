'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TEST_ID,validateMetadata,safeRange,createTestSheetsInspector}=
  require('../functions/cash-sync/sheets-inspector.cjs');
function metadata({id=TEST_ID,title='PHU HUNG - TEST DONG BO',historic=true}={}){
  return {spreadsheetId:id,properties:{title},sheets:[
    ...(historic?[{properties:{title:'PHU HUNG',sheetId:0}}]:[]),
    {properties:{title:'DATA_CASHCONTROL',sheetId:1}},
    {properties:{title:'PHU_HUNG_VIEW_TEST',sheetId:2}}
  ]};
}
test('Google Sheets worker accepts only known TEST spreadsheet with original history',()=>{
  assert.equal(validateMetadata(metadata()).spreadsheetId,TEST_ID);
  assert.throws(()=>validateMetadata(metadata({id:'production-spreadsheet-id'})),/Unexpected/);
  assert.throws(()=>validateMetadata(metadata({title:'PHU HUNG ORIGINAL'})),/Unexpected/);
  assert.throws(()=>validateMetadata(metadata({historic:false})),/Unexpected/);
});
test('Google Sheets inspector is read-only, bounded, and never opens arbitrary tabs',async()=>{
  const calls=[];
  const inspector=createTestSheetsInspector({request:async ({url})=>{
    calls.push(url);
    if(url.includes('?fields='))return {data:metadata()};
    return {data:{values:[['date','company'],['2026-11-06','TEST']]}};
  }});
  const values=await inspector.read('PHU_HUNG_VIEW_TEST','A1:Q10001');
  assert.equal(values.length,2);
  assert.equal(calls.length,2);
  assert.ok(calls.every(x=>x.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'+TEST_ID)));
  assert.ok(Object.keys(inspector).sort().join(',')==='metadata,read,readFormulas');
  assert.throws(()=>safeRange('PHU HUNG','K99:K99'),/not allowed/);
  assert.throws(()=>safeRange('production','A1:N10001'),/not allowed/);
});
test('Google inspector fails closed on missing values or malformed response',async()=>{
  const inspector=createTestSheetsInspector({request:async ({url})=>
    url.includes('fields=')?{data:metadata()}:{data:{values:null}}});
  await assert.rejects(inspector.read('PHU HUNG','A1:N10001'),/missing/);
});
