'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectRelease}=require('../server/cash-sync-release-audit.cjs');
const {releaseInfo}=require('../api/cash-sync-release-status.js')._internals;
const ID='1234567890abcdef1234567890abcXYZ',OTHER='9999999990abcdef1234567890abcXYZ';
const A={project:'ELYSIAN',spreadsheetId:ID,historySheetId:42};
const B={project:'S13-2',spreadsheetId:OTHER,historySheetId:43};
const ENV={VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
 CASH_SYNC_ADMIN_UID:'trustedUID',CASH_SYNC_MULTI_PRODUCTION_WRITES:'YES',
 CASH_SYNC_MULTI_ALLOWED_TARGETS:JSON.stringify({
  ELYSIAN:{spreadsheetId:ID,historySheetId:42},
  'S13-2':{spreadsheetId:OTHER,historySheetId:43}
 })};
test('35-project release audit is metadata-only and blocks all without server production release flag',()=>{
 const projects=[A,B,...Array.from({length:33},(_,i)=>({
  project:'P'+i,spreadsheetId:'',historySheetId:0
 }))];
 const r=inspectRelease({env:{...ENV,CASH_SYNC_MULTI_PRODUCTION_WRITES:'NO'},projects});
 assert.equal(r.requestedProjects,35);
 assert.equal(r.serverEnabledProjects,0);
 assert.equal(r.blockedProjects,35);
 assert.equal(r.googleReads,0);
 assert.equal(r.firestoreReads,0);
 assert.equal(r.googleWrites,0);
 assert.equal(r.approvedForActualWrites,false);
 assert.equal(r.rows[0].reason,'PRODUCTION_RELEASE_FLAG_DISABLED');
});
test('preview cannot enable production writes even with production flag and matching target',()=>{
 const r=inspectRelease({env:{...ENV,VERCEL_ENV:'preview'},projects:[A]});
 assert.equal(r.rows[0].reason,'PREVIEW_NEVER_WRITES_PRODUCTION');
 assert.equal(r.serverEnabledProjects,0);
});
test('server allowlist and file gid must exactly match, no client-supplied link is an approval',()=>{
 const wrong={...B,historySheetId:44};
 const r=inspectRelease({env:ENV,projects:[A,wrong,{project:'FOXCONN',
  spreadsheetId:'',historySheetId:0}]});
 assert.equal(r.rows[0].reason,'SERVER_TARGET_ENABLED');
 assert.equal(r.rows[1].reason,'GOOGLE_DESTINATION_NOT_APPROVED');
 assert.equal(r.rows[2].reason,'GOOGLE_LINK_MISSING');
 assert.equal(r.serverEnabledProjects,1);
 assert.equal(r.approvedForActualWrites,false);
});
test('no allowlist and invalid allowlist never silently release a project',()=>{
 for(const raw of ['', '{broken']){
  const r=inspectRelease({env:{...ENV,CASH_SYNC_MULTI_ALLOWED_TARGETS:raw},projects:[A]});
  assert.equal(r.serverEnabledProjects,0);
  assert.equal(r.googleWrites,0);
 }
});
test('duplicate project, duplicate target and oversized catalog rejected',()=>{
 assert.throws(()=>inspectRelease({env:ENV,projects:[A,A]}),/INVALID_RELEASE_PROJECT/);
 assert.throws(()=>inspectRelease({env:ENV,projects:[A,{...B,spreadsheetId:ID}]}),/INVALID_RELEASE_DESTINATION/);
 assert.throws(()=>inspectRelease({env:ENV,projects:Array(36).fill(A)}),/INVALID_RELEASE_CATALOG/);
});
test('release endpoint verifies signed Admin before accepting metadata; unauthorized gets zero results',async()=>{
 const calls=[];
 const r=await releaseInfo({env:ENV,token:'signed-test-admin',
  body:{projects:[A]},
  verifyProduction:async(token,config)=>{
   calls.push([token,config.project,config.uid]);return {uid:config.uid};
  }});
 assert.equal(r.serverEnabledProjects,1);
 assert.deepEqual(calls,[['signed-test-admin','cscecmep-payment','trustedUID']]);
 await assert.rejects(releaseInfo({env:ENV,token:'invalid',body:{projects:[A]},
  verifyProduction:async()=>{throw Error('DENIED')}}),/DENIED/);
});
test('preview endpoint requires staging Admin and never enables writes',async()=>{
 let checked=0;
 const r=await releaseInfo({env:{...ENV,VERCEL_ENV:'preview'},token:'staging',
  body:{projects:[A]},verifyPreview:async()=>{checked++}});
 assert.equal(checked,1);
 assert.equal(r.serverEnabledProjects,0);
 assert.equal(r.rows[0].reason,'PREVIEW_NEVER_WRITES_PRODUCTION');
});
