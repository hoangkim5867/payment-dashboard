'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TEST_ID}=require('../functions/cash-sync/sheets-inspector.cjs');
const {assessRelease,assertCanEnableWorker}=
  require('../functions/cash-sync/release-gate.cjs');
const staging={GCLOUD_PROJECT:'cash-control-staging',
  CASH_SHEETS_WORKER_ENABLED:'YES',CASH_SHEETS_AUTHORIZED_TEST_ID:TEST_ID,
  CASH_SHEETS_LIVE_READBACK_VERIFIED:'YES'};
test('staging flag alone cannot consume any queued financial sync as completed',()=>{
  const result=assessRelease({env:staging});
  assert.equal(result.ready,false);
  assert.equal(result.autoWriteEnabled,false);
  assert.ok(result.errors.includes('AUTHORITATIVE_SOURCE_MISSING'));
  assert.ok(result.errors.includes('SERVER_GOOGLE_TEST_WRITER_MISSING'));
  assert.throws(()=>assertCanEnableWorker({env:staging}),/activation blocked/);
});
test('worker remains safely OFF even if Firebase staging project exists',()=>{
  assert.deepEqual(assertCanEnableWorker({env:{
    GCLOUD_PROJECT:'cash-control-staging',CASH_SHEETS_WORKER_ENABLED:'NO'}}),
    {status:'off'});
  assert.deepEqual(assertCanEnableWorker({env:{}}),{status:'off'});
});
test('worker cannot be approved on real production Firebase project',()=>{
  const sourceReconciler=async()=>({status:'verified'});
  const googleWriteAdapter={readMirror:async()=>[],readHistory:async()=>[],
    writeMirror:async()=>{}};
  const env={...staging,GCLOUD_PROJECT:'cscecmep-payment'};
  const result=assessRelease({env,sourceReconciler,googleWriteAdapter});
  assert.equal(result.ready,false);
  assert.ok(result.errors.includes('NOT_ISOLATED_FIREBASE_STAGING'));
});
test('future complete reconciler still requires specific TEST spreadsheet and live readback',()=>{
  const sourceReconciler=async()=>({status:'verified'});
  const googleWriteAdapter={readMirror:async()=>[],readHistory:async()=>[],
    writeMirror:async()=>{}};
  const bad={...staging,CASH_SHEETS_AUTHORIZED_TEST_ID:'WRONG',
    CASH_SHEETS_LIVE_READBACK_VERIFIED:'NO'};
  const r=assessRelease({env:bad,sourceReconciler,googleWriteAdapter});
  assert.equal(r.ready,false);
  assert.ok(r.errors.includes('TEST_SPREADSHEET_NOT_CONFIRMED'));
  assert.ok(r.errors.includes('LIVE_GOOGLE_READBACK_NOT_CONFIRMED'));
  const okay=assessRelease({env:staging,sourceReconciler,googleWriteAdapter});
  assert.equal(okay.ready,true);
  assert.equal(okay.autoWriteEnabled,true);
});
test('read-only inspector is never a writer, even with correct Google configuration',()=>{
  const serverReadOnly={metadata:async()=>{},read:async()=>{}};
  assert.throws(()=>assertCanEnableWorker({env:staging,
    sourceReconciler:async()=>{},googleWriteAdapter:serverReadOnly}),/WRITER_MISSING/);
});
