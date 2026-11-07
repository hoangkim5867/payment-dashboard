'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashValues}=require('../functions/cash-sync/three-way.cjs');
const {HEADER,MIRROR,indexMirror,synchronizeVerifiedDelta}=
  require('../functions/cash-sync/verified-mirror.cjs');
const {createTestSheetsWriter,allowWrite,ROOT}=
  require('../functions/cash-sync/sheets-writer.cjs');
const {TEST_ID}=require('../functions/cash-sync/sheets-inspector.cjs');
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const env={GCLOUD_PROJECT:'cash-control-staging',
  CASH_SHEETS_TEST_WRITE_ENABLED:'YES',
  CASH_SHEETS_AUTHORIZED_TEST_ID:TEST_ID,
  CASH_SHEETS_LIVE_READBACK_VERIFIED:'YES'};
function row(amount=321000,id='PHU HUNG:expense:001'){
  const values=['2026-11-06','Vendor','LAB-1','TEST','IPC001','支出',
    0,0,0,0,amount,0,0];
  return {id,project:'PHU HUNG',month:'2026-11',values,
    hash:hashValues(values)};
}
const remote=r=>[r.id,r.project,r.month,...r.values,'',r.hash,'synced'];
function fakeGoogle({original=[],tamperBeforeWrite=false,ackButNotWritten=false,
  blankRow=false}={}){
  const state={rows:[HEADER,...original.map(remote)],history:[
    ['Date','Vendor','Contract','Content','IPC','Type','Income','Expenses'],
    ['2026-11-05','old',null,null,null,null,0,0,0,0,0,0,0,13289545382]
  ],requests:[],writes:0,preReads:0};
  if(blankRow)state.rows.splice(1,0,[]);
  const meta={spreadsheetId:TEST_ID,properties:{title:'PHU HUNG TEST'},
    sheets:['PHU HUNG','DATA_CASHCONTROL','PHU_HUNG_VIEW_TEST']
      .map((title,i)=>({properties:{title,sheetId:i}}))};
  const request=async options=>{
    state.requests.push(options);
    if(options.url===ROOT+'?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId))')
      return {data:meta};
    if(options.url.includes('/values/')&&options.method==='GET'){
      if(options.url.includes('DATA_CASHCONTROL')){
        state.preReads++;
        if(tamperBeforeWrite&&state.preReads===3)state.rows.push(remote(row(55,'PHU HUNG:added-outside')));
        return {data:{values:state.rows.map(x=>x.slice())}};
      }
      if(options.url.includes('PHU%20HUNG'))
        return {data:{values:state.history.map(x=>x.slice())}};
    }
    if(options.url===ROOT+'/values:batchUpdate'&&options.method==='POST'){
      state.writes++;
      assert.equal(options.data.valueInputOption,'RAW');
      const ranges=options.data.data.map(x=>x.range);
      for(const range of ranges)assert.match(range,/^'DATA_CASHCONTROL'!A\d+:S\d+$/);
      if(!ackButNotWritten){
        for(const item of options.data.data){
          const m=/^'DATA_CASHCONTROL'!A(\d+):S\d+$/.exec(item.range);
          const idx=Number(m[1])-1;
          state.rows[idx]=item.values[0].slice();
        }
      }
      return {data:{spreadsheetId:TEST_ID,
        responses:options.data.data.map(()=>({updatedCells:19}))}};
    }
    throw Error('Unexpected TEST Google Sheets API URL: '+options.url);
  };
  return {state,request,writer:createTestSheetsWriter({request,env})};
}
const verified={
  sourceVerifier:async()=>({complete:true,authoritative:true,digest:hash('verified full source')}),
  historyVerifier:async rows=>({complete:true,digest:hash(rows),count:rows.length})
};
test('server writer cannot be created on production or without explicit TEST gates',()=>{
  for(const bad of [
    {...env,GCLOUD_PROJECT:'cscecmep-payment'},
    {...env,CASH_SHEETS_TEST_WRITE_ENABLED:'NO'},
    {...env,CASH_SHEETS_AUTHORIZED_TEST_ID:'WRONG'},
    {...env,CASH_SHEETS_LIVE_READBACK_VERIFIED:'NO'}
  ]){
    assert.throws(()=>allowWrite(bad));
    assert.throws(()=>createTestSheetsWriter({env:bad,request:async()=>{}}));
  }
});
test('full source proof to Google TEST append uses RAW A:S fixed row and reads back',async()=>{
  const f=fakeGoogle(),newRow=row();
  const result=await synchronizeVerifiedDelta({
    canonicalChanges:[{after:newRow}],google:f.writer,...verified
  });
  assert.equal(result.status,'synced');
  assert.equal(f.state.writes,1);
  assert.equal(f.state.rows.length,2);
  assert.equal(f.state.rows[1][0],newRow.id);
  assert.equal(f.state.rows[1][13],321000);
  assert.equal(f.state.requests.filter(x=>x.method==='POST').length,1);
  assert.equal(f.state.requests.some(x=>/PHU_HUNG_VIEW_TEST.*batchUpdate/.test(x.url)),false);
  assert.equal(f.state.history.length,2,'historical tab must remain untouched');
  const repeat=await synchronizeVerifiedDelta({
    canonicalChanges:[{after:newRow}],google:f.writer,...verified
  });
  assert.equal(repeat.status,'unchanged');assert.equal(f.state.writes,1);
});
test('verified old hash allows exact same source ID to change 321000 to 432100',async()=>{
  const before=row(321000),after=row(432100),f=fakeGoogle({original:[before]});
  const result=await synchronizeVerifiedDelta({
    canonicalChanges:[{before,after}],google:f.writer,...verified
  });
  assert.equal(result.status,'synced');assert.equal(f.state.rows.length,2);
  assert.equal(f.state.rows[1][13],432100);
});
test('a missing full-source proof forbids every Google POST',async()=>{
  const f=fakeGoogle();
  await assert.rejects(synchronizeVerifiedDelta({
    canonicalChanges:[{after:row()}],google:f.writer,
    ...verified,sourceVerifier:async()=>({complete:true,authoritative:false,
      digest:hash('untrusted')})
  }),/Unverified canonical source/);
  assert.equal(f.state.writes,0);
});
test('pre-write changed mirror blocks any overwrite',async()=>{
  const f=fakeGoogle({tamperBeforeWrite:true});
  await assert.rejects(synchronizeVerifiedDelta({
    canonicalChanges:[{after:row()}],google:f.writer,...verified
  }),/mirror changed/i);
  assert.equal(f.state.writes,0);
});
test('Google HTTP success without updated cell fails readback',async()=>{
  const f=fakeGoogle({ackButNotWritten:true});
  await assert.rejects(synchronizeVerifiedDelta({
    canonicalChanges:[{after:row()}],google:f.writer,...verified
  }),/read-back/);
  assert.equal(f.state.writes,1);
});
test('sparse mirror rows are rejected instead of overwriting an unknown position',async()=>{
  const f=fakeGoogle({blankRow:true});
  await assert.rejects(synchronizeVerifiedDelta({
    canonicalChanges:[{after:row()}],google:f.writer,...verified
  }),/Sparse TEST mirror/);
  assert.equal(f.state.writes,0);
});
test('TEST writer never accepts direct write to protected historical or view tabs',async()=>{
  const f=fakeGoogle();
  await assert.rejects(f.writer.writeMirror('PHU HUNG',[],hash([])),/forbidden/);
  await assert.rejects(f.writer.writeMirror('PHU_HUNG_VIEW_TEST',[],hash([])),/forbidden/);
  assert.equal(f.state.requests.length,0);
});
test('bad prior row hash and duplicate source IDs reject entire TEST request',async()=>{
  const before=row(),newRow=row(432100),f=fakeGoogle({original:[before]});
  const current=indexMirror(f.state.rows);
  await assert.rejects(f.writer.writeMirror(MIRROR,[{
    kind:'update',id:before.id,row:remote(newRow),
    sheetRow:2,expectedHash:'f'.repeat(64)
  }],current.signature),/previous source hash/);
  await assert.rejects(f.writer.writeMirror(MIRROR,[{
    kind:'append',id:before.id,row:remote(before),sheetRow:null
  }],current.signature),/unexpectedly exists/);
  assert.equal(f.state.writes,0);
});
