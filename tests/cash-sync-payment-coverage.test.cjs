'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {check}=require('../site/assets/js/cash-sync-payment-coverage.js');
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
