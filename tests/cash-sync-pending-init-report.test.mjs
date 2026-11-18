import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPendingInitializationReport,PENDING_INIT_MONTHS}
  from '../site/assets/js/cash-sync-pending-init-report.mjs';
const target=(project,id)=>({
  project,serverProject:project.toUpperCase(),spreadsheetId:id,
  historySheetId:0
});
const targets=[
  target('289','1XuoyNZwkNOfu2Pg2hbJrSpTsk_oO6nuFub8oGRzAKqA'),
  target('S19-3','1u7sosXL596akGpaJAYAgO0Cp6h4fS70hsOTtapwdQzc')
];
const empty=()=>({
  '289':Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,[]])),
  'S19-3':Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,[]]))
});
const closings=(a=22805265,b=0)=>({
  '289':Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,a])),
  'S19-3':Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,b]))
});
const valid=()=>({
  targets,openingStart:{'289':22805265,'S19-3':0},
  monthRows:empty(),monthsLoaded:Object.fromEntries(
    PENDING_INIT_MONTHS.map(m=>[m,true])),
  monthPaymentCounts:Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,8])),
  cashClosings:closings(),
  rawPaymentCounts:Object.fromEntries(['289','S19-3'].map(p=>[p,
    Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,0]))])),
  rawMovementCounts:Object.fromEntries(['289','S19-3'].map(p=>[p,
    Object.fromEntries(PENDING_INIT_MONTHS.map(m=>[m,0]))])),
  revision:19
});
const row=(month,income,id)=>({
  date:month+'-12',company:'内部结算',contractNo:'合同01',
  content:'内部结算IPC',ipc:'IPC01',type:'收入',
  income,subcontract:0,material:0,otherDirect:0,indirect:0,
  financial:0,otherPayable:0,sourceIds:[id]
});
test('zero S19-3 opening is valid, no activity is not write authorization',()=>{
  const out=buildPendingInitializationReport(valid());
  assert.equal(out.projectsCount,2);
  assert.equal(out.projects[1].openingAt20260801,0);
  assert.equal(out.projects[1].reviewState,'NO_ROWS_CANDIDATE');
  assert.equal(out.projects[0].openingAt20260801,22805265);
  assert.equal(out.groupedRows,0);
  assert.equal(out.googleWrites,0);
  assert.equal(out.canWrite,false);
  assert.equal(out.sourceCertified,false);
  assert.equal(out.paymentMonthCoverage,true);
});
test('carry forward signed internal income, including negative amounts',()=>{
  const input=valid();
  input.monthRows['289']['2026-08']=[row('2026-08',1000,'t1')];
  input.monthRows['289']['2026-09']=[row('2026-09',-200,'t2')];
  input.cashClosings['289']={
    '2026-08':22806265,'2026-09':22806065,
    '2026-10':22806065,'2026-11':22806065
  };
  const out=buildPendingInitializationReport(input);
  assert.equal(out.projects[0].months[0].closing,22806265);
  assert.equal(out.projects[0].months[1].net,-200);
  assert.equal(out.projects[0].months[1].closing,22806065);
  assert.equal(out.projects[0].months[1].arithmeticMatchesCashControl,true);
  assert.equal(out.mismatches,0);
  assert.equal(out.projects[0].rowCount,2);
});
test('missing source member ID, balance mismatch and incomplete Payment coverage block summary',()=>{
  const input=valid();
  input.monthRows['289']['2026-08']=[row('2026-08',12,'dup')];
  input.monthRows['289']['2026-09']=[row('2026-09',3,'dup')];
  input.monthsLoaded['2026-10']=false;
  const out=buildPendingInitializationReport(input);
  assert.equal(out.missingIdentities,1);
  assert.ok(out.mismatches>0);
  assert.equal(out.paymentMonthCoverage,false);
  assert.equal(out.projects[0].reviewState,'NEEDS_REVIEW');
  assert.deepEqual(out.projects[0].issues,[
    'ACTUAL_PAYMENT_MONTH_COVERAGE_MISSING',
    'GROUPED_SOURCE_ID_REVIEW_REQUIRED',
    'CASH_CONTROL_BALANCE_DIFFERENCE'
  ]);
  assert.equal(out.canWrite,false);
});
test('missing opening balance is not silently interpreted as zero',()=>{
  const input=valid();delete input.openingStart['S19-3'];
  const out=buildPendingInitializationReport(input);
  assert.equal(out.projects[1].openingAt20260801,null);
  assert.equal(out.projects[1].months[0].closing,null);
  assert.equal(out.projects[1].months[0].difference,null);
  assert.equal(out.projects[1].months[0].arithmeticMatchesCashControl,null);
  assert.equal(out.mismatches,0); // Unknown opening is NOT a real balance error.
  assert.equal(out.unverifiableMonths,4);
  assert.ok(out.projects[1].issues.includes('MISSING_OR_INVALID_2026_08_OPENING'));
  assert.ok(!out.projects[1].issues.includes('CASH_CONTROL_BALANCE_DIFFERENCE'));
});
test('disallow duplicate Google file IDs and malformed source rows',()=>{
  const input=valid();input.targets[1].spreadsheetId=input.targets[0].spreadsheetId;
  assert.throws(()=>buildPendingInitializationReport(input),/PENDING_INIT_TARGET_INVALID/);
  const next=valid();
  next.monthRows['289']['2026-08']=[{...row('2026-08',5,'x'),income:Infinity}];
  assert.throws(()=>buildPendingInitializationReport(next),/PENDING_INIT_TRANSACTION_INVALID/);
});

test('raw Payment source activity with no grouped ledger must be flagged',()=>{
  const input=valid();
  input.rawPaymentCounts['289']['2026-10']=2;
  input.rawMovementCounts['289']['2026-10']=2;
  const out=buildPendingInitializationReport(input);
  assert.equal(out.groupedRows,0);
  assert.equal(out.sourceActivityDiscrepancies,1);
  assert.equal(out.projects[0].rawPaidPaymentCount,2);
  assert.equal(out.projects[0].rawCashMovementCount,2);
  assert.ok(out.projects[0].issues.includes('PROJECT_ACTIVITY_MISSING_FROM_GROUPED_EXPORT'));
  assert.equal(out.projects[0].months[2].activityProjectionMismatch,true);
  assert.equal(out.canWrite,false);
});
test('refuse to classify zero when raw source activity counts are unavailable',()=>{
  const input=valid();
  delete input.rawPaymentCounts['289']['2026-09'];
  assert.throws(()=>buildPendingInitializationReport(input),/PENDING_INIT_ACTIVITY_COUNTS_NOT_VERIFIED/);
});
