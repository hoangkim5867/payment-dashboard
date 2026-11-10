'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {check,checkBoundedBatch,checkMoney}=require('../site/assets/js/cash-sync-payment-coverage.js');
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

test('many Payment IDs are indexed once and date mismatch is still detected',()=>{
 const payments=Array.from({length:800},(_,i)=>paid('p'+i));
 const rows=Array.from({length:800},(_,i)=>ledger('p'+i));
 rows[799].date='2026-10-16';
 const x=check('ELYSIAN',payments,rows);
 assert.equal(x.paidDocuments,800);
 assert.equal(x.matched,800);
 assert.equal(x.blockers.dateMismatch,1);
 assert.equal(x.paidPaymentIdsCovered,false);
 assert.equal(x.canWrite,false);
});
test('multiple source IDs in one grouped row stay distinct',()=>{
 const x=check('ELYSIAN',[paid('a'),paid('b')],
  [{date:'2026-10-15',_syncIds:['expense:pay_a','expense:pay_b']}]);
 assert.equal(x.matched,2);
 assert.equal(x.blockers.duplicateLedgerIds,0);
 assert.equal(x.paidPaymentIdsCovered,true);
 assert.equal(x.sourceCompletenessVerified,false);
});
test('up to three independent project batches never approve writes',()=>{
 const rows=['ELYSIAN','EATON','FOXCONN'].map(project=>({
  project,loaded:true,complete:true,
  payments:[{id:'one',project,processPaymentDate:'2026-10-15'}],
  ledger:[{date:'2026-10-15',_syncIds:['expense:pay_one']}]
 }));
 const x=checkBoundedBatch(rows);
 assert.equal(x.reviewedProjects,3);
 assert.equal(x.allPaymentSnapshotsVerified,true);
 assert.equal(x.sourceCompletenessVerified,false);
 assert.equal(x.canWrite,false);
});

test('raw actual amount and expense bucket match a grouped Cash Control ledger',()=>{
 const payments=[
  {...paid('a'),amount:900,processActualAmount:100},
  {...paid('b'),amount:900,processActualAmount:250}
 ];
 const rows=[{date:'2026-10-15',_syncIds:['expense:pay_a','expense:pay_b'],
  income:0,subcontract:350,material:0,otherDirect:0,indirect:0,
  financial:0,otherPayable:0}];
 const bucketOf=()=> 'subcontract';
 const ok=checkMoney('ELYSIAN',payments,rows,{bucketOf});
 assert.equal(ok.checkedRows,1);
 assert.equal(ok.amountMismatches,0);
 assert.equal(ok.moneyAndBucketVerified,true);
 assert.equal(ok.sourceCompletenessVerified,false);
 assert.equal(ok.canWrite,false);
 rows[0].subcontract=340;
 const wrong=checkMoney('ELYSIAN',payments,rows,{bucketOf});
 assert.equal(wrong.amountMismatches,1);
 assert.equal(wrong.moneyAndBucketVerified,false);
});
test('same total in wrong expense column never counts as consistent',()=>{
 const p={...paid('a'),processActualAmount:100};
 const rows=[{date:'2026-10-15',_syncIds:['expense:pay_a'],
  income:0,subcontract:0,material:100,otherDirect:0,indirect:0,
  financial:0,otherPayable:0}];
 const r=checkMoney('ELYSIAN',[p],rows,{bucketOf:()=> 'subcontract'});
 assert.equal(r.amountMismatches,1);
 assert.equal(r.canWrite,false);
});
test('mixed source rows, missing amounts and no bucket resolver stay unverified',()=>{
 const p={...paid('a'),amount:100};
 const row={date:'2026-10-15',_syncIds:['expense:pay_a','expense:manual_x'],
  income:0,subcontract:100,material:0,otherDirect:0,indirect:0,
  financial:0,otherPayable:0};
 assert.equal(checkMoney('ELYSIAN',[p],[row],{bucketOf:()=> 'subcontract'}).unverifiedRows,1);
 assert.equal(checkMoney('ELYSIAN',[p],[row]).moneyAndBucketVerified,false);
 assert.equal(checkMoney('ELYSIAN',[{...p,amount:'not-number'}],[row],
  {bucketOf:()=> 'subcontract'}).moneyAndBucketVerified,false);
});
test('large legitimate VND amounts are checked without unsafe scaled-integer rejection',()=>{
 const p={...paid('a'),processActualAmount:15000000000};
 const row={date:'2026-10-15',_syncIds:['expense:pay_a'],income:0,
  subcontract:15000000000,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0};
 const r=checkMoney('ELYSIAN',[p],[row],{bucketOf:()=> 'subcontract'});
 assert.equal(r.moneyAndBucketVerified,true);
});
