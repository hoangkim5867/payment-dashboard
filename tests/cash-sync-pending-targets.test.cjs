'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {releaseInfo}=require('../api/cash-sync-release-status.js')._internals;
const base={VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
 CASH_SYNC_ADMIN_UID:'test_admin_123',CASH_SYNC_MULTI_PRODUCTION_WRITES:'YES',
 CASH_SYNC_MULTI_ALLOWED_TARGETS:JSON.stringify({S6_OLD:{
  spreadsheetId:'1abcdefghijklmnopqrstuvwxyz0123456789',historySheetId:12}}),
 CASH_SYNC_MULTI_PENDING_TARGETS:JSON.stringify({
  '289':{spreadsheetId:'1XuoyNZwkNOfu2Pg2hbJrSpTsk_oO6nuFub8oGRzAKqA',historySheetId:1136232883},
  'S19-3':{spreadsheetId:'1u7sosXL596akGpaJAYAgO0Cp6h4fS70hsOTtapwdQzc',historySheetId:0}
 })};
const trust=async(token,config)=>{
 assert.equal(token,'signed-admin-token');
 assert.deepEqual(config,{project:'cscecmep-payment',uid:'test_admin_123'});
};
test('only pending Google destinations return, never enable writes',async()=>{
 const result=await releaseInfo({env:base,token:'signed-admin-token',verifyProduction:trust,body:{action:'pending_links'}});
 assert.equal(result.configured,2);
 assert.deepEqual(result.projects.map(x=>x.project),['289','S19-3']);
 assert.ok(result.projects[0].link.endsWith('#gid=1136232883'));
 assert.ok(result.projects[1].link.endsWith('#gid=0'));
 assert.equal(result.canWrite,false);
 assert.equal(result.openingBalancesVerified,false);
 assert.equal(result.googleReads,0);
 assert.equal(result.googleWrites,0);
 assert.equal(result.firestoreReads,0);
 assert.ok(result.projects.every(x=>x.project!=='S6_OLD'));
});
test('fail closed in preview or wrong Firebase',async()=>{
 await assert.rejects(releaseInfo({env:{...base,VERCEL_ENV:'preview'},
  token:'signed-admin-token',verifyProduction:trust,body:{action:'pending_links'}}),/PRODUCTION_ADMIN_REQUIRED/);
 await assert.rejects(releaseInfo({env:{...base,CASH_SYNC_FIREBASE_PROJECT_ID:'staging'},
  token:'signed-admin-token',verifyProduction:trust,body:{action:'pending_links'}}),/PRODUCTION_ADMIN_REQUIRED/);
});
test('invalid, missing and duplicate pending mapping cannot leak through',async()=>{
 await assert.rejects(releaseInfo({env:{...base,CASH_SYNC_MULTI_PENDING_TARGETS:'{'},token:'signed-admin-token',verifyProduction:trust,body:{action:'pending_links'}}),
  /PENDING_TARGET_MAPPING_INVALID/);
 await assert.rejects(releaseInfo({env:{...base,CASH_SYNC_MULTI_PENDING_TARGETS:''},token:'signed-admin-token',verifyProduction:trust,body:{action:'pending_links'}}),
  /PENDING_TARGET_MAPPING_MISSING/);
 await assert.rejects(releaseInfo({env:{...base,CASH_SYNC_MULTI_PENDING_TARGETS:JSON.stringify({
  A:{spreadsheetId:'1abcdefghijklmnopqrstuvwxyz0123456789',historySheetId:1},
  B:{spreadsheetId:'1abcdefghijklmnopqrstuvwxyz0123456789',historySheetId:2}
 })},token:'signed-admin-token',verifyProduction:trust,body:{action:'pending_links'}}),/PENDING_TARGET_MAPPING_INVALID/);
});
test('Admin Firebase signature check is required',async()=>{
 await assert.rejects(releaseInfo({env:base,token:'bad',verifyProduction:async()=>{throw Error('DENIED');},body:{action:'pending_links'}}),/DENIED/);
});
