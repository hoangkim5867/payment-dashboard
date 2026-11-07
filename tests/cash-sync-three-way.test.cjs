'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashValues,authorizeMutation,authorizeBatch,verifyReadback}=
  require('../functions/cash-sync/three-way.cjs');
const data=(amount=321000,date='2026-11-06')=>[
  date,'Vendor TEST','C-001','Nội dung TEST','IPC001','支出',0,0,0,0,amount,0,0
];
const sourceRow=(amount=321000,date='2026-11-06')=>{
  const values=data(amount,date);
  return {id:'PHU HUNG:expense:001',project:'PHU HUNG',month:date.slice(0,7),
    values,hash:hashValues(values)};
};
const remote=row=>[row.id,row.project,row.month,...row.values,'',row.hash,'synced'];
test('new event appends once, duplicate after successful write is a no-op',()=>{
  const after=sourceRow();
  assert.equal(authorizeMutation({after}).kind,'append');
  assert.equal(authorizeMutation({after,remote:remote(after)}).kind,'noop');
});
test('editing 321000 to 432100 authorizes exactly one update, not a new row',()=>{
  const before=sourceRow(321000),after=sourceRow(432100);
  const plan=authorizeMutation({before,after,remote:remote(before)});
  assert.equal(plan.kind,'update');
  assert.equal(plan.id,before.id);
  assert.equal(plan.expect.hash,before.hash);
  assert.equal(plan.row.values[10],432100);
  assert.equal(authorizeMutation({before,after,remote:remote(after)}).kind,'noop');
});
test('out-of-order old update and human-edited row cannot overwrite Google',()=>{
  const old=sourceRow(321000),middle=sourceRow(432100),newest=sourceRow(540000);
  assert.equal(authorizeMutation({before:old,after:middle,remote:remote(newest)}).kind,'review');
  const edited=remote(old);edited[10]=999999;
  assert.throws(()=>authorizeMutation({before:old,after:middle,remote:edited}),/hash/);
  assert.equal(authorizeMutation({after:middle,remote:remote(old)}).kind,'review');
});
test('deleting or missing old row never silently deletes or inserts a ledger entry',()=>{
  const old=sourceRow();
  assert.equal(authorizeMutation({before:old,remote:remote(old)}).kind,'review');
  assert.equal(authorizeMutation({before:old,after:sourceRow(432100)}).kind,'review');
});
test('changed payment date across months requires same ID and old month matching',()=>{
  const old=sourceRow(321000,'2026-10-31'),after=sourceRow(321000,'2026-11-06');
  const plan=authorizeMutation({before:old,after,remote:remote(old)});
  assert.equal(plan.kind,'update');
  assert.equal(plan.expect.month,'2026-10');
  assert.equal(plan.row.month,'2026-11');
});
test('invalid columns, identity change, source hash and target status fail closed',()=>{
  const row=sourceRow();
  assert.throws(()=>authorizeMutation({after:{...row,values:['invalid']}}),/13 columns/);
  assert.throws(()=>authorizeMutation({after:{...row,hash:'0'.repeat(64)}}),/hash/);
  assert.throws(()=>authorizeMutation({after:{...row,project:'EATON'}}),/PHU HUNG/);
  assert.throws(()=>authorizeMutation({after:{...row,id:'other'},before:row}),/identity changed/);
  assert.throws(()=>authorizeMutation({after:row,remote:remote(row).slice(0,18)}),/malformed/);
  const bad=remote(row);bad[18]='review';assert.throws(()=>authorizeMutation({after:row,remote:bad}),/unverified status/);
});
test('batch prevents repeated stable IDs and does not approve any blocked row',()=>{
  const old=sourceRow(),next=sourceRow(432100);
  const valid=authorizeBatch({events:[{before:old,after:next}],
    remoteById:new Map([[old.id,remote(old)]])});
  assert.equal(valid.writes.length,1);
  assert.equal(valid.blocked.length,0);
  assert.throws(()=>authorizeBatch({events:[{after:next},{after:next}],
    remoteById:new Map()}),/Duplicate source ID/);
  const blocked=authorizeBatch({events:[{before:old,after:next}],
    remoteById:new Map()});
  assert.equal(blocked.blocked.length,1);
  assert.equal(blocked.writes.length,0);
});
test('post-write Google readback must match the exact new canonical amount and month',()=>{
  const old=sourceRow(),next=sourceRow(432100);
  const plan=authorizeMutation({before:old,after:next,remote:remote(old)});
  assert.equal(verifyReadback([plan],new Map([[next.id,remote(next)]]))
    .googleReadBackVerified,true);
  assert.throws(()=>verifyReadback([plan],new Map([[old.id,remote(old)]])),/did not confirm/);
  assert.throws(()=>verifyReadback([{kind:'review',id:old.id}],new Map()),/Blocked/);
});
