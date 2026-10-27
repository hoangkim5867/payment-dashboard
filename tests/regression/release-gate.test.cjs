'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const code=fs.readFileSync(path.resolve(__dirname,'../deployment-gate.cjs'),'utf8'),manifest=Buffer.from('SYNTHETIC MANIFEST FOR GATE TEST ONLY');
const digest=crypto.createHash('sha256').update(manifest).digest('hex');
const ready={status:'READY_FOR_REVIEW',checks:{rules:'PASS'},releaseReadMode:'COMPLETE_HISTORY',indexMarkerActivated:false};
function run(status,env={}){let verified=0;try{vm.runInNewContext(code,{__dirname:path.resolve(__dirname,'..'),console:{error(){},log(){}},process:{env,exit:()=>{throw Error('BLOCKED')}},require:name=>name==='node:fs'?{readFileSync:file=>String(file).includes('RELEASE_STATUS')?JSON.stringify(status):manifest}:name==='node:path'?path:name==='node:crypto'?crypto:name==='./verify-release-files.cjs'?(verified++,{}):(()=>{throw Error('Unexpected module')})()});return {allowed:true,verified}}catch(e){if(e.message==='BLOCKED')return {allowed:false,verified};throw e}}
for(const [name,status]of [['blocked candidate',{...ready,status:'BLOCKED'}],['failed evidence',{...ready,checks:{rules:'FAIL'}}],['unsafe read mode',{...ready,releaseReadMode:'INDEXED'}],['activated marker',{...ready,indexMarkerActivated:true}]])test('release gate denies '+name,()=>assert.equal(run(status).allowed,false));
test('review-ready local verification checks frozen files',()=>assert.deepEqual(run(ready),{allowed:true,verified:1}));
test('production gate denies absent or stale approval',()=>{for(const approval of [undefined,'OLD-MANIFEST'])assert.equal(run(ready,{VERCEL_ENV:'production',PAYMENT_APPROVED_MANIFEST_SHA256:approval}).allowed,false)});
test('gate accepts exact synthetic manifest approval only in isolated unit test',()=>assert.deepEqual(run(ready,{VERCEL_ENV:'production',PAYMENT_APPROVED_MANIFEST_SHA256:digest}),{allowed:true,verified:1}));
