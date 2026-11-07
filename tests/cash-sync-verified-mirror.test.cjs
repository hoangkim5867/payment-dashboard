'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashValues}=require('../functions/cash-sync/three-way.cjs');
const {HEADER,synchronizeVerifiedDelta}=require('../functions/cash-sync/verified-mirror.cjs');
const {createHash}=require('node:crypto');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourceRow=(amount=321000)=>{
  const values=['2026-11-06','STAGING TEST','CONTRACT-1','TEST','IPC001','支出',0,0,0,0,amount,0,0];
  return {id:'PHU HUNG:expense:001',project:'PHU HUNG',month:'2026-11',values,
    hash:hashValues(values)};
};
const pack=r=>[r.id,r.project,r.month,...r.values,'',r.hash,'synced'];
const baseline=[['2026-11-05','PHU HUNG historic sample',0]];
function fixture({original=[],alterHistory=false,changeAtPreflight=false,partialWrite=false}={}){
  const state={mirror:[HEADER,...original.map(pack)],historical:baseline.map(r=>r.slice()),
    calls:[],writes:0};
  const google={
    readMirror:async tab=>{
      assert.equal(tab,'DATA_CASHCONTROL');
      state.calls.push('readMirror');
      if(changeAtPreflight&&state.calls.filter(x=>x==='readMirror').length===2){
        state.mirror.push(pack(sourceRow(7)));
      }
      return state.mirror.map(r=>r.slice());
    },
    readHistory:async tab=>{
      assert.equal(tab,'PHU HUNG');state.calls.push('readHistory');
      return state.historical.map(r=>r.slice());
    },
    writeMirror:async(tab,changes)=>{
      assert.equal(tab,'DATA_CASHCONTROL');
      state.calls.push('writeMirror');state.writes++;
      for(const item of changes){
        assert.ok(['append','update'].includes(item.kind));
        if(item.kind==='append')state.mirror.push(item.row.slice());
        else state.mirror[item.sheetRow-1]=item.row.slice();
      }
      if(alterHistory)state.historical[0][1]='tampered';
      if(partialWrite)throw Error('Google connection dropped after write');
    }
  };
  const sourceVerifier=async()=>({complete:true,authoritative:true,digest:digest('known complete source')});
  const historyVerifier=async rows=>({complete:true,digest:digest(rows),count:rows.length});
  return {google,state,sourceVerifier,historyVerifier};
}
const sync=(f,changes)=>synchronizeVerifiedDelta({
  canonicalChanges:changes,google:f.google,
  sourceVerifier:f.sourceVerifier,historyVerifier:f.historyVerifier
});
test('verified Sheets executor appends a new PHU HUNG TEST row and checks it',async()=>{
  const f=fixture(),after=sourceRow();
  const result=await sync(f,[{after}]);
  assert.equal(result.status,'synced');assert.equal(result.changed,1);
  assert.equal(f.state.mirror.length,2);
  assert.equal(f.state.mirror[1][10],0); // subcontract lives in H; indirect in K
  assert.equal(f.state.mirror[1][13],321000);
  assert.equal(result.proof.historicalLedgerUnchanged,true);
  assert.equal(f.state.writes,1);
});
test('verified Sheets executor updates same source row and skips repeat',async()=>{
  const old=sourceRow(),next=sourceRow(432100),f=fixture({original:[old]});
  const result=await sync(f,[{before:old,after:next}]);
  assert.equal(result.status,'synced');
  assert.equal(f.state.mirror.length,2);
  assert.equal(f.state.mirror[1][13],432100);
  const again=await sync(f,[{before:old,after:next}]);
  assert.equal(again.status,'unchanged');
  assert.equal(f.state.writes,1);
});
test('manual sheet edit or stale incoming event blocks all writes',async()=>{
  const old=sourceRow(),next=sourceRow(432100),f=fixture({original:[old]});
  f.state.mirror[1][13]=555555;
  await assert.rejects(sync(f,[{before:old,after:next}]),/hash/i);
  assert.equal(f.state.writes,0);
  const stale=fixture({original:[sourceRow(540000)]});
  await assert.rejects(sync(stale,[{before:old,after:next}]),/conflict/i);
  assert.equal(stale.state.writes,0);
});
test('remote mirror changed during preflight is rejected before a write',async()=>{
  const f=fixture({changeAtPreflight:true});
  await assert.rejects(sync(f,[{after:sourceRow()}]),/preflight/);
  assert.equal(f.state.writes,0);
});
test('historical tab changed after write cannot be reported as success',async()=>{
  const f=fixture({alterHistory:true});
  await assert.rejects(sync(f,[{after:sourceRow()}]),/Historical PHU HUNG tab changed/);
  assert.equal(f.state.writes,1);
  assert.equal(f.state.historical[0][1],'tampered');
});
test('partial Google write failure does not claim success; re-read sees no duplicate',async()=>{
  const f=fixture({partialWrite:true});
  await assert.rejects(sync(f,[{after:sourceRow()}]),/connection dropped/);
  assert.equal(f.state.mirror.length,2,'write may have succeeded despite lost response');
  f.google.writeMirror=async()=>{throw Error('No second write should occur')};
  const retry=await sync(f,[{after:sourceRow()}]);
  assert.equal(retry.status,'unchanged');
  assert.equal(f.state.mirror.length,2);
});
test('missing complete-source proof or missing original spreadsheet forbids writes',async()=>{
  const f=fixture();
  f.sourceVerifier=async()=>({complete:false,digest:digest('source')});
  await assert.rejects(sync(f,[{after:sourceRow()}]),/incomplete/);
  assert.equal(f.state.writes,0);
  const g=fixture();
  g.google.readHistory=async()=>{throw Error('No original PHU HUNG accessible')};
  await assert.rejects(sync(g,[{after:sourceRow()}]),/No original/);
  assert.equal(g.state.writes,0);
});
