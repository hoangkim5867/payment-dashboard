'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('../server/cash-shared-test-readiness.cjs');
const handler=require('../api/cash-shared-test-readiness.js');
const config={VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
 CASH_SYNC_ADMIN_UID:'admin_staging_test',
 CASH_SYNC_MULTI_TEST_LOCK_RULES_VERIFIED:'YES',
 CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([{
  project:'ELYSIAN',spreadsheetId:'E'.repeat(35),title:'ELYSIAN GOOGLE TEST',
  tab:'DATA_CASHCONTROL_TEST_ELYSIAN'
 }])};
function response(){
 return {code:200,body:null,headers:{},
   setHeader(k,v){this.headers[k]=v;return this},
   status(c){this.code=c;return this},json(body){this.body=body;return this}};
}
test('configuration diagnostics are fail-closed even when all optional flags set',()=>{
 const s=inspect(config);
 assert.equal(s.checks.previewOnly,true);
 assert.equal(s.checks.adminConfigured,true);
 assert.equal(s.checks.googleTestTargets,true);
 assert.equal(s.checks.trustedSourceLoader,false);
 assert.equal(s.canWrite,false);
 assert.ok(s.missing.includes('trustedSourceLoader'));
 assert.equal(s.googleReads,0);assert.equal(s.firestoreReads,0);assert.equal(s.writes,0);
});
test('missing branch-specific Vercel Admin configuration is reported without making network calls',()=>{
 const s=inspect({VERCEL_ENV:'preview',
  CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging'});
 assert.equal(s.checks.adminConfigured,false);
 assert.equal(s.checks.googleTestTargets,false);
 assert.equal(s.checkedProjects,0);
});
test('production never exposes target metadata or allows readiness',()=>{
 const s=inspect({...config,VERCEL_ENV:'production'});
 assert.equal(s.canWrite,false);
 assert.equal(s.checkedProjects,0);
 assert.equal(s.checks.previewOnly,false);
});
test('readiness HTTP GET displays boolean-only diagnostics, no credentials',async()=>{
 const original={...process.env};
 try{
  Object.assign(process.env,config);
  const r=response();
  await handler({method:'GET'},r);
  assert.equal(r.code,200);
  assert.equal(r.body.canWrite,false);
  const output=JSON.stringify(r.body);
  assert.doesNotMatch(output,/admin_staging_test/);
  assert.doesNotMatch(output,/EEEEEEEEEEEE/);
  assert.doesNotMatch(output,/cash-control-staging/);
  assert.equal(r.headers['Cache-Control'],'no-store, max-age=0');
  const other=response();
  await handler({method:'POST'},other);
  assert.equal(other.code,405);
  process.env.VERCEL_ENV='production';
  const denied=response();
  await handler({method:'GET'},denied);
  assert.equal(denied.code,404);
 }finally{
  for(const key of Object.keys(config)){
   if(original[key]===undefined)delete process.env[key];
   else process.env[key]=original[key];
  }
 }
});
