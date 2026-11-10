'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
test('ELYSIAN Google test controls remain Admin-only and staging-only',()=>{
  const auth=s.slice(s.indexOf('function updateCashAuthUI(){'),s.indexOf('function nextMonthValue('));
  assert.match(auth,/ccSyncMultiProjectTestRun/);
  assert.match(auth,/ccSyncMultiProjectTestDecember/);
  assert.match(auth,/firebaseConfig\.projectId==='cash-control-staging'/);
  assert.match(auth,/isCashControlOwner\(\)/);
  const section=s.slice(s.indexOf('function ccGoogleSyncInitializeGooglePilot(){'),s.indexOf('function exportLegacyCashFlowMerged('));
  assert.match(section,/CC_SYNC_DEMO_ALLOWED&&currentAuthUser&&isCashControlOwner\(\)/);
  assert.match(section,/testDataOnly:true/);
  assert.match(section,/confirm\('CHỈ GHI DỮ LIỆU GIẢ/);
  assert.match(section,/\/api\/cash-sync-multiproject-test/);
});
