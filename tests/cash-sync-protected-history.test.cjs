'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {LEGACY_SEED_ID,EXPECTED_SHA256,LEGACY_KEYS,
  verifyProtectedHistory}=require('../functions/cash-sync/protected-history.cjs');
const main=fs.readFileSync(path.resolve(__dirname,'../site/cash-control.html'),'utf8');
test('protected seed doc ID, checksum, schema and category keys match production browser exactly',()=>{
  const match=main.match(/const CASH_SEED_HASH="([a-f0-9]{64})"/);
  assert.ok(match);
  assert.equal(match[1],EXPECTED_SHA256);
  assert.equal(LEGACY_SEED_ID,'legacy_seed_20261021_v1');
  assert.match(main,/getDoc\(doc\(db,'cash_control_private',"legacy_seed_20261021_v1"\)\)/);
  for(const key of LEGACY_KEYS)assert.ok(main.includes(key));
});
test('invalid seed cannot be marked verified, and raw financial data is never embedded',()=>{
  const payload=JSON.stringify({LEGACY_SALARY:[],LEGACY_FINANCE:[],
    LEGACY_VNB:[],LEGACY_CASH_SPECIAL:[]});
  const fakeHash=createHash('sha256').update(payload).digest('hex');
  assert.notEqual(fakeHash,EXPECTED_SHA256);
  assert.throws(()=>verifyProtectedHistory({schemaVersion:1,payload,sha256:fakeHash}),
    /SHA256 mismatch/);
  assert.throws(()=>verifyProtectedHistory({schemaVersion:1,payload,sha256:EXPECTED_SHA256}),
    /SHA256 mismatch/);
  assert.throws(()=>verifyProtectedHistory({schemaVersion:2,payload,sha256:EXPECTED_SHA256}),
    /malformed/);
  assert.throws(()=>verifyProtectedHistory({schemaVersion:1,payload:'NOT JSON',sha256:fakeHash}),
    /SHA256 mismatch/);
  assert.throws(()=>verifyProtectedHistory(null),/malformed/);
});
test('protected seed verifier does not fetch Firestore, read/write Sheets or use real data',()=>{
  const code=fs.readFileSync(path.resolve(__dirname,'../functions/cash-sync/protected-history.cjs'),'utf8');
  assert.ok(!/getDocs\(|getDoc\(|setDoc\(|writeMirror\(/.test(code));
  assert.equal(code.includes('LEGACY_SALARY:\\n'),false);
});
