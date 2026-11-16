'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readStagingProject,verifyTestAdmin}=require('../server/cash-sync-s13-test-admin.cjs');
const env={VERCEL_ENV:'preview',PAYMENT_FIREBASE_STAGING_CONFIG:JSON.stringify({
 projectId:'cash-control-staging',authDomain:'cash-control-staging.firebaseapp.com'})};
const token=[Buffer.from('{}').toString('base64url'),
 Buffer.from(JSON.stringify({sub:'testAdminUID_123',padding:'x'.repeat(180)})).toString('base64url'),
 'testSignature'].join('.');
const ok=body=>({ok:true,json:async()=>body});
test('S13 TEST auth only recognizes explicitly configured staging Preview',()=>{
 assert.equal(readStagingProject(env),'cash-control-staging');
 for(const bad of [
 {...env,VERCEL_ENV:'production'},
 {...env,PAYMENT_FIREBASE_STAGING_CONFIG:'{}'},
 {...env,PAYMENT_FIREBASE_STAGING_CONFIG:'not-json'},
 {...env,PAYMENT_FIREBASE_STAGING_CONFIG:JSON.stringify({projectId:'cscecmep-payment',authDomain:'cscecmep-payment.firebaseapp.com'})}
 ])assert.throws(()=>readStagingProject(bad));
});
test('S13 TEST auth checks signed staging token and server-read protected admin role',async()=>{
 let verification=0,profileReads=0;
 const result=await verifyTestAdmin(token,env,{
  verifyToken:async(jwt,config)=>{verification++;assert.equal(jwt,token);assert.deepEqual(config,{project:'cash-control-staging',uid:'testAdminUID_123'})},
  fetcher:async(url,opt)=>{profileReads++;assert.match(url,/\/documents\/authUsers\/testAdminUID_123$/);assert.equal(opt.headers.Authorization,'Bearer '+token);return ok({fields:{role:{stringValue:'admin'}}})}
 });
 assert.equal(result.role,'admin');assert.equal(verification,1);assert.equal(profileReads,1);
});
test('S13 TEST auth fails if Firebase role is not Admin, server read is denied or signature check fails',async()=>{
 for(const profile of [
  {ok:true,json:async()=>({fields:{role:{stringValue:'staff'}}})},
  {ok:true,json:async()=>({fields:{}})},
  {ok:false,json:async()=>({})}
 ])await assert.rejects(
  verifyTestAdmin(token,env,{verifyToken:async()=>true,fetcher:async()=>profile}),/Admin/);
 let fetched=false;
 await assert.rejects(
  verifyTestAdmin(token,env,{verifyToken:async()=>{throw Error('BAD SIGNATURE')},fetcher:async()=>{fetched=true;return ok({})}}),
  /BAD SIGNATURE/);
 assert.equal(fetched,false);
 await assert.rejects(verifyTestAdmin('invalid',env,{verifyToken:async()=>true}),/Firebase/);
});
