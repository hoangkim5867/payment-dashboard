'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashValues}=require('../functions/cash-sync/three-way.cjs');
const {HEADER,HISTORY,MIRROR,indexMirror}=
  require('../functions/cash-sync/verified-mirror.cjs');
const {verifyHistory}=require('../functions/cash-sync/history-audit.cjs');
const {planMonth,createReconciler}=require('../functions/cash-sync/month-reconciler.cjs');
const histValues=['2026-10-30','OLD VENDOR','LAB-01','Original','IPC017','支出',
  0,0,0,0,321000,0,0];
const makeRow=(id,values,month=values[0].slice(0,7))=>({
  id,project:'PHU HUNG',month,values,hash:hashValues(values)});
const old=makeRow('PHU HUNG:expense:old',histValues);
const fresh=makeRow('PHU HUNG:expense:new',
  ['2026-11-06','TEST VENDOR','LAB-02','Test','IPC018','支出',
    0,0,0,0,432100,0,0]);
const pack=r=>[r.id,r.project,r.month,...r.values,'',r.hash,'synced'];
const history=[
  ['Ngày','Công ty','HĐ','Nội dung','IPC','Loại','Thu','Thầu phụ','Vật tư','CP khác','Gián tiếp','Tài chính','Phải trả','Số dư'],
  [...histValues,13289545382]
];
const formulas=[[],['=N1+G2-SUM(H2:M2)']];
// The historical first row is dated and its formula references the correct
// own row. Prior closing is never checked against a header's numeric N1.
const historical=[[...histValues,13289545382]];
const historicalFormulas=[['=10000000000+G1-SUM(H1:M1)']];
const h=verifyHistory(historical,historicalFormulas);
const source=(month,rows)=>({
  project:'PHU HUNG',month,rows,
  proof:'a'.repeat(64),authoritative:true,sourceComplete:true
});
test('one-to-one matching skips an already-accounted historical transaction',()=>{
  const rows=planMonth({source:source('2026-10',[old]),
    history:h,mirror:indexMirror([HEADER])});
  assert.equal(rows.matchedHistory,1);
  assert.equal(rows.pending.length,0);
  assert.equal(rows.sourceCount,1);
});
test('new dated transaction is added once; historical tab never changes',async()=>{
  const state={mirror:[HEADER],history:historical.map(r=>r.slice()),
    formulas:historicalFormulas.map(r=>r.slice()),writes:0};
  const google={
    readMirror:async tab=>{assert.equal(tab,MIRROR);return state.mirror.map(r=>r.slice())},
    readHistory:async tab=>{assert.equal(tab,HISTORY);return state.history.map(r=>r.slice())},
    writeMirror:async(tab,changes)=>{
      assert.equal(tab,MIRROR);state.writes++;
      assert.equal(changes.length,1);
      assert.equal(changes[0].kind,'append');
      state.mirror.push(changes[0].row.slice());
    }
  };
  const inspector={readFormulas:async(tab,range)=>{
    assert.equal(tab,HISTORY);assert.equal(range,'N1:N10001');
    return state.formulas.map(r=>r.slice());
  }};
  const reader=async month=>source(month,[fresh]);
  const reconcile=createReconciler({canonicalReader:reader,google,inspector});
  const run=()=>reconcile({month:'2026-11',project:'PHU HUNG',
    target:'PHU_HUNG_VIEW_TEST'});
  const first=await run();
  assert.equal(first.status,'synced');assert.equal(first.changed,1);
  assert.equal(state.writes,1);assert.equal(state.mirror.length,2);
  assert.deepEqual(state.history,historical);
  const again=await run();
  assert.equal(again.status,'unchanged');
  assert.equal(state.writes,1,'duplicate event must not append twice');
});
test('an existing mirrored row with changed amount cannot be overwritten without trusted prior version',()=>{
  const edited=makeRow(fresh.id,[...fresh.values.slice(0,10),455500,0,0]);
  const mirror=indexMirror([HEADER,pack(fresh)]);
  assert.throws(()=>planMonth({source:source('2026-11',[edited]),
    history:h,mirror}),/previous source proof/);
  assert.deepEqual(mirror.byId.get(fresh.id),pack(fresh));
});
test('a remotely changed numeric cell with stale hash fails before any Sheets write',()=>{
  const bogus=pack(fresh);bogus[13]=7;
  assert.throws(()=>indexMirror([HEADER,bogus]),/Untrusted source hash/);
});
test('an orphan remote row or duplicate history-and-mirror entry blocks any write',()=>{
  assert.throws(()=>planMonth({source:source('2026-11',[]),
    history:h,mirror:indexMirror([HEADER,pack(fresh)])}),/Orphan/);
  assert.throws(()=>planMonth({source:source('2026-10',[old]),
    history:h,mirror:indexMirror([HEADER,pack(old)])}),/Duplicate financial/);
});
test('missing authoritative historical records block rather than silently duplicating',()=>{
  assert.throws(()=>planMonth({source:source('2026-10',[]),
    history:h,mirror:indexMirror([HEADER])}),/Historical PHU HUNG transaction missing/);
});
test('source/project/month violations fail before write',()=>{
  assert.throws(()=>planMonth({source:source('2026-11',[fresh,fresh]),
    history:h,mirror:indexMirror([HEADER])}),/Duplicate/);
  assert.throws(()=>planMonth({source:{...source('2026-11',[fresh]),authoritative:false},
    history:h,mirror:indexMirror([HEADER])}),/evidence missing/);
  assert.throws(()=>createReconciler({canonicalReader:()=>{},
    google:{readHistory:async()=>{}},inspector:{}}),/mandatory|required/);
});
test('historical formula tampering during pending reconciliation fails closed',async()=>{
  const state={mirror:[HEADER],history:historical.map(r=>r.slice()),
    formulas:historicalFormulas.map(r=>r.slice()),writes:0};
  let reads=0;
  const google={
    readMirror:async()=>state.mirror.map(r=>r.slice()),
    readHistory:async()=>state.history.map(r=>r.slice()),
    writeMirror:async(_,changes)=>{state.writes++;state.mirror.push(changes[0].row.slice())}
  };
  const inspector={readFormulas:async()=>{
    reads++;
    if(reads>=2)state.formulas[0][0]='=G1-SUM(H1:M1)';
    return state.formulas.map(r=>r.slice());
  }};
  const reconcile=createReconciler({
    canonicalReader:async()=>source('2026-11',[fresh]),google,inspector
  });
  await assert.rejects(reconcile({
    project:'PHU HUNG',month:'2026-11',target:'PHU_HUNG_VIEW_TEST'
  }),/Protected historical ledger|Historical PHU HUNG tab changed/);
});
