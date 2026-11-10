'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessProjectSyncReadiness:check}=require('../site/assets/js/cash-sync-historical-audit.js');
const cleanHistory={status:'internally-consistent',transactionRows:3,continuityErrors:0,
  roundingDifferences:0,missingBalance:0,invalidMoney:0,nonMonotonicDates:0};
const complete={sourceComplete:true,invalidHistory:0,invalidSource:0,
  ambiguous:0,historicalOnly:0,cashOnly:0};
test('even clean reconciliations never authorize a write',()=>{
  const r=check('ELYSIAN',cleanHistory,complete);
  assert.equal(r.status,'review-required');
  assert.equal(r.canWrite,false);
  assert.equal(r.blockers.length,0);
});
test('staging or incomplete Payment source is blocked',()=>{
  const r=check('ELYSIAN',cleanHistory,{...complete,sourceComplete:false});
  assert.equal(r.status,'blocked');
  assert(r.blockers.some(x=>x.code==='SOURCE_INCOMPLETE'));
  assert.equal(r.canWrite,false);
});
test('out of order historical dates block auto sync even if balances match',()=>{
  const r=check('DELASOL',{...cleanHistory,status:'review-date-order',nonMonotonicDates:18},complete);
  assert(r.blockers.some(x=>x.code==='DATE_ORDER'));
  assert.equal(r.canWrite,false);
});
test('missing balance or invalid amounts block',()=>{
  const r=check('SSIS',{...cleanHistory,missingBalance:1},complete);
  assert(r.blockers.some(x=>x.code==='BALANCE_REVIEW'));
});
test('same-day same-amount duplicates remain ambiguous',()=>{
  const r=check('H14-3',cleanHistory,{...complete,ambiguous:2});
  assert(r.blockers.some(x=>x.code==='AMBIGUOUS_MATCH'));
});
test('one-sided sources do not silently create or overwrite rows',()=>{
  const r=check('OCEAN LINK',cleanHistory,{...complete,cashOnly:1});
  assert(r.blockers.some(x=>x.code==='UNRESOLVED_MATCH'));
});
test('blank and unknown source history always block',()=>{
  assert(check('S19-3',{...cleanHistory,transactionRows:0},complete).blockers.some(x=>x.code==='EMPTY_HISTORY'));
  assert(check('NEW',null,complete).blockers.some(x=>x.code==='NO_HISTORY'));
});
test('FOXCONN provisional balance is never treated as approved',()=>{
  const r=check('FOXCONN',{...cleanHistory,status:'provisional-balance-review'},complete);
  assert(r.blockers.some(x=>x.code==='HISTORY_REVIEW'));
});
