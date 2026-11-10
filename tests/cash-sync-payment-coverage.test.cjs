'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {check,checkBoundedBatch}=require('../site/assets/js/cash-sync-payment-coverage.js');
const paid=(id,date='2026-10-15')=>({id,project:'ELYSIAN',processPaymentDate:date});
const ledger=(id,date='2026-10-15')=>({date,_syncIds:['expense:pay_'+id]});
test('paid Payment ID covered by Cash Control does not approve sync',()=>{
  const r=check('ELYSIAN',[paid('abc')],[ledger('abc')]);
  assert.equal(r.paidDocuments,1);assert.equal(r.matched,1);
  assert.equal(r.paidPaymentIdsCovered,true);
  assert.equal(r.allCashControlSourcesCovered,false);
  assert.equal(r.sourceCompletenessVerified,false);assert.equal(r.canWrite,false);
});
test('paid Payment missing from Cash Control is reported not skipped',()=>{
  const r=check('ELYSIAN',[paid('abc'),paid('def')],[ledger('abc')]);
  assert.equal(r.blockers.missingPayments,1);assert.equal(r.paidPaymentIdsCovered,false);
});
test('duplicate IDs and orphan paid Payment IDs block coverage',()=>{
  const r=check('ELYSIAN',[paid('abc'),paid('abc')],[ledger('abc'),ledger('abc'),ledger('orphan')]);
  assert.equal(r.blockers.duplicateDocuments,1);
  assert.equal(r.blockers.duplicateLedgerIds,1);
  assert.equal(r.blockers.unknownPaymentIds,1);
  assert.equal(r.canWrite,false);
});
test('wrong date and cross-project source stop attestation',()=>{
  const r=check('ELYSIAN',[paid('abc')],[ledger('abc','2026-10-16')]);
  assert.equal(r.blockers.dateMismatch,1);
  assert.throws(()=>check('ELYSIAN',[{...paid('abc'),project:'EATON'}],[]),/project mismatch/);
});
test('invalid date, removed Payment and unpaid Payment are differentiated',()=>{
  const r=check('ELYSIAN',[paid('a','2026-02-30'),{...paid('b'),deleted:true},
    {id:'c',project:'ELYSIAN'}],[]);
  assert.equal(r.blockers.invalidDates,1);
  assert.equal(r.deleted,1);assert.equal(r.unpaid,1);
  assert.equal(r.paidPaymentIdsCovered,false);
});

test('bounded batch refuses missing or incomplete Payment snapshot with zero network reads',()=>{
 const result=checkBoundedBatch([{project:'ELYSIAN',loaded:false,complete:false}]);
 assert.equal(result.results[0].status,'incomplete-payment-snapshot');
 assert.equal(result.results[0].paymentSnapshotVerified,false);
 assert.equal(result.canWrite,false);
 assert.equal(result.sourceCompletenessVerified,false);
});
test('bounded batch checks loaded Payment IDs without approving sync',()=>{
 const result=checkBoundedBatch([{project:'ELYSIAN',loaded:true,complete:true,
  payments:[paid('abc')],ledger:[ledger('abc')]}]);
 assert.equal(result.results[0].paymentSnapshotVerified,true);
 assert.equal(result.results[0].matched,1);
 assert.equal(result.sourceCompletenessVerified,false);
 assert.equal(result.canWrite,false);
});
test('bounded batch catches missed paid Payment and refuses silent completeness inference',()=>{
 const result=checkBoundedBatch([{project:'ELYSIAN',loaded:true,complete:true,
  payments:[paid('abc'),paid('def')],ledger:[ledger('abc')]}]);
 assert.equal(result.results[0].status,'payment-coverage-blocked');
 assert.equal(result.results[0].blockers.missingPayments,1);
 assert.equal(result.allPaymentSnapshotsVerified,false);
});
test('bounded batch blocks duplicate project and over-three or oversized requests',()=>{
 const item={project:'ELYSIAN',loaded:false,complete:false};
 assert.throws(()=>checkBoundedBatch([item,item]),/Repeated project/);
 assert.throws(()=>checkBoundedBatch([item,item,item,item]),/unbounded/);
 assert.throws(()=>checkBoundedBatch([item],{maxProjects:4}),/unbounded/);
 assert.throws(()=>checkBoundedBatch([{project:'ELYSIAN',loaded:true,complete:true}]),
  /explicit source arrays/);
});

test('empty Payment does not prove coverage even if caller says loaded and complete',()=>{
 const x=checkBoundedBatch([{project:'ELYSIAN',loaded:true,complete:true,
  payments:[],ledger:[]}]);
 assert.equal(x.results[0].status,'empty-payment-snapshot-unverified');
 assert.equal(x.results[0].paymentSnapshotVerified,false);
 assert.equal(x.allPaymentSnapshotsVerified,false);
 assert.equal(x.canWrite,false);
});
test('unpaid or deleted Payment from another project cannot hide in a batch',()=>{
 assert.throws(()=>check('ELYSIAN',[
  {id:'unpaid-other',project:'EATON'}],[]),/project mismatch/);
 assert.throws(()=>check('ELYSIAN',[
  {id:'deleted-other',project:'EATON',deleted:true}],[]),/project mismatch/);
});

test('batch project names normalize spaces identically to Payment documents',()=>{
 const result=checkBoundedBatch([{project:'  ELYSIAN   ',loaded:true,complete:true,
  payments:[paid('abc')],ledger:[ledger('abc')]}]);
 assert.equal(result.results[0].project,'ELYSIAN');
 assert.equal(result.results[0].matched,1);
 assert.equal(result.canWrite,false);
 assert.throws(()=>checkBoundedBatch([
  {project:'EATON P1',loaded:false,complete:false},
  {project:'EATON  P1',loaded:false,complete:false}
 ]),/Repeated project/);
});
