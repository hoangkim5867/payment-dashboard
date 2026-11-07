'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {affectedForPayment,affectedForCashPrivate,makeJob,enqueueEvent,enabledForStaging}=require('../server/cash-sync-outbox.cjs');
const staging={GCLOUD_PROJECT:'cash-control-staging',CASH_SHEETS_OUTBOX_ENABLED:'YES'};
const payment=(amount,date='2026-11-06',project='PHU HUNG')=>({
  id:'p-001',project,processPaymentDate:date,processActualAmount:amount
});
test('payment edit requires only changed months; no global payment scan',()=>{
  assert.deepEqual(affectedForPayment(payment(321000),payment(432100)).months,['2026-11']);
  const moved=affectedForPayment(payment(321000,'2026-10-30'),payment(321000,'2026-11-06'));
  assert.deepEqual(moved.months,['2026-10','2026-11']);
  assert.equal(moved.requiresReview,false);
  assert.deepEqual(affectedForPayment(payment(321000),payment(321000)),{
    months:[],requiresReview:false,changed:false,reasons:[]
  });
});
test('Payment metadata-only and unpaid-plan edits generate no Google invalidation',()=>{
  const paid=payment(100);
  assert.equal(affectedForPayment({...paid,updatedAt:'t1'},{...paid,updatedAt:'t2'}).changed,false);
  const unpaid={project:'PHU HUNG',processPaymentDate:'',amount:100};
  assert.equal(affectedForPayment(unpaid,{...unpaid,amount:200}).changed,false);
  assert.equal(affectedForPayment(unpaid,{...unpaid,processPaymentDate:'2026-11-06'}).changed,true);
});
test('unrelated Payment never creates a PHU HUNG outbox job',()=>{
  assert.equal(affectedForPayment(payment(1,'2026-11-06','EATON'),payment(2,'2026-11-06','EATON')).changed,false);
});
test('Cash Control manual save/change identifies relevant month; deletion included',()=>{
  const original={manualRecords:[{id:'m1',project:'PHU HUNG',actualDate:'2026-11-06',amount:321000}]};
  const updated={manualRecords:[{id:'m1',project:'PHU HUNG',actualDate:'2026-11-06',amount:432100}]};
  const diff=affectedForCashPrivate(original,updated);
  assert.deepEqual(diff.months,['2026-11']);
  assert.equal(diff.requiresReview,false);
  assert.deepEqual(affectedForCashPrivate(original,{manualRecords:[]}).months,['2026-11']);
  assert.equal(affectedForCashPrivate(original,original).changed,false);
});
test('salary record and cross-project transfers are included, editing unrelated fields does not enqueue',()=>{
  const a={salaryRecords:[{id:'s1',project:'PHU HUNG',actualDate:'2026-11-05',amount:1}]};
  const b={salaryRecords:[{id:'s1',project:'PHU HUNG',actualDate:'2026-11-05',amount:2}]};
  assert.deepEqual(affectedForCashPrivate(a,b).months,['2026-11']);
  const x={manualRecords:[{id:'transfer',fromProject:'PHU HUNG',toProject:'EATON',actualDate:'2026-11-06',amount:3}]};
  assert.equal(affectedForCashPrivate({manualRecords:[]},x).changed,true);
  assert.equal(affectedForCashPrivate({projectMasters:[{name:'a'}]},{projectMasters:[{name:'b'}]}).changed,false);
});
test('unknown old-history overrides are flagged for review rather than guessed into ledger',()=>{
  const diff=affectedForCashPrivate({legacyOverrides:{}},{legacyOverrides:{abc:{actualDate:'2026-11-01'}}});
  assert.equal(diff.changed,true);
  assert.equal(diff.requiresReview,true);
  assert.deepEqual(diff.months,[]);
  const missingDate=affectedForPayment({project:'PHU HUNG',processPaymentDate:'invalid-date',amount:1},{project:'PHU HUNG',processPaymentDate:'invalid-date',amount:2});
  assert.equal(missingDate.requiresReview,true);
});
test('linked IPC receipt number changes update exported content without changing its amount',()=>{
  const receipt={id:'cash-r1',project:'PHU HUNG',linkedModule:'inflow',
    linkedRecordId:'r1',status:'paid',direction:'in',
    actualDate:'2026-11-06',actualAmount:321000};
  const before={manualRecords:[receipt],
    inflowRecords:[{id:'r1',project:'PHU HUNG',number:'IPC001',type:'ipc'}]};
  const after={manualRecords:[{...receipt}],
    inflowRecords:[{id:'r1',project:'PHU HUNG',number:'IPC002',type:'ipc'}]};
  const diff=affectedForCashPrivate(before,after);
  assert.equal(diff.changed,true);
  assert.equal(diff.requiresReview,false);
  assert.deepEqual(diff.months,['2026-11']);
  assert.ok(diff.reasons.includes('inflow-linked-reference-changed'));
});
test('pure inflow planning edit without a posted receipt creates no outbox write',()=>{
  const before={manualRecords:[],
    inflowRecords:[{id:'r1',project:'PHU HUNG',number:'IPC001',expectedDate:'2026-11-06'}]};
  const after={manualRecords:[],
    inflowRecords:[{id:'r1',project:'PHU HUNG',number:'IPC002',expectedDate:'2026-11-07'}]};
  assert.equal(affectedForCashPrivate(before,after).changed,false);
});
test('malformed inflow master is reviewed only when changed and a linked paid receipt exists',()=>{
  const receipt={id:'cash-r1',project:'PHU HUNG',linkedModule:'inflow',
    linkedRecordId:'r1',status:'paid',actualDate:'2026-11-06'};
  const before={manualRecords:[receipt],
    inflowRecords:[{id:'r1',number:'IPC001'}]};
  const after={manualRecords:[receipt],
    inflowRecords:[{number:'IPC002'}]};
  const diff=affectedForCashPrivate(before,after);
  assert.equal(diff.changed,true);
  assert.equal(diff.requiresReview,true);
  assert.ok(diff.reasons.includes('inflow-linked-reference-review'));
  assert.equal(affectedForCashPrivate(before,{...before,
    projectMasters:[{id:'other'}]}).changed,false);
});
test('stage and explicit switch are mandatory; production remains disabled',()=>{
  assert.equal(enabledForStaging(staging),true);
  assert.equal(enabledForStaging({...staging,GCLOUD_PROJECT:'cscecmep-payment'}),false);
  assert.equal(enabledForStaging({...staging,CASH_SHEETS_OUTBOX_ENABLED:'NO'}),false);
});
test('event retries are idempotent, one private Firestore write and zero reads per event',async()=>{
  const jobs=new Map();let writes=0,reads=0;
  const writer={async create(collection,id,payload){
    assert.equal(collection,'cash_sync_outbox');
    writes++;
    if(jobs.has(id))throw Object.assign(Error('exists'),{code:6});
    jobs.set(id,payload);
  },read(){reads++}};
  const args={eventId:'event-2026-11-06-001',source:'payment',before:payment(321000),
    after:payment(432100),env:staging,writer};
  const a=await enqueueEvent(args),b=await enqueueEvent(args);
  assert.equal(a.status,'enqueued');
  assert.equal(b.status,'duplicate');
  assert.equal(jobs.size,1);
  assert.equal(reads,0);
  assert.equal(jobs.values().next().value.status,'awaiting-reconciler');
  assert.equal(writes,2,'duplicate create attempts are rejected atomically by Firestore');
  assert.equal((await enqueueEvent({...args,env:{...staging,GCLOUD_PROJECT:'cscecmep-payment'}})).status,'disabled');
  assert.equal(jobs.size,1);
});
test('transient Firestore failures propagate for event trigger retry',async()=>{
  await assert.rejects(enqueueEvent({eventId:'x',source:'payment',before:payment(1),
    after:payment(2),env:staging,writer:{create:async()=>{throw Error('service unavailable')}}}),
    /service unavailable/);
});
